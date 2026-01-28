// src/workers/refreshComments.js
import { findAdsForCommentRefresh, updateComments } from "../db/adsRepo.js";
import { attachGraphqlCapture } from "../haraj/graphqlCapture.js";
import { sleep } from "../utils/sleep.js";

async function fetchFreshComments(page, capture, postId) {
  capture.clear();

  await page.goto(`https://haraj.com.sa/${postId}`, { waitUntil: "domcontentloaded" });

  // Wait for comments GraphQL
  let ok = await capture.waitFor({ want: ["comments"], timeoutMs: 15_000 });

  // Some pages trigger comments after scroll — one safe scroll fallback
  if (!ok) {
    await page.mouse.wheel(0, 1400).catch(() => null);
    ok = await capture.waitFor({ want: ["comments"], timeoutMs: 10_000 });
  }

  const payload = capture.get("comments"); // { json, url, at }
  return payload?.json ?? null;
}

export function startRefreshComments(context) {
  (async () => {
    const page = await context.newPage(); // hidden/background tab
    const capture = attachGraphqlCapture(page, { includeQueryNames: ["comments"] });

    while (true) {
      try {
        console.log("[COMMENTS] Daily refresh started...");

        const ads = await findAdsForCommentRefresh({ olderThanHours: 24, limit: 500 });
        console.log(`[COMMENTS] ${ads.length} ads need comment refresh`);

        for (const a of ads) {
          const postId = String(a._id || a.haraj_id || "").trim();
          if (!postId) continue;

          const commentsJson = await fetchFreshComments(page, capture, postId);
          await updateComments(postId, commentsJson);

          console.log(`[COMMENTS] Updated ${postId}`);
          await sleep(600 + Math.floor(Math.random() * 600));
        }

        console.log("[COMMENTS] Daily refresh finished.");
      } catch (e) {
        console.error("[COMMENTS] refresh error:", e);
      }

      // ✅ run once every 24 hours
      await sleep(24 * 60 * 60 * 1000);
    }
  })();
}
