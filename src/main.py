from __future__ import annotations

import asyncio

import nodriver as uc

from .auth import ensure_logged_in
from .browser import save_cookies, start_browser
from .comments import refresh_comments_loop
from .config import settings
from .db import ensure_indexes
from .posts import ids_for_run, scrape_ids
from .urls import BASE_URL


async def amain() -> None:
    await ensure_indexes()

    browser = await start_browser()

    try:
        tab = await browser.get(BASE_URL)
        await ensure_logged_in(browser, tab)
        await save_cookies(browser)

        refresh_task = None

        if settings.refresh_comments_enabled:
            refresh_task = asyncio.create_task(refresh_comments_loop(browser))

        ids = ids_for_run(
            settings.startid,
            settings.concurrency_up,
            settings.concurrency_down,
            settings.max_ids_per_run,
        )

        if settings.max_ids_per_run and settings.max_ids_per_run > 0:
            print(f"[MAIN] Scraping IDs: {ids}")
        else:
            print("[MAIN] Scraping continuously in batches")

        await scrape_ids(browser, ids)

        if refresh_task:
            print(
                "[MAIN] Initial scrape finished. "
                "Comment refresh is enabled; keeping browser alive."
            )
            await refresh_task

    finally:
        try:
            browser.stop()
        except Exception:
            pass


def main() -> None:
    uc.loop().run_until_complete(amain())


if __name__ == "__main__":
    main()