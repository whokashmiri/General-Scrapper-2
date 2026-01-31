// src/workers/scanUp.js
import { processAd } from "./processAd.js";
import { saveAdIfNew } from "../db/adsRepo.js";
import { sleep } from "../utils/sleep.js";
import { attachGraphqlCapture } from "../haraj/graphqlCapture.js";

export async function startScanUp(page) {
  const capture = attachGraphqlCapture(page);

  let id = BigInt(process.env.START_ID);
  let pending = [];
  const maxProbeForward = 10;

  let netBackoff = 2000; // start 2s

  while (true) {
    const res = await processAd(page, id.toString(), capture);

    // ✅ INTERNET DOWN: retry same id with exponential backoff
    if (res.status === "NET_DOWN") {
      console.log(`[NEW] Internet down. Backing off ${netBackoff}ms...`, res.error);
      await sleep(netBackoff);
      netBackoff = Math.min(netBackoff * 2, 60_000); // cap 60s
      continue; // retry SAME id
    } else {
      netBackoff = 2000; // reset once network is ok
    }

    if (res.status === "FOUND") {
      await saveAdIfNew(res);
      id = id + 1n;
      pending = []; // optional: clear pending when we are finding new ads again
      await sleep(250 + Math.floor(Math.random() * 450));
      continue;
    }

    // If NOT_FOUND or NAV_FAILED: probe forward a bit
    for (let i = 0; i < maxProbeForward; i++) {
      pending.push(id);

      await sleep(1200 + Math.floor(Math.random() * 800));
      id = id + 1n;

      const r2 = await processAd(page, id.toString(), capture);

      if (r2.status === "NET_DOWN") {
        // network dropped during probing → stop probing, retry later on same id
        id = id - 1n; // roll back to retry this id next time
        console.log(`[NEW] Internet down during probe. Backing off ${netBackoff}ms...`, r2.error);
        await sleep(netBackoff);
        netBackoff = Math.min(netBackoff * 2, 60_000);
        break;
      } else {
        netBackoff = 2000;
      }

      if (r2.status === "FOUND") {
        await saveAdIfNew(r2);
        id = id + 1n;
        pending = []; // optional: clear pending when we catch up
        await sleep(250 + Math.floor(Math.random() * 450));
        break;
      }
    }

    // ✅ Recheck pending IDs (the “wait & retry” logic)
    if (pending.length) {
      const recheck = pending.shift();
      await sleep(4000 + Math.floor(Math.random() * 2000));

      const r3 = await processAd(page, recheck.toString(), capture);

      if (r3.status === "NET_DOWN") {
        // Put it back and wait
        pending.unshift(recheck);
        console.log(`[NEW] Internet down during recheck. Backing off ${netBackoff}ms...`, r3.error);
        await sleep(netBackoff);
        netBackoff = Math.min(netBackoff * 2, 60_000);
        continue;
      } else {
        netBackoff = 2000;
      }

      if (r3.status === "FOUND") {
        await saveAdIfNew(r3);
      } else {
        // keep retrying this id later
        pending.push(recheck);
      }
    }
  }
}
