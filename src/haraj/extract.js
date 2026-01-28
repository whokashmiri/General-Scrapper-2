// Best-effort extraction helpers for unknown GraphQL response shapes.

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepFindPost(obj, targetId) {
  const stack = [obj];
  const id = String(targetId);

  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;

    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }

    if (!isObject(cur)) continue;

    const curId = cur.id ?? cur.postId ?? cur.post_id ?? cur.postID;
    if (curId != null && String(curId) === id) {
      // Heuristic: looks like a post if it has title/text/price/user
      const hasPostSignals =
        'title' in cur || 'text' in cur || 'body' in cur || 'price' in cur || 'user' in cur || 'author' in cur;
      if (hasPostSignals) return cur;
    }

    for (const k of Object.keys(cur)) stack.push(cur[k]);
  }

  return null;
}

export function extractPostFromPostsResponse(json, targetId) {
  if (!json || typeof json !== 'object') return null;
  const data = json.data ?? json;

  // Common direct shapes
  const direct = data.post || data.postById || data.postsById;
  if (direct) {
    const directId = direct.id ?? direct.postId ?? direct.post_id;
    if (directId != null && String(directId) === String(targetId)) return direct;
  }

  // Common list shapes
  const listCandidates = [
    data.posts?.items,
    data.posts?.nodes,
    data.posts,
    data.items,
    data.nodes
  ];
  for (const cand of listCandidates) {
    if (!cand) continue;
    if (Array.isArray(cand)) {
      const hit = cand.find((x) => {
        const xId = x?.id ?? x?.postId ?? x?.post_id;
        return xId != null && String(xId) === String(targetId);
      });
      if (hit) return hit;
    }
  }

  // Last resort deep search
  return deepFindPost(data, targetId);
}

export function extractCommentsFromCommentsResponse(json) {
  if (!json || typeof json !== 'object') return null;
  const data = json.data ?? json;

  // Common shapes
  const direct = data.comments || data.comment || data.postComments;
  if (Array.isArray(direct)) return direct;
  if (direct?.items && Array.isArray(direct.items)) return direct.items;
  if (direct?.nodes && Array.isArray(direct.nodes)) return direct.nodes;

  // Try deep find arrays of comment-like objects
  const stack = [data];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    if (Array.isArray(cur)) {
      // if array elements look like comments
      if (
        cur.length &&
        typeof cur[0] === 'object' &&
        (('comment' in cur[0]) || ('text' in cur[0]) || ('body' in cur[0]) || ('user' in cur[0]))
      ) {
        return cur;
      }
      for (const v of cur) stack.push(v);
      continue;
    }
    if (!isObject(cur)) continue;
    for (const k of Object.keys(cur)) stack.push(cur[k]);
  }
  return null;
}
