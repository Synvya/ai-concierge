from __future__ import annotations

import json
import logging
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Sequence

from sqlalchemy import Column, Integer, MetaData, String, Table, Text, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings


logger = logging.getLogger(__name__)
settings = get_settings()
metadata = MetaData(schema=settings.db_schema)

listings_table: Table | None = None
if settings.listings_table:
    listings_table = Table(
        settings.listings_table,
        metadata,
        Column("event_id", String, primary_key=True),
        Column("pubkey", String, nullable=False),
        Column("kind", Integer, nullable=False),
        Column("created_at", Integer, nullable=False),
        Column("tags", JSONB),
        Column("content", Text),
        Column("d", String),
        extend_existing=True,
    )


def _normalize_tags(raw_tags: Any) -> List[List[str]]:
    if raw_tags is None:
        return []
    if isinstance(raw_tags, str):
        try:
            data = json.loads(raw_tags)
        except json.JSONDecodeError:
            return []
    else:
        data = raw_tags
    if not isinstance(data, Iterable):
        return []

    normalized: List[List[str]] = []
    for item in data:
        if isinstance(item, (list, tuple)):
            normalized.append([str(part) for part in item])
    return normalized


def _group_tags(tags: List[List[str]]) -> Dict[str, List[List[str]]]:
    grouped: Dict[str, List[List[str]]] = defaultdict(list)
    for tag in tags:
        if not tag:
            continue
        grouped[tag[0]].append(tag[1:])
    return grouped


def _first_value(grouped: Dict[str, List[List[str]]], key: str) -> str | None:
    values = grouped.get(key)
    if not values:
        return None
    first = values[0]
    if not first:
        return None
    return first[0]


def _parse_price(grouped: Dict[str, List[List[str]]]) -> Dict[str, Any] | None:
    price_entries = grouped.get("price")
    if not price_entries:
        return None
    components = price_entries[0]
    if not components:
        return None

    amount = None
    try:
        amount = float(components[0])
    except (ValueError, TypeError, IndexError):
        amount = None

    currency = components[1] if len(components) >= 2 else None
    frequency = components[2] if len(components) >= 3 else None

    if amount is None and currency is None:
        return None

    payload: Dict[str, Any] = {}
    if amount is not None:
        payload["amount"] = amount
    if currency:
        payload["currency"] = currency
    if frequency:
        payload["frequency"] = frequency
    return payload


def _parse_published_at(
    grouped: Dict[str, List[List[str]]], created_at: int | None
) -> datetime | None:
    published_raw = _first_value(grouped, "published_at")
    if published_raw and published_raw.isdigit():
        try:
            return datetime.fromtimestamp(int(published_raw), tz=timezone.utc)
        except ValueError:
            return None
    if created_at is not None:
        try:
            return datetime.fromtimestamp(int(created_at), tz=timezone.utc)
        except ValueError:
            return None
    return None


def _collect_images(grouped: Dict[str, List[List[str]]]) -> List[str]:
    images = []
    for key in ("image", "thumb", "picture", "x", "media"):
        for entry in grouped.get(key, []):
            if entry and entry[0]:
                images.append(entry[0])
    return images


def _collect_keywords(grouped: Dict[str, List[List[str]]]) -> List[str]:
    keywords = []
    for entry in grouped.get("t", []):
        if entry and entry[0]:
            keywords.append(entry[0])
    return keywords


def _parse_listing(row: Mapping[str, Any]) -> Dict[str, Any] | None:
    tags = _normalize_tags(row.get("tags"))
    grouped = _group_tags(tags)
    title = _first_value(grouped, "title")
    if not title:
        return None

    created_at = row.get("created_at")
    published_at = _parse_published_at(grouped, created_at)
    price = _parse_price(grouped)
    summary = _first_value(grouped, "summary")
    location = _first_value(grouped, "location")
    status = _first_value(grouped, "status")
    url = (
        _first_value(grouped, "url")
        or _first_value(grouped, "website")
        or _first_value(grouped, "r")
    )

    listing: Dict[str, Any] = {
        "id": row.get("event_id") or row.get("id"),
        "title": title,
        "summary": summary,
        "status": status,
        "location": location,
        "price": price,
        "published_at": published_at,
        "content": row.get("content"),
        "images": _collect_images(grouped),
        "tags": _collect_keywords(grouped),
        "url": url,
        "identifier": _first_value(grouped, "d"),
        "raw_tags": tags,
    }
    # Drop keys with None values except for content to preserve text
    return {key: value for key, value in listing.items() if value is not None or key in {"content", "images", "tags", "raw_tags"}}


async def get_listings_by_public_keys(
    session: AsyncSession,
    public_keys: Sequence[str],
) -> Dict[str, List[Dict[str, Any]]]:
    if listings_table is None or not public_keys:
        return {}

    unique_keys = tuple(dict.fromkeys(public_keys))
    if not unique_keys:
        return {}

    stmt = (
        select(
            listings_table.c.event_id,
            listings_table.c.pubkey,
            listings_table.c.created_at,
            listings_table.c.tags,
            listings_table.c.content,
        )
        .where(listings_table.c.kind == 30402)
        .where(listings_table.c.pubkey.in_(unique_keys))
    )

    try:
        result = await session.execute(stmt)
    except SQLAlchemyError as exc:  # pragma: no cover - defensive guard
        logger.warning("listings_query_failed error=%s", exc)
        return {}

    listings_map: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in result.mappings():
        listing = _parse_listing(row)
        if listing:
            listings_map[row["pubkey"]].append(listing)

    max_items = max(settings.listings_per_seller, 0)
    if max_items:
        zero_point = datetime.fromtimestamp(0, tz=timezone.utc)
        for pubkey, entries in listings_map.items():
            entries.sort(key=lambda item: item.get("published_at") or zero_point, reverse=True)
            listings_map[pubkey] = entries[:max_items]

    return {key: entries for key, entries in listings_map.items()}
