
# src/posts.py
from __future__ import annotations
import nodriver as uc
import asyncio
import random
from typing import Any


from .comments import is_not_found, scroll_comments_fallback
from .config import settings
# from .contact import fetch_seller_phone
from .db import save_ad_if_new
from .graphql_capture import attach_graphql_capture
from .urls import post_url
from .browser import eval_js


async def get_captured_gql_from_window(tab, query_name: str) -> dict[str, Any] | None:
    return await eval_js(
        tab,
        """(queryName) => {
            const box = window.__HARAJ_GQL__ || {};
            const item = box[queryName];
            return item && item.json ? item.json : null;
        }""",
        query_name,
    )

def ids_for_batch(start_id: int, up: int, down: int, batch_no: int) -> list[int]:
    ids: list[int] = []

    high_start = start_id + (batch_no * up)
    low_start = start_id - 1 - (batch_no * down)

    for i in range(up):
        ids.append(high_start + i)

    for i in range(down):
        value = low_start - i
        if value > 0:
            ids.append(value)

    return ids


def ids_for_run(start_id: int, up: int, down: int, max_ids: int = 0) -> list[int]:
    ids: list[int] = []
    batch_no = 0

    while True:
        batch = ids_for_batch(start_id, up, down, batch_no)

        for item in batch:
            if item > 0 and item not in ids:
                ids.append(item)

                if max_ids and len(ids) >= max_ids:
                    return ids

        if not max_ids:
            return ids

        batch_no += 1


async def fetch_comments_direct(tab) -> dict[str, Any] | None:
    script = """
    async () => {
      const urls = performance
        .getEntriesByType("resource")
        .map(e => e.name)
        .filter(u => u.includes("graphql.haraj.com.sa") && u.includes("queryName=comments"));

      const url = urls[urls.length - 1];
      if (!url) return null;

      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "accept": "*/*",
          "content-type": "application/json",
          "referer": location.href
        },
        body: "{}"
      });

      const text = await res.text();

      return JSON.stringify({
        ok: res.ok,
        status: res.status,
        text
      });
    }
    """

    raw = await tab.evaluate(f"({script})()", await_promise=True)

    if not raw:
        return None

    import json
    result = json.loads(raw)

    if not result.get("ok"):
        print(f"[COMMENTS DIRECT] failed status={result.get('status')}")
        print(str(result.get("text"))[:500])
        return None

    return json.loads(result.get("text") or "{}")



async def install_fetch_capture(tab):
    script = r"""
    (() => {
      if (window.__HARAJ_CAPTURE_INSTALLED__) return;
      window.__HARAJ_CAPTURE_INSTALLED__ = true;
      window.__HARAJ_GQL__ = {};

      function saveGraphql(url, text) {
        try {
          if (!String(url).includes("graphql.haraj.com.sa")) return;

          const u = new URL(String(url));
          const qn = u.searchParams.get("queryName");
          if (!qn) return;

          const json = JSON.parse(text);

          window.__HARAJ_GQL__[qn] = {
            json,
            url: String(url),
            at: Date.now()
          };

          console.log("[HARAJ_CAPTURED_GQL]", qn, String(url));
        } catch (e) {
          console.log("[HARAJ_CAPTURE_ERROR]", String(e));
        }
      }

      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const res = await originalFetch.apply(this, args);

        try {
          const url = String(args[0] && args[0].url ? args[0].url : args[0]);
          if (url.includes("graphql.haraj.com.sa")) {
            const cloned = res.clone();
            const text = await cloned.text();
            saveGraphql(url, text);
          }
        } catch (e) {}

        return res;
      };

      const OriginalXHR = window.XMLHttpRequest;

      window.XMLHttpRequest = function() {
        const xhr = new OriginalXHR();
        let requestUrl = "";

        const originalOpen = xhr.open;
        xhr.open = function(method, url, ...rest) {
          requestUrl = String(url || "");
          return originalOpen.call(xhr, method, url, ...rest);
        };

        xhr.addEventListener("load", function() {
          try {
            if (requestUrl.includes("graphql.haraj.com.sa")) {
              saveGraphql(requestUrl, xhr.responseText);
            }
          } catch (e) {}
        });

        return xhr;
      };
    })();
    """

    await tab.send(
        uc.cdp.page.add_script_to_evaluate_on_new_document(source=script)
    )

async def fetch_post_graphql_in_page(tab, post_id: int | str) -> dict[str, Any] | None:
    post_id = str(post_id).strip()

    await install_fetch_capture(tab)

    capture = attach_graphql_capture(tab, ["posts", "user", "comments"])
    await capture.start()
    capture.clear()

    await tab.activate()
    await tab.get(post_url(post_id))

    ok = await capture.wait_for(["posts"], settings.response_timeout_ms)
    if not ok:
        return None

    comments_json = capture.get_json("comments")
    
    if comments_json is None and settings.comment_refresh_scroll_fallback:
        await scroll_comments_fallback(tab)
        await capture.wait_for(["comments"], 10_000)
        comments_json = capture.get_json("comments")

    if comments_json is None:
        comments_json = await get_captured_gql_from_window(tab, "comments")
    if comments_json is None:
        comments_json = await fetch_comments_direct(tab)

    return {
        "posts": capture.get_json("posts"),
        "user": capture.get_json("user"),
        "comments": comments_json,
    }


async def scrape_one(browser, post_id: int | str, sem: asyncio.Semaphore) -> None:
    async with sem:
        tab = await browser.get("about:blank", new_tab=True)
        haraj_url_id = str(post_id).strip()

        try:
            print(f"[SCRAPE] Open {post_url(haraj_url_id)}")

            gql_payloads = await fetch_post_graphql_in_page(tab, haraj_url_id)

            if await is_not_found(tab):
                print(f"[SCRAPE] {haraj_url_id} not found")
                return

            if not isinstance(gql_payloads, dict):
                print(f"[SCRAPE] {haraj_url_id} no posts GraphQL")
                return

            posts_json = gql_payloads.get("posts")
            if not isinstance(posts_json, dict):
                print(f"[SCRAPE] {haraj_url_id} no posts GraphQL")
                return

            items = (
                ((posts_json.get("data") or {})
                 .get("posts") or {})
                .get("items") or []
            )

            if not items:
                print(f"[SCRAPE] {haraj_url_id} item=null, skip DB")
                return

            post = items[0]
            real_post_id = str(post.get("id") or haraj_url_id).strip()

            comments_json = gql_payloads.get("comments")
            user_json = gql_payloads.get("user")
            user_item = (
                ((user_json or {}).get("data") or {})
                .get("user")
            )
            contact = {
                "id": user_item.get("id") if isinstance(user_item, dict) else None,
                "username": user_item.get("username") if isinstance(user_item, dict) else None,
                "mobile": user_item.get("mobile") if isinstance(user_item, dict) else None,
                "email": user_item.get("email") if isinstance(user_item, dict) else None,
            }

            comments_block: dict[str, Any] = {}
            if isinstance(comments_json, dict):
                comments_block = {
                    "json": comments_json,
                    "url": "captured_from_browser",
                }

            user_block: dict[str, Any] = {}
            if isinstance(user_json, dict):
                user_block = {
                    "json": user_json,
                    "url": "captured_from_browser",
                }

            # 4) Save one MongoDB document, posts + user + comments together
            ad = {
                "status": "FOUND",
                "postId": real_post_id,
                "harajUrlId": haraj_url_id,
                "url": post_url(haraj_url_id),
                "contact": contact,
                "gql": {
                    "posts": {
                        "json": posts_json,
                        "url": "captured_from_browser",
                    },
                    "user": user_block,
                    "comments": comments_block,
                },
            }

            result = await save_ad_if_new(ad)

            comments_count = len(
                (((comments_json or {}).get("data") or {})
                 .get("comments") or {})
                .get("items") or []
            )

            print(
                f"[SCRAPE] Saved urlId={haraj_url_id} realId={real_post_id} "
                f"inserted={result.get('inserted')} "
                f"contactMobile={contact.get('mobile')} "
                f"comments={comments_count}"
            )

        except Exception as exc:
            import traceback
            print(f"[SCRAPE] Error {haraj_url_id}: {exc!r}")
            traceback.print_exc()

        finally:
            try:
                await tab.close()
            except Exception:
                pass

            await asyncio.sleep(
                random.randint(settings.min_delay_ms, settings.max_delay_ms) / 1000
            )


async def scrape_ids(browser, ids: list[int]) -> None:
    total_concurrency = max(1, settings.concurrency_up + settings.concurrency_down)
    sem = asyncio.Semaphore(total_concurrency)

    if settings.max_ids_per_run and settings.max_ids_per_run > 0:
        await asyncio.gather(*(scrape_one(browser, pid, sem) for pid in ids))
        return

    batch_no = 0

    while True:
        batch = ids_for_batch(
            settings.startid,
            settings.concurrency_up,
            settings.concurrency_down,
            batch_no,
        )

        print(f"[MAIN] Scraping batch {batch_no + 1}: {batch}")

        await asyncio.gather(*(scrape_one(browser, pid, sem) for pid in batch))

        batch_no += 1
        await asyncio.sleep(1)