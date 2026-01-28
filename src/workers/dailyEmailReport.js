import cron from 'node-cron';
import { CONFIG } from '../config.js';
import { countAdsSince } from '../db/adsRepo.js';
import { sendReportEmail, isEmailConfigured } from '../utils/mailer.js';

export function startDailyEmailReport() {
  if (!isEmailConfigured()) {
    console.warn('[EMAIL] SMTP/report env not fully configured; daily reports disabled.');
    return;
  }

  // Every day at 00:05 in configured TZ
  cron.schedule(
    '5 0 * * *',
    async () => {
      const now = new Date();
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const count = await countAdsSince(since);

      const subject = `Haraj scraper daily report (${CONFIG.TZ})`;
      const text = [
        `Time: ${now.toISOString()}`,
        `Ads added in last 24h: ${count}`
      ].join('\n');

      await sendReportEmail({ subject, text });
      console.log('[EMAIL] Daily report sent.');
    },
    { timezone: CONFIG.TZ }
  );

  console.log(`[EMAIL] Daily report scheduled (00:05 ${CONFIG.TZ}).`);
}
