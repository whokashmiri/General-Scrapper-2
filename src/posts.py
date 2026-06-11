from __future__ import annotations
import nodriver as uc
import asyncio
import random
from typing import Any


from .comments import fetch_comments_in_page, is_not_found
from .config import settings
from .contact import fetch_seller_phone
from .db import save_ad_if_new
from .extract import extract_posts_from_posts_response
from .graphql_capture import attach_graphql_capture
from .urls import post_url
from .browser import eval_js


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
    post_id = str(post_id)

    capture = attach_graphql_capture(tab, ["posts"])
    await capture.start()
    capture.clear()

    await tab.activate()
    await tab.get(post_url(post_id))

    ok = await capture.wait_for(["posts"], settings.response_timeout_ms)

    if not ok:
        return None

    return capture.get_json("posts")


async def scrape_one(browser, post_id: int | str, sem: asyncio.Semaphore) -> None:
    async with sem:
        tab = await browser.get("about:blank", new_tab=True)
        haraj_url_id = str(post_id).strip()

        try:
            print(f"[SCRAPE] Open {post_url(haraj_url_id)}")

            # 1) Capture posts GraphQL only
            posts_json = await fetch_post_graphql_in_page(tab, haraj_url_id)

            if await is_not_found(tab):
                print(f"[SCRAPE] {haraj_url_id} not found")
                return

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

            # 2) Contact may require UI click, but saved data is still ad + GraphQL
            try:
                phone = await fetch_seller_phone(tab)
            except Exception as exc:
                print(f"[CONTACT] Error {haraj_url_id}: {exc!r}")
                phone = None

            # 3) Capture comments GraphQL only
            try:
                comments_result = await fetch_comments_in_page(tab, haraj_url_id)
            except Exception as exc:
                print(f"[COMMENTS] Error {haraj_url_id}: {exc!r}")
                comments_result = None

            if not isinstance(comments_result, dict):
                comments_result = {}

            comments_raw = None
            if comments_result.get("status") == "FOUND":
                raw = comments_result.get("raw")
                if isinstance(raw, dict):
                    comments_raw = raw

            comments_block = {}
            if comments_raw:
                comments_block = {
                    "json": comments_raw,
                    "url": "captured_from_browser",
                }

            # 4) Save one MongoDB document, posts + comments together
            ad = {
                "status": "FOUND",
                "postId": real_post_id,
                "harajUrlId": haraj_url_id,
                "url": post_url(haraj_url_id),
                "phone": phone,
                "gql": {
                    "posts": {
                        "json": posts_json,
                        "url": "captured_from_browser",
                    },
                    "comments": comments_block,
                },
            }

            result = await save_ad_if_new(ad)

            comments_count = len(
                (((comments_raw or {}).get("data") or {})
                 .get("comments") or {})
                .get("items") or []
            )

            print(
                f"[SCRAPE] Saved urlId={haraj_url_id} realId={real_post_id} "
                f"inserted={result.get('inserted')} phone={phone} "
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