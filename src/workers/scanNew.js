import { CONFIG } from '../config.js';
import { scrapeAdInPage } from '../haraj/scrapeAd.js';
import { upsertAd } from '../db/adsRepo.js';
import { sleep, jitter } from '../utils/time.js';

export async function runScanNew(page, startId) {
  let id = BigInt(startId);
  let gapTries = 0;

  // Pending IDs to re-check (so we don't miss IDs created a few seconds late)
  const pending = []; // {id: BigInt, addedAt: number}

  const enqueuePending = (pid) => {
    if (pending.some(p => p.id === pid)) return;
    pending.push({ id: pid, addedAt: Date.now() });
  };

  const pickPending = () => pending.shift() || null;

  while (true) {
    const curId = id;

    const res = await scrapeAdInPage(page, curId.toString());

    if (res.status === 'FOUND') {
      gapTries = 0;
      await upsertAd({
        postId: res.id,
        post: res.post,
        comments: res.comments || undefined,
        createdAtFromPost: res.createdAtFromPost || undefined,
        direction: 'up',
        raw: res.raw
      });
      id = curId + 1n;
      await sleep(jitter(350));
      continue;
    }

    // NOT_FOUND or NO_DATA
    enqueuePending(curId);
    gapTries += 1;

    if (gapTries <= CONFIG.NEW_MAX_FORWARD_PROBES_ON_GAP) {
      id = curId + 1n;
      await sleep(jitter(CONFIG.NEW_WAIT_MS));
      continue;
    }

    // After probing forward up to 10, wait longer and retry the oldest pending ID
    await sleep(jitter(CONFIG.NEW_WAIT_LONG_MS));
    const p = pickPending();
    if (p) {
      id = p.id;
    } else {
      // Shouldn't happen, but just keep moving forward
      id = curId + 1n;
    }
    gapTries = 0;
  }
}
