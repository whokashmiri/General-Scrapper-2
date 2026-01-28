import { postUrl } from './urls.js';
import { CONFIG } from '../config.js';
import { extractPostFromPostsResponse, extractCommentsFromCommentsResponse } from './extract.js';

function parseQueryName(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'graphql.haraj.com.sa') return null;
    return u.searchParams.get('queryName');
  } catch {
    return null;
  }
}

export async function scrapeAdInPage(page, id) {
  const targetId = String(id);
  const url = postUrl(targetId);

  let postsJson = null;
  let commentsJson = null;

  const onResponse = async (resp) => {
    try {
      const qn = parseQueryName(resp.url());
      if (!qn) return;

      // We only care about JSON responses
      const ct = resp.headers()['content-type'] || '';
      if (!ct.includes('application/json')) return;

      const json = await resp.json();
      if (qn === 'posts' && !postsJson) {
        // Make sure it contains the target post (best effort)
        const post = extractPostFromPostsResponse(json, targetId);
        if (post) postsJson = json;
      }
      if (qn === 'comments' && !commentsJson) {
        // comments may not include id directly; accept first comments response after navigation
        const comments = extractCommentsFromCommentsResponse(json);
        if (comments) commentsJson = json;
      }
    } catch {
      // ignore
    }
  };

  page.on('response', onResponse);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.NAV_TIMEOUT_MS });

    // Quick NOT_FOUND phrase check
    const notFound = await page.locator(`text=${CONFIG.NOT_FOUND_TEXT}`).first().isVisible().catch(() => false);
    if (notFound) {
      return { status: 'NOT_FOUND', id: targetId, url };
    }

    // Wait for either: postsJson captured OR notfound phrase appears
    const started = Date.now();
    while (Date.now() - started < CONFIG.RESPONSE_TIMEOUT_MS) {
      const nf = await page.locator(`text=${CONFIG.NOT_FOUND_TEXT}`).first().isVisible().catch(() => false);
      if (nf) return { status: 'NOT_FOUND', id: targetId, url };

      if (postsJson) break;
      await page.waitForTimeout(250);
    }

    if (!postsJson) {
      // Some pages might not trigger the expected GraphQL call; treat as NOT_FOUND-like transient
      return { status: 'NO_DATA', id: targetId, url };
    }

    const post = extractPostFromPostsResponse(postsJson, targetId);
    const comments = commentsJson ? extractCommentsFromCommentsResponse(commentsJson) : null;

    // Try to derive createdAt
    const createdAtRaw = post?.createdAt || post?.created_at || post?.time || post?.date;
    const createdAtFromPost = createdAtRaw ? new Date(createdAtRaw) : null;

    return {
      status: 'FOUND',
      id: targetId,
      url,
      post,
      comments,
      createdAtFromPost: createdAtFromPost && !Number.isNaN(createdAtFromPost.getTime()) ? createdAtFromPost : null,
      raw: {
        posts: postsJson,
        comments: commentsJson
      }
    };
  } finally {
    page.off('response', onResponse);
  }
}
