import { CONFIG } from '../config.js';
import { scrapeAdInPage } from '../haraj/scrapeAd.js';
import { upsertAd } from '../db/adsRepo.js';
import { sleep, jitter } from '../utils/time.js';

export async function runScanOld(page, startId) {
  let id = BigInt(startId) - 1n;
  let missStreak = 0;

  while (true) {
    const curId = id;
    const res = await scrapeAdInPage(page, curId.toString());

    if (res.status === 'FOUND') {
      missStreak = 0;
      await upsertAd({
        postId: res.id,
        post: res.post,
        comments: res.comments || undefined,
        createdAtFromPost: res.createdAtFromPost || undefined,
        direction: 'down',
        raw: res.raw
      });
      id = curId - 1n;
      await sleep(jitter(350));
      continue;
    }

    // NOT_FOUND or NO_DATA
    missStreak += 1;
    id = curId - 1n;

    if (missStreak >= CONFIG.OLD_MAX_MISS_STREAK) {
      console.log(`[OLD] missStreak reached ${CONFIG.OLD_MAX_MISS_STREAK}. Stopping old scan.`);
      return;
    }

    await sleep(jitter(CONFIG.OLD_WAIT_MS));
  }
}
