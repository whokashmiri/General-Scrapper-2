import 'dotenv/config';

const bool = (v, def = false) => {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  if (["1","true","yes","y","on"].includes(s)) return true;
  if (["0","false","no","n","off"].includes(s)) return false;
  return def;
};

export const CONFIG = Object.freeze({
  MONGODB_URI: process.env.MONGODB_URI,
  DB_NAME: process.env.DB_NAME || 'test',
  HEADLESS: bool(process.env.HEADLESS, true),
  START_ID: String(process.env.START_ID || '').trim(),
  DEBUG_CONTACT: bool(process.env.DEBUG_CONTACT, false),

  TZ: process.env.TZ || 'Asia/Riyadh',

  REPORT_TO_EMAIL: process.env.REPORT_TO_EMAIL,
  REPORT_FROM_EMAIL: process.env.REPORT_FROM_EMAIL,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,

  HARAJ_USERNAME: process.env.HARAJ_USERNAME || '',
  HARAJ_PASSWORD: process.env.HARAJ_PASSWORD || '',

  // Runtime knobs
  NOT_FOUND_TEXT: 'العرض محذوف او قديم.شاهد العروض المشابهة في الأسفل',
  NEW_WAIT_MS: Number(process.env.NEW_WAIT_MS || 2500),
  NEW_WAIT_LONG_MS: Number(process.env.NEW_WAIT_LONG_MS || 8000),
  OLD_WAIT_MS: Number(process.env.OLD_WAIT_MS || 800),
  NAV_TIMEOUT_MS: Number(process.env.NAV_TIMEOUT_MS || 25000),
  RESPONSE_TIMEOUT_MS: Number(process.env.RESPONSE_TIMEOUT_MS || 20000),

  OLD_MAX_MISS_STREAK: Number(process.env.OLD_MAX_MISS_STREAK || 200),
  NEW_MAX_FORWARD_PROBES_ON_GAP: Number(process.env.NEW_MAX_FORWARD_PROBES_ON_GAP || 10),

  COMMENTS_REFRESH_MIN_AGE_HOURS: Number(process.env.COMMENTS_REFRESH_MIN_AGE_HOURS || 24),
  COMMENTS_REFRESH_INTERVAL_MINUTES: Number(process.env.COMMENTS_REFRESH_INTERVAL_MINUTES || 60),
  COMMENTS_REFRESH_BATCH: Number(process.env.COMMENTS_REFRESH_BATCH || 30)
});

export function assertConfig() {
  if (!CONFIG.MONGODB_URI) throw new Error('Missing MONGODB_URI');
  if (!CONFIG.START_ID) throw new Error('Missing START_ID');

  // Email is optional; only required if you want daily email reports
  const emailConfigured =
    CONFIG.REPORT_TO_EMAIL &&
    CONFIG.REPORT_FROM_EMAIL &&
    CONFIG.SMTP_HOST &&
    CONFIG.SMTP_PORT &&
    CONFIG.SMTP_USER &&
    CONFIG.SMTP_PASS;

  return { emailConfigured };
}
