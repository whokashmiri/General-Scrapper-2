// src/workers/processAd.js
import { isAdNotFound } from "../haraj/notFound.js";
import { fetchSellerPhone } from "../haraj/contact.js";

export function buildPostUrl(postId) {
  return `https://haraj.com.sa/${postId}`;
}

async function ensurePageReady(page) {
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(120).catch(() => null);
}

function isNetworkDown(err) {
  const msg = String(err?.message || err || "");
  return (
    msg.includes("ERR_INTERNET_DISCONNECTED") ||
    msg.includes("ERR_NETWORK_CHANGED") ||
    msg.includes("ERR_NAME_NOT_RESOLVED") ||
    msg.includes("ERR_CONNECTION_RESET") ||
    msg.includes("ERR_CONNECTION_REFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("Timeout")
  );
}

async function safeGoto(page, url, timeoutMs = 30000) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e, networkDown: isNetworkDown(e) };
  }
}

export async function processAd(page, postId, capture) {
  const url = buildPostUrl(postId);

  await ensurePageReady(page);

  // clear capture before nav
  capture?.clear?.();

  const nav = await safeGoto(page, url, 30000);
  if (!nav.ok) {
    return {
      status: nav.networkDown ? "NET_DOWN" : "NAV_FAILED",
      postId: String(postId),
      url,
      error: String(nav.error?.message || nav.error),
    };
  }

  console.log("[NAV]", postId, page.url());

  if (await isAdNotFound(page)) {
    return { status: "NOT_FOUND", postId: String(postId), url };
  }

  // wait for GraphQL after nav
  await capture?.waitFor?.({ want: ["posts", "comments"], timeoutMs: 15_000 }).catch(() => null);
  const gql = capture?.all?.() ?? null;

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
