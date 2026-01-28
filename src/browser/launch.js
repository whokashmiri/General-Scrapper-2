import { chromium } from 'playwright';
import { CONFIG } from '../config.js';

export async function launchBrowser() {
  const browser = await chromium.launch({
    headless: CONFIG.HEADLESS,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox'
    ]
  });

  const context = await browser.newContext({
    locale: 'ar-SA',
    viewport: { width: 1300, height: 900 }
  });

  // Slightly more realistic
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return { browser, context };
}
