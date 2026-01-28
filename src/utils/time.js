export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function jitter(baseMs, spreadMs = 0.3) {
  const spread = Math.max(0, baseMs * spreadMs);
  const delta = (Math.random() * 2 - 1) * spread;
  return Math.max(0, Math.round(baseMs + delta));
}

export function now() {
  return new Date();
}
