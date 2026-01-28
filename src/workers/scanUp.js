// src/workers/scanUp.js
import { processAd } from "./processAd.js";
import { saveAdIfNew } from "../db/adsRepo.js";
import { sleep } from "../utils/sleep.js";
import { attachGraphqlCapture } from "../haraj/graphqlCapture.js"; // ✅ ADD

export async function startScanUp(page) {
  const capture = attachGraphqlCapture(page); // ✅ ADD

  let id = BigInt(process.env.START_ID);
  let pending = [];
  const maxProbeForward = 10;

  while (true) {
    const res = await processAd(page, id.toString(), capture); // ✅ PASS capture

    if (res.status === "FOUND") {
      await saveAdIfNew(res);
      id = id + 1n;
      continue;
    }

    for (let i = 0; i < maxProbeForward; i++) {
      pending.push(id);
      await sleep(1200 + Math.floor(Math.random() * 800));
      id = id + 1n;

      const r2 = await processAd(page, id.toString(), capture); // ✅ PASS capture
      if (r2.status === "FOUND") {
        await saveAdIfNew(r2);
        id = id + 1n;
        break;
      }
    }

    if (pending.length) {
      const recheck = pending.shift();
      await sleep(4000 + Math.floor(Math.random() * 2000));
      const r3 = await processAd(page, recheck.toString(), capture); // ✅ PASS capture
      if (r3.status === "FOUND") await saveAdIfNew(r3);
      else pending.push(recheck);
    }
  }
}
