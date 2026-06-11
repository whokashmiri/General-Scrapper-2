import asyncio
import nodriver as uc

async def main():
    print("Starting")

    browser = await uc.start(
        headless=False,
        no_sandbox=True,
    )

    print("Connected")

    page = await browser.get("https://google.com")

    print("Navigated")

    await asyncio.sleep(30)

asyncio.run(main())