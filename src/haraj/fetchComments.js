import { postUrl } from './urls.js';
import { CONFIG } from '../config.js';
import { extractCommentsFromCommentsResponse } from './extract.js';

function parseQueryName(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'graphql.haraj.com.sa') return null;
    return u.searchParams.get('queryName');
  } catch {
    return null;
  }
}

export async function fetchCommentsInPage(page, id) {
  const targetId = String(id);
  const url = postUrl(targetId);
  let commentsJson = null;

  const onResponse = async (resp) => {
    try {
      const qn = parseQueryName(resp.url());
      if (qn !== 'comments') return;
      const ct = resp.headers()['content-type'] || '';
      if (!ct.includes('application/json')) return;
      const json = await resp.json();
      const comments = extractCommentsFromCommentsResponse(json);
      if (comments) commentsJson = json;
    } catch {
      // ignore
    }
  };

  page.on('response', onResponse);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.NAV_TIMEOUT_MS });

    const notFound = await page.locator(`text=${CONFIG.NOT_FOUND_TEXT}`).first().isVisible().catch(() => false);
    if (notFound) return { status: 'NOT_FOUND', id: targetId };

    const started = Date.now();
    while (Date.now() - started < CONFIG.RESPONSE_TIMEOUT_MS) {
      if (commentsJson) break;
      const nf = await page.locator(`text=${CONFIG.NOT_FOUND_TEXT}`).first().isVisible().catch(() => false);
      if (nf) return { status: 'NOT_FOUND', id: targetId };
      await page.waitForTimeout(250);
    }

    if (!commentsJson) return { status: 'NO_DATA', id: targetId };

    return {
      status: 'FOUND',
      id: targetId,
      comments: extractCommentsFromCommentsResponse(commentsJson),
      raw: commentsJson
    };
  } finally {
    page.off('response', onResponse);
  }
}
