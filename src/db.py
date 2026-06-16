# src/db.py
from __future__ import annotations

from datetime import datetime, timedelta, UTC
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient

from .config import settings


_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.mongodb_uri)
    return _client


def get_db():
    return get_client()[settings.mongodb_db]


def normalize_contact(contact: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(contact, dict):
        return {
            "id": None,
            "username": None,
            "mobile": None,
            "email": None,
        }

    return {
        "id": contact.get("id"),
        "username": contact.get("username"),
        "mobile": contact.get("mobile"),
        "email": contact.get("email"),
    }

def normalize_price(formatted_price):
    if formatted_price is None:
        return None
    digits = "".join(ch for ch in str(formatted_price) if ch.isdigit())
    return int(digits) if digits else None


def extract_post_item(ad: dict[str, Any]) -> dict[str, Any] | None:
    gql = ad.get("gql") or {}

    item = (
        gql.get("posts", {})
        .get("json", {})
        .get("data", {})
        .get("posts", {})
        .get("items", [None])[0]
    )

    if item:
        return item

    item = (
        gql.get("posts", {})
        .get("json", {})
        .get("data", {})
        .get("post", {})
        .get("items", [None])[0]
    )

    return item


def _extract_comments_items_from_payload(payload: dict[str, Any] | None):
    if not isinstance(payload, dict):
        return None

    data = payload.get("data") or {}
    for key in ("comments", "postComments"):
        items = (data.get(key) or {}).get("items")
        if isinstance(items, list):
            return items
    return None


def extract_comments_items_from_ad(ad: dict[str, Any]):
    gql = ad.get("gql") or {}

    comments_block = gql.get("comments") or {}
    items = _extract_comments_items_from_payload(comments_block.get("json"))
    if items is not None:
        return items

    comments_gql = ad.get("commentsGql") or {}
    items = _extract_comments_items_from_payload(comments_gql)
    return items or []


def extract_comments_items_from_gql(comments_gql: dict[str, Any] | None):
    items = _extract_comments_items_from_payload(comments_gql)
    return items if isinstance(items, list) else []


def normalize_post_item(gql_item: dict[str, Any]) -> dict[str, Any]:
    formatted_price = (gql_item.get("price") or {}).get("formattedPrice")
    numeric_price = normalize_price(formatted_price)

    return {
        "id": gql_item.get("id"),
        "title": gql_item.get("title"),
        "postDate": gql_item.get("postDate"),
        "updateDate": gql_item.get("updateDate"),
        "authorUsername": gql_item.get("authorUsername"),
        "authorId": gql_item.get("authorId"),
        "URL": gql_item.get("URL"),
        "bodyTEXT": gql_item.get("bodyTEXT"),
        "city": gql_item.get("city"),
        "geoCity": gql_item.get("geoCity"),
        "geoNeighborhood": gql_item.get("geoNeighborhood"),
        "tags": gql_item.get("tags") if isinstance(gql_item.get("tags"), list) else [],
        "imagesList": gql_item.get("imagesList") if isinstance(gql_item.get("imagesList"), list) else [],
        "hasImage": gql_item.get("hasImage"),
        "hasVideo": gql_item.get("hasVideo"),
        "commentEnabled": gql_item.get("commentEnabled"),
        "commentStatus": gql_item.get("commentStatus"),
        "commentCount": gql_item.get("commentCount"),
        "status": gql_item.get("status"),
        "postType": gql_item.get("postType"),
        "price": {
            "formattedPrice": formatted_price,
            "numeric": numeric_price,
        },
    }


def normalize_comments(items) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []

    return [
        {
            "id": c.get("id"),
            "authorUsername": c.get("authorUsername"),
            "authorId": c.get("authorId"),
            "authorLevel": c.get("authorLevel"),
            "body": c.get("body"),
            "status": c.get("status"),
            "deleteReason": c.get("deleteReason"),
            "seqId": c.get("seqId"),
            "date": c.get("date"),
            "isReply": c.get("isReply", False),
            "replyToCommentId": c.get("replyToCommentId", 0),
            "mention": c.get("mention"),
        }
        for c in items
        if isinstance(c, dict)
    ]


async def save_ad_if_new(ad: dict[str, Any]) -> dict[str, Any]:
    if not ad or ad.get("status") != "FOUND":
        return {"inserted": False}

    post_id = str(ad.get("postId") or ad.get("_id") or "").strip()
    if not post_id:
        return {"inserted": False}
    
    contact = normalize_contact(ad.get("contact"))

    gql_item = extract_post_item(ad)

    if not gql_item:
        print(f"[SKIP_DB] item=null, not saving postId={post_id}")
        return {"inserted": False, "skipped": "ITEM_NULL"}

    item = normalize_post_item(gql_item)

    comments_items = extract_comments_items_from_ad(ad)
    comments = normalize_comments(comments_items)
    visible_comments = [c for c in comments if c.get("status") == 1]
    has_comments_payload = comments_items is not None

    now = datetime.now(UTC)

    col = get_db()["harajScrape"]

    result = await col.update_one(
        {"_id": post_id},
        {
            "$setOnInsert": {
                "_id": post_id,
                "postId": post_id,
                "firstSeenAt": now,
            },
            "$set": {
                "lastSeenAt": now,
                "url": ad.get("url") or f"https://haraj.com.sa/{post_id}",
                "harajUrlId": ad.get("harajUrlId"),
                "contact": contact,
                "phone": contact.get("mobile"),

                "gql": ad.get("gql"),

                "item": item,

                "comments": comments,
                "commentsCount": len(comments),
                "visibleCommentsCount": len(visible_comments),
                "commentsLastFetchedAt": now if has_comments_payload else None,

                "title": item.get("title"),
                "postDate": item.get("postDate"),
                "tags": item.get("tags", []),
                "city": item.get("city"),
                "priceNumeric": item.get("price", {}).get("numeric"),
                "hasPrice": item.get("price", {}).get("numeric") is not None,
            },
        },
        upsert=True,
    )

    return {"inserted": bool(result.upserted_id)}


async def update_comments(post_id: str, comments_gql: dict[str, Any] | None):
    post_id = str(post_id or "").strip()
    if not post_id:
        return

    items = extract_comments_items_from_gql(comments_gql)
    comments = normalize_comments(items)
    visible_comments_count = len([c for c in comments if c.get("status") == 1])

    await get_db()["harajScrape"].update_one(
        {"_id": post_id},
        {
            "$set": {
                "commentsGql": comments_gql,
                "comments": comments,
                "commentsCount": len(comments),
                "visibleCommentsCount": visible_comments_count,
                "commentsLastFetchedAt": datetime.now(UTC),
            }
        },
    )


async def find_ads_for_comment_refresh(
    older_than_hours: int = 24,
    limit: int = 50,
) -> list[dict[str, Any]]:
    cutoff = datetime.now(UTC) - timedelta(hours=older_than_hours)

    query = {
        "firstSeenAt": {"$lte": cutoff},
        "$or": [
            {"commentsLastFetchedAt": {"$exists": False}},
            {"commentsLastFetchedAt": None},
            {"commentsLastFetchedAt": {"$lte": cutoff}},
        ],
    }

    cursor = (
        get_db()["harajScrape"]
        .find(
            query,
            {
                "_id": 1,
                "postId": 1,
                "url": 1,
                "firstSeenAt": 1,
                "commentsLastFetchedAt": 1,
            },
        )
        .sort([("commentsLastFetchedAt", 1), ("firstSeenAt", 1)])
        .limit(limit)
    )

    return await cursor.to_list(length=limit)



async def ensure_indexes():
    col = get_db()["harajScrape"]

    await col.create_index("postId")
    await col.create_index("firstSeenAt")
    await col.create_index("lastSeenAt")
    await col.create_index("commentsLastFetchedAt")
    await col.create_index("postDate")
    await col.create_index("city")
    await col.create_index("tags")
    await col.create_index("priceNumeric")


async def count_ads_added_since(date: datetime) -> int:
    return await get_db()["harajScrape"].count_documents(
        {"firstSeenAt": {"$gte": date}}
    )


