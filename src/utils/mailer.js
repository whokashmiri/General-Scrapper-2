import nodemailer from 'nodemailer';
import { CONFIG } from '../config.js';

export function isEmailConfigured() {
  return Boolean(
    CONFIG.REPORT_TO_EMAIL &&
      CONFIG.REPORT_FROM_EMAIL &&
      CONFIG.SMTP_HOST &&
      CONFIG.SMTP_PORT &&
      CONFIG.SMTP_USER &&
      CONFIG.SMTP_PASS
  );
}

export function createTransport() {
  return nodemailer.createTransport({
    host: CONFIG.SMTP_HOST,
    port: CONFIG.SMTP_PORT,
    secure: false,
    auth: {
      user: CONFIG.SMTP_USER,
      pass: CONFIG.SMTP_PASS
    }
  });
}

export async function sendReportEmail({ subject, text }) {
  if (!isEmailConfigured()) {
    console.warn('[EMAIL] Not configured; skipping email report');
    return;
  }
  const transport = createTransport();
  await transport.sendMail({
    from: CONFIG.REPORT_FROM_EMAIL,
    to: CONFIG.REPORT_TO_EMAIL,
    subject,
    text
  });
}
