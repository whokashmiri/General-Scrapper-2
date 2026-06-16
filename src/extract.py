# src/extract.py
from __future__ import annotations

from typing import Any


def normalize_phone(phone_raw: str | None = '') -> str | None:
    s = str(phone_raw or '').strip()
    has_plus = s.startswith('+')
    digits = ''.join(ch for ch in s if ch.isdigit())
    if not digits:
        return None
    return f'+{digits}' if has_plus else digits


def extract_posts_from_posts_response(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    posts = (((payload.get('data') or {}).get('posts') or {}).get('items') or [])
    return posts if isinstance(posts, list) else []


def extract_comments_from_comments_response(payload: dict[str, Any] | None) -> list[dict[str, Any]] | None:
    if not isinstance(payload, dict):
        return None

    def walk(obj: Any) -> list[dict[str, Any]] | None:
        if isinstance(obj, dict):
            for key in ('comments', 'postComments', 'items'):
                val = obj.get(key)
                if isinstance(val, list):
                    return [x for x in val if isinstance(x, dict)]
            for val in obj.values():
                got = walk(val)
                if got is not None:
                    return got
        elif isinstance(obj, list):
            for val in obj:
                got = walk(val)
                if got is not None:
                    return got
        return None

    return walk(payload)
