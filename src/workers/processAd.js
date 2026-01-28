// src/workers/processAd.js
import { isAdNotFound } from "../haraj/notFound.js";
import { fetchSellerPhone } from "../haraj/contact.js";

export function buildPostUrl(postId) {
  return `https://haraj.com.sa/${postId}`;
}

// Close any stuck overlay before doing anything (prevents “scrolling” / blocked clicks)
async function ensurePageReady(page) {
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(120).catch(() => null);

  // If any close button exists for overlays, click it (best-effort)
  const closeBtn = page.locator('button:has(svg[data-icon="times"])');
  if (await closeBtn.count().catch(() => 0)) {
    await closeBtn.first().click({ timeout: 1000 }).catch(() => null);
    await page.waitForTimeout(120).catch(() => null);
  }
}

export async function processAd(page, postId, capture) {
  const url = buildPostUrl(postId);

  await ensurePageReady(page);

  // IMPORTANT: clear capture BEFORE navigation
  capture?.clear?.();

  // IMPORTANT: navigate so posts/comments XHR fires
  await page.goto(url, { waitUntil: "domcontentloaded" });
  console.log("[NAV]", postId, page.url());

  // NOT_FOUND check after navigation
  if (await isAdNotFound(page)) {
    return { status: "NOT_FOUND", postId, url };
  }

  // Wait for GraphQL data after navigation
  await capture?.waitFor?.({ want: ["posts", "comments"], timeoutMs: 15_000 });

  const gql = capture?.all?.() ?? null;

  // Phone modal + extraction
  const phone = await fetchSellerPhone(page).catch(() => null);

  return {
    status: "FOUND",
    postId: String(postId),
    url,
    phone,
    gql,
    fetchedAt: new Date(),
  };
}
