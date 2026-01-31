// src/workers/scanDown.js
import { processAd } from "./processAd.js";
import { saveAdIfNew } from "../db/adsRepo.js";
import { sleep } from "../utils/sleep.js";
import { attachGraphqlCapture } from "../haraj/graphqlCapture.js";

export async function startScanDown(page) {
  const capture = attachGraphqlCapture(page);
  let id = BigInt(process.env.START_ID) - 1n;
  let missStreak = 0;
  let netBackoff = 2000; // start 2s

  while (true) {
    const res = await processAd(page, id.toString(), capture);

    if (res.status === "NET_DOWN") {
      console.log(`[OLD] Internet down. Backing off ${netBackoff}ms...`, res.error);
      await sleep(netBackoff);
      netBackoff = Math.min(netBackoff * 2, 60_000); // cap 60s
      continue; // retry SAME id
    } else {
      netBackoff = 2000; // reset backoff on success/failure that isn't net down
    }

    if (res.status === "FOUND") {
      missStreak = 0;
      await saveAdIfNew(res);
      id = id - 1n;
      await sleep(300 + Math.floor(Math.random() * 500));
      continue;
    }

    // NOT_FOUND / NAV_FAILED
    missStreak += 1;
    id = id - 1n;

    if (missStreak >= 200) {
      console.log("[OLD] 200 consecutive NOT_FOUND. Stopping old scan; new scan continues.");
      return;
    }

    await sleep(250 + Math.floor(Math.random() * 450));
  }
}
