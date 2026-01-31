import { getDb } from "./mongo.js";

/**
 * Save ad ONLY when FOUND.
 * - Uses _id = postId
 * - Stores gql snapshot (posts/comments etc.) if provided
 * ✅ RULE: If item is null => DO NOT INSERT/UPDATE in DB
 */
export async function saveAdIfNew(ad) {
  if (!ad || ad.status !== "FOUND") return { inserted: false };

  // -------------------------
  // Extract + validate postId
  // -------------------------
  const postId = String(ad.postId || ad._id || "").trim();
  if (!postId) return { inserted: false };

  // -------------------------
  // Normalize POST (item)
  // -------------------------
  const gqlPostsItem =
    ad?.gql?.posts?.json?.data?.posts?.items?.[0] ??
    ad?.gql?.posts?.json?.data?.post?.items?.[0] ??
    null;

  // ✅ HARD RULE: if item is null => DO NOT SAVE ANYTHING
  if (!gqlPostsItem) {
    console.warn(`[SKIP_DB] item=null, not saving postId=${postId}`);
    return { inserted: false, skipped: "ITEM_NULL" };
  }

  const formattedPrice = gqlPostsItem?.price?.formattedPrice ?? null;
  const numericPrice =
    formattedPrice != null
      ? Number(String(formattedPrice).replace(/[^\d]/g, "")) || null
      : null;

  const item = {
    id: gqlPostsItem.id ?? null,
    title: gqlPostsItem.title ?? null,
    postDate: gqlPostsItem.postDate ?? null,     // unix seconds
    updateDate: gqlPostsItem.updateDate ?? null, // unix seconds
    authorUsername: gqlPostsItem.authorUsername ?? null,
    authorId: gqlPostsItem.authorId ?? null,
    URL: gqlPostsItem.URL ?? null,
    bodyTEXT: gqlPostsItem.bodyTEXT ?? null,
    city: gqlPostsItem.city ?? null,
    geoCity: gqlPostsItem.geoCity ?? null,
    geoNeighborhood: gqlPostsItem.geoNeighborhood ?? null,
    tags: Array.isArray(gqlPostsItem.tags) ? gqlPostsItem.tags : [],
    imagesList: Array.isArray(gqlPostsItem.imagesList) ? gqlPostsItem.imagesList : [],
    hasImage: gqlPostsItem.hasImage ?? null,
    hasVideo: gqlPostsItem.hasVideo ?? null,
    commentEnabled: gqlPostsItem.commentEnabled ?? null,
    commentStatus: gqlPostsItem.commentStatus ?? null,
    commentCount: gqlPostsItem.commentCount ?? null,
    status: gqlPostsItem.status ?? null,
    postType: gqlPostsItem.postType ?? null,
    price: {
      formattedPrice,
      numeric: numericPrice,
    },
  };

  // -------------------------
  // Normalize COMMENTS
  // -------------------------
  const gqlCommentsItems =
    ad?.gql?.comments?.json?.data?.comments?.items ??
    ad?.commentsGql?.data?.comments?.items ??
    null;

  const comments = Array.isArray(gqlCommentsItems)
    ? gqlCommentsItems.map((c) => ({
        id: c?.id ?? null,
        authorUsername: c?.authorUsername ?? null,
        authorId: c?.authorId ?? null,
        authorLevel: c?.authorLevel ?? null,
        body: c?.body ?? null,
        status: c?.status ?? null, // 1 visible, 0 hidden
        deleteReason: c?.deleteReason ?? null,
        seqId: c?.seqId ?? null,
        date: c?.date ?? null, // unix seconds
        isReply: c?.isReply ?? false,
        replyToCommentId: c?.replyToCommentId ?? 0,
        mention: c?.mention ?? null,
      }))
    : [];

  const visibleComments = comments.filter((c) => c?.status === 1);

  // ✅ only set commentsLastFetchedAt when comments payload actually exists in gql
  const hasCommentsPayload = gqlCommentsItems !== null && gqlCommentsItems !== undefined;

  // -------------------------
  // DB upsert
  // -------------------------
  const db = await getDb();
  const col = db.collection("harajScrape");
  const now = new Date();

  const res = await col.updateOne(
    { _id: postId },
    {
      $setOnInsert: {
        _id: postId,
        postId,
        firstSeenAt: now,
      },
      $set: {
        lastSeenAt: now,
        url: ad.url || `https://haraj.com.sa/${postId}`,
        phone: ad.phone ?? null,

        // Keep raw gql (optional)
        gql: ad.gql ?? null,

        // ✅ normalized post for API
        item,

        // ✅ normalized comments for API
        comments,
        visibleCommentsCount: visibleComments.length,
        commentsCount: comments.length,

        // set only if comments payload exists
        commentsLastFetchedAt: hasCommentsPayload ? now : null,

        // convenience mirrors for fast query/indexing
        title: item?.title ?? null,
        postDate: item?.postDate ?? null,
        tags: item?.tags ?? [],
        city: item?.city ?? null,
        priceNumeric: item?.price?.numeric ?? null,
        hasPrice: item?.price?.numeric != null,
      },
    },
    { upsert: true }
  );

  return { inserted: Boolean(res.upsertedCount) };
}

/**
 * Update comments for an existing ad.
 * Store RAW GraphQL comments response (recommended), plus timestamp.
 */
export async function updateComments(postId, commentsGql) {
  const db = await getDb();
  const id = String(postId || "").trim();
  if (!id) return;

  // Extract items from GraphQL response safely
  const items = commentsGql?.data?.comments?.items;
  const arr = Array.isArray(items) ? items : [];

  // Normalize comments
  const comments = arr.map((c) => ({
    id: c?.id ?? null,
    authorUsername: c?.authorUsername ?? null,
    authorId: c?.authorId ?? null,
    authorLevel: c?.authorLevel ?? null,
    body: c?.body ?? null,
    status: c?.status ?? null,
    deleteReason: c?.deleteReason ?? null,
    seqId: c?.seqId ?? null,
    date: c?.date ?? null,
    isReply: c?.isReply ?? false,
    replyToCommentId: c?.replyToCommentId ?? 0,
    mention: c?.mention ?? null,
  }));

  const visibleCommentsCount = comments.filter((c) => c.status === 1).length;

  await db.collection("harajScrape").updateOne(
    { _id: id },
    {
      $set: {
        // raw payload (keep for debugging)
        commentsGql: commentsGql ?? null,

        // normalized (for API)
        comments,
        commentsCount: comments.length,
        visibleCommentsCount,

        commentsLastFetchedAt: new Date(),
      },
    }
  );
}

/**
 * Find ads eligible for comment refresh:
 * - Ad is older than cutoff (firstSeenAt <= now - olderThanHours)
 * - AND either:
 *   - never refreshed
 *   - or refreshed long ago (stale)
 */
export async function findAdsForCommentRefresh({
  olderThanHours = 24,
  limit = 50,
} = {}) {
  const db = await getDb();
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

  const q = {
    firstSeenAt: { $lte: cutoff },
    $or: [
      { commentsLastFetchedAt: { $exists: false } },
      { commentsLastFetchedAt: null },
      { commentsLastFetchedAt: { $lte: cutoff } },
    ],
  };

  return db
    .collection("harajScrape")
    .find(q, {
      projection: { _id: 1, postId: 1, url: 1, firstSeenAt: 1, commentsLastFetchedAt: 1 },
    })
    .sort({ commentsLastFetchedAt: 1, firstSeenAt: 1 })
    .limit(limit)
    .toArray();
}

export async function countAdsAddedSince(date) {
  const db = await getDb();
  return db.collection("harajScrape").countDocuments({ firstSeenAt: { $gte: date } });
}
