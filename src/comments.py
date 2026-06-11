from __future__ import annotations

import asyncio
import random
from typing import Any

from .browser import eval_js
from .config import settings
from .db import find_ads_for_comment_refresh, update_comments
from .extract import extract_comments_from_comments_response
from .graphql_capture import attach_graphql_capture
from .urls import post_url


NOT_FOUND_TEXT = "الصفحة غير موجودة"


async def is_not_found(tab) -> bool:
    try:
        return bool(
            await eval_js(
                tab,
                """(needle) => document.body && document.body.innerText.includes(needle)""",
                NOT_FOUND_TEXT,
            )
        )
    except Exception:
        return False


async def scroll_comments_fallback(tab) -> None:
    try:
        await tab.scroll_down(1400)
    except Exception:
        await eval_js(tab, """() => { window.scrollBy(0, 1400); return true; }""")


async def fetch_comments_in_page(tab, post_id: int | str) -> dict[str, Any]:
    target_id = str(post_id).strip()

    capture = attach_graphql_capture(tab, ["comments"])
    await capture.start()
    capture.clear()

    await tab.activate()
    await tab.browser.get(post_url(target_id))
    await asyncio.sleep(0.5)

    if await is_not_found(tab):
        return {"status": "NOT_FOUND", "id": target_id}

    ok = await capture.wait_for(["comments"], settings.response_timeout_ms)

    if not ok and settings.comment_refresh_scroll_fallback:
        await scroll_comments_fallback(tab)
        ok = await capture.wait_for(["comments"], 10_000)

    if await is_not_found(tab):
        return {"status": "NOT_FOUND", "id": target_id}

    comments_json = capture.get_json("comments")

    if not ok or not comments_json:
        return {"status": "NO_DATA", "id": target_id}

    return {
        "status": "FOUND",
        "id": target_id,
        "comments": extract_comments_from_comments_response(comments_json) or [],
        "raw": comments_json,
    }


async def fetch_fresh_comments(tab, capture, post_id: int | str) -> dict[str, Any] | None:
    target_id = str(post_id).strip()

    capture.clear()

    await tab.activate()
    await tab.browser.get(post_url(target_id))
    await asyncio.sleep(0.5)

    if await is_not_found(tab):
        print(f"[COMMENTS] {target_id} not found during refresh")
        return None

    ok = await capture.wait_for(["comments"], 15_000)

    if not ok and settings.comment_refresh_scroll_fallback:
        await scroll_comments_fallback(tab)
        ok = await capture.wait_for(["comments"], 10_000)

    comments_json = capture.get_json("comments")

    if not ok or not comments_json:
        return None

    return comments_json


async def refresh_comments_loop(browser) -> None:
    if not settings.refresh_comments_enabled:
        print("[COMMENTS] Refresh disabled")
        return

    tab = await browser.get("about:blank", new_tab=True)

    capture = attach_graphql_capture(tab, ["comments"])
    await capture.start()

    while True:
        try:
            print("[COMMENTS] Refresh started...")

            rows = await find_ads_for_comment_refresh(
                older_than_hours=settings.refresh_comments_older_than_hours,
                limit=settings.refresh_comments_limit,
            )

            print(f"[COMMENTS] {len(rows)} ads need comment refresh")

            for row in rows:
                post_id = str(row.get("postId") or row.get("_id") or "").strip()
                if not post_id:
                    continue

                comments_json = await fetch_fresh_comments(tab, capture, post_id)
                await update_comments(post_id, comments_json)

                print(f"[COMMENTS] Updated {post_id}")

                delay = random.randint(settings.min_delay_ms, settings.max_delay_ms) / 1000
                await asyncio.sleep(delay)

            print("[COMMENTS] Refresh finished.")

        except Exception as exc:
            print(f"[COMMENTS] refresh error: {exc!r}")

        await asyncio.sleep(settings.refresh_comments_every_hours * 60 * 60)