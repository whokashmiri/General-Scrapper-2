import nodemailer from "nodemailer";
import { countAdsAddedSince } from "../db/adsRepo.js";
import { sleep } from "../utils/sleep.js";

export function startDailyEmailReport() {
  const {
    REPORT_TO_EMAIL,
    REPORT_FROM_EMAIL,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    TZ,
  } = process.env;

  if (!REPORT_TO_EMAIL || !REPORT_FROM_EMAIL || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log("[EMAIL] email env not fully set; daily report disabled.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  async function runOnce() {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const count = await countAdsAddedSince(since);

    const subject = `Haraj report: ads added last 24h (${TZ || "local"})`;
    const text = `Ads added in last 24 hours: ${count}\nFrom: ${since.toISOString()}\nTo:   ${now.toISOString()}\n`;

    await transporter.sendMail({
      from: REPORT_FROM_EMAIL,
      to: REPORT_TO_EMAIL,
      subject,
      text,
    });

    console.log("[EMAIL] sent daily report", { count });
  }

  (async () => {
    while (true) {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 5) {
        await runOnce().catch((e) => console.error("[EMAIL] failed:", e?.message || e));
        await sleep(61_000);
      } else {
        await sleep(30_000);
      }
    }
  })();
}
