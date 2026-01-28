// src/index.js
import { chromium } from "playwright";
import dotenv from "dotenv";
dotenv.config();

import { ensureLoggedIn } from "./haraj/login.js";
import { startScanUp } from "./workers/scanUp.js";
import { startScanDown } from "./workers/scanDown.js";
import { startRefreshComments } from "./workers/refreshComments.js";
import { startDailyEmailReport } from "./workers/dailyReportEmail.js";

const START_ID = process.env.START_ID;

(async () => {
  const browser = await chromium.launch({
    headless: String(process.env.HEADLESS).toLowerCase() === "true",
  });

  const context = await browser.newContext();

  // Create ONLY TWO tabs
  const pageUp = await context.newPage();
  const pageDown = await context.newPage();

  // ✅ Make both tabs load a real page immediately (prevents blank tab)
  await Promise.all([
    pageUp.goto("https://haraj.com.sa", { waitUntil: "domcontentloaded" }),
    pageDown.goto("https://haraj.com.sa", { waitUntil: "domcontentloaded" }),
  ]);

  // ✅ Login using pageUp
  await ensureLoggedIn(pageUp, {
    username: process.env.HARAJ_USERNAME,
    password: process.env.HARAJ_PASSWORD,
  });

  // ✅ Put each tab on its initial ID so you see movement right away
  const startUpUrl = `https://haraj.com.sa/${START_ID}`;
  const startDownUrl = `https://haraj.com.sa/${(BigInt(START_ID) - 1n).toString()}`;

  await Promise.all([
    pageUp.goto(startUpUrl, { waitUntil: "domcontentloaded" }),
    pageDown.goto(startDownUrl, { waitUntil: "domcontentloaded" }),
  ]);

  // Start workers
  startScanUp(pageUp);
  startScanDown(pageDown);

  // Background jobs
  startRefreshComments(context);
  startDailyEmailReport();

  console.log("Haraj scraper started with 2 tabs.");
})();
