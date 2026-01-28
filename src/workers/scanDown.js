// src/workers/scanDown.js
import { processAd } from "./processAd.js";
import { saveAdIfNew } from "../db/adsRepo.js";
import { sleep } from "../utils/sleep.js";
import { attachGraphqlCapture } from "../haraj/graphqlCapture.js"; // ✅ ADD

export async function startScanDown(page) {
  const capture = attachGraphqlCapture(page); // ✅ ADD

  let id = BigInt(process.env.START_ID) - 1n;
  let missStreak = 0;

  while (true) {
    const res = await processAd(page, id.toString(), capture); // ✅ PASS capture

    if (res.status === "FOUND") {
      missStreak = 0;
      await saveAdIfNew(res);
      id = id - 1n;
      await sleep(300 + Math.floor(Math.random() * 500));
      continue;
    }

    missStreak += 1;
    id = id - 1n;

    if (missStreak >= 200) {
      console.log("[OLD] 200 consecutive NOT_FOUND. Stopping old scan; new scan continues.");
      return;
    }

    await sleep(250 + Math.floor(Math.random() * 450));
  }
}
