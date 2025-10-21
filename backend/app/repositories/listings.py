from __future__ import annotations

import json
import logging
import re
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Column, Integer, MetaData, String, Table, Text, cast, func, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..utils.geolocation import decode_geohash

logger = logging.getLogger(__name__)
settings = get_settings()
metadata = MetaData(schema=settings.db_schema)

_LISTINGS_TABLE_AVAILABLE = True

_BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _bech32_polymod(values: Sequence[int]) -> int:
    generator = (0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3)
    chk = 1
    for value in values:
        top = chk >> 25
        chk = ((chk & 0x1FFFFFF) << 5) ^ value
        for i in range(5):
            if (top >> i) & 1:
                chk ^= generator[i]
    return chk


def _bech32_hrp_expand(hrp: str) -> list[int]:
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]


def _bech32_verify_checksum(hrp: str, data: Sequence[int]) -> bool:
    return _bech32_polymod(_bech32_hrp_expand(hrp) + list(data)) == 1


def _bech32_decode(bech: str) -> tuple[str | None, list[int] | None]:
    if not bech or any(ord(x) < 33 or ord(x) > 126 for x in bech):
        return None, None
    bech = bech.strip()
    pos = bech.rfind("1")
    if pos < 1 or pos + 7 > len(bech) or len(bech) > 90:
        return None, None
    hrp = bech[:pos]
    data_part = bech[pos + 1 :]
    try:
        data = [_BECH32_CHARSET.index(c) for c in data_part]
    except ValueError:
        return None, None
    if not _bech32_verify_checksum(hrp, data):
        return None, None
    return hrp, data[:-6]


def _convert_bits(data: Sequence[int], from_bits: int, to_bits: int, pad: bool = True) -> bytes | None:
    acc = 0
    bits = 0
    ret = bytearray()
    maxv = (1 << to_bits) - 1
    for value in data:
        if value < 0 or value >> from_bits:
            return None
        acc = (acc << from_bits) | value
        bits += from_bits
        while bits >= to_bits:
            bits -= to_bits
            ret.append((acc >> bits) & maxv)
    if pad:
        if bits:
            ret.append((acc << (to_bits - bits)) & maxv)
    elif bits >= from_bits or ((acc << (to_bits - bits)) & maxv):
        return None
    return bytes(ret)


def _npub_to_hex(npub: str) -> str | None:
    npub = npub.strip()
    hrp, data = _bech32_decode(npub)
    if hrp != "npub" or data is None:
        return None
    decoded = _convert_bits(data, 5, 8, False)
    if decoded is None:
        return None
    return decoded.hex()

listings_table: Table | None = None
fallback_classified_table = Table(
    settings.db_table,
    metadata,
    Column("id", String, primary_key=True),
    Column("name", Text),
    Column("meta_data", JSONB),
    Column("filters", JSONB),
    Column("content", Text),
    Column("usage", JSONB),
    Column("content_hash", Text),
    extend_existing=True,
)
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


def _normalize_tags(raw_tags: Any) -> list[list[str]]:
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

    normalized: list[list[str]] = []
    for item in data:
        if isinstance(item, (list, tuple)):
            normalized.append([str(part) for part in item])
    return normalized


def _group_tags(tags: list[list[str]]) -> dict[str, list[list[str]]]:
    grouped: dict[str, list[list[str]]] = defaultdict(list)
    for tag in tags:
        if not tag:
            continue
        grouped[tag[0]].append(tag[1:])
    return grouped


def _first_value(grouped: dict[str, list[list[str]]], key: str) -> str | None:
    values = grouped.get(key)
    if not values:
        return None
    first = values[0]
    if not first:
        return None
    return first[0]


def _parse_price(grouped: dict[str, list[list[str]]]) -> dict[str, Any] | None:
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

    payload: dict[str, Any] = {}
    if amount is not None:
        payload["amount"] = amount
    if currency:
        payload["currency"] = currency
    if frequency:
        payload["frequency"] = frequency
    return payload


def _parse_published_at(
    grouped: dict[str, list[list[str]]], created_at: int | None
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


def _collect_images(grouped: dict[str, list[list[str]]]) -> list[str]:
    images = []
    for key in ("image", "thumb", "picture", "x", "media"):
        for entry in grouped.get(key, []):
            if entry and entry[0]:
                images.append(entry[0])
    return images


def _collect_keywords(grouped: dict[str, list[list[str]]]) -> list[str]:
    keywords = []
    for entry in grouped.get("t", []):
        if entry and entry[0]:
            keywords.append(entry[0])
    return keywords


def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _extract_geohash(content: Mapping[str, Any], meta: Mapping[str, Any]) -> str | None:
    for source in (content, meta):
        candidate = source.get("geohash")
        if isinstance(candidate, str):
            trimmed = candidate.strip()
            if trimmed:
                return trimmed
    return None


def _tokenize_query(query: str | None) -> list[str]:
    if not query:
        return []
    return [token for token in re.findall(r"[A-Za-z0-9]+", query.lower()) if len(token) > 1]


def _listing_match_score(listing: Mapping[str, Any], tokens: Sequence[str]) -> int:
    if not tokens:
        return 0

    haystack_parts: list[str] = []
    for key in ("title", "summary", "content", "location", "status", "identifier"):
        value = listing.get(key)
        if isinstance(value, str):
            haystack_parts.append(value.lower())

    tags = listing.get("tags")
    if isinstance(tags, list):
        haystack_parts.extend(str(tag).lower() for tag in tags)

    price = listing.get("price")
    if isinstance(price, dict):
        for val in price.values():
            if isinstance(val, str):
                haystack_parts.append(val.lower())

    haystack = " ".join(haystack_parts)
    score = 0
    for token in tokens:
        if token in haystack:
            score += 1
    return score


def filter_and_rank_listings(
    listings: Sequence[dict[str, Any]],
    query: str | None,
    max_items: int,
) -> tuple[list[dict[str, Any]], float]:
    """Filter listings for relevance to the query and return them sorted by score and recency."""
    if not listings:
        return [], 0.0
    if max_items <= 0:
        return [], 0.0

    tokens = _tokenize_query(query)
    zero_point = datetime.fromtimestamp(0, tz=timezone.utc)

    scored_entries: list[tuple[int, datetime, dict[str, Any]]] = []
    seen_ids = set()
    for listing in listings:
        listing_id = listing.get("id")
        if isinstance(listing_id, str):
            if listing_id in seen_ids:
                continue
            seen_ids.add(listing_id)

        score = _listing_match_score(listing, tokens)
        published_at = listing.get("published_at")
        if not isinstance(published_at, datetime):
            published_at = zero_point

        if tokens and score == 0:
            # Skip non-matching listings when we have specific search tokens.
            continue

        scored_entries.append((score, published_at, listing))

    if not scored_entries:
        # Fallback to top listings by recency if nothing matched the tokens.
        fallback_seen: set[str] = set()
        for listing in listings:
            listing_id = listing.get("id")
            if isinstance(listing_id, str):
                if listing_id in fallback_seen:
                    continue
                fallback_seen.add(listing_id)
            published_at = listing.get("published_at")
            if not isinstance(published_at, datetime):
                published_at = zero_point
            scored_entries.append((0, published_at, listing))

    scored_entries.sort(key=lambda item: (item[0], item[1]), reverse=True)

    slice_size = max_items if max_items else len(scored_entries)
    trimmed = [entry[2] for entry in scored_entries[:slice_size]]
    best_score = float(scored_entries[0][0]) if scored_entries else 0.0
    return trimmed, best_score


def _parse_listing(row: Mapping[str, Any]) -> dict[str, Any] | None:
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
    full_address = location
    geohash_value = _first_value(grouped, "geohash")
    latitude = _coerce_float(_first_value(grouped, "latitude"))
    longitude = _coerce_float(_first_value(grouped, "longitude"))

    if geohash_value:
        decoded = decode_geohash(geohash_value)
        if decoded:
            latitude = latitude if latitude is not None else decoded[0]
            longitude = longitude if longitude is not None else decoded[1]
    status = _first_value(grouped, "status")
    url = (
        _first_value(grouped, "url")
        or _first_value(grouped, "website")
        or _first_value(grouped, "r")
    )

    listing: dict[str, Any] = {
        "id": row.get("event_id") or row.get("id"),
        "title": title,
        "summary": summary,
        "status": status,
        "location": location,
        "full_address": full_address,
        "geohash": geohash_value,
        "latitude": latitude,
        "longitude": longitude,
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


def _finalize_listing_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in payload.items()
        if value is not None or key in {"content", "images", "tags", "raw_tags", "summary"}
    }


def _parse_classified_listing_row(row: Mapping[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
    meta_raw = row.get("meta_data")
    if isinstance(meta_raw, str):
        try:
            meta = json.loads(meta_raw)
        except json.JSONDecodeError:
            meta = {}
    elif isinstance(meta_raw, Mapping):
        meta = dict(meta_raw)
    else:
        meta = {}

    content_raw = row.get("content")
    if isinstance(content_raw, str):
        try:
            content = json.loads(content_raw)
        except json.JSONDecodeError:
            content = {}
    elif isinstance(content_raw, Mapping):
        content = dict(content_raw)
    else:
        content = {}

    meta_type = meta.get("type")
    if meta_type is None and isinstance(content.get("type"), str):
        meta_type = content.get("type")
    if meta_type != "classified_listing":
        return None, None

    seller_pubkey = None
    content_seller = content.get("seller")
    if isinstance(content_seller, str) and content_seller.strip():
        seller_pubkey = content_seller.strip()
    if seller_pubkey is None:
        meta_seller = meta.get("seller")
        if isinstance(meta_seller, str) and meta_seller.strip():
            seller_pubkey = meta_seller.strip()
    if seller_pubkey is None:
        return None, None

    title = content.get("title") or row.get("name")
    if not isinstance(title, str) or not title:
        return None, None

    raw_summary = content.get("summary")
    description = content.get("description")

    summary_text: str | None = None
    if isinstance(raw_summary, str):
        trimmed = raw_summary.strip()
        summary_text = trimmed or raw_summary
    elif isinstance(raw_summary, (int, float)):
        summary_text = str(raw_summary)

    if summary_text is None and isinstance(description, str):
        chunk = description.strip()
        if chunk:
            summary_text = chunk.split("\n\n", 1)[0].strip() or chunk

    if summary_text is None:
        fallback_summary = meta.get("summary")
        if isinstance(fallback_summary, str):
            fallback_stripped = fallback_summary.strip()
            summary_text = fallback_stripped or fallback_summary

    price_data = content.get("price")
    price: dict[str, Any] | None = None
    if isinstance(price_data, Mapping):
        amount = price_data.get("amount")
        currency = price_data.get("currency") or meta.get("price_currency")
        frequency = price_data.get("frequency")
        numeric_amount: float | None
        if isinstance(amount, (int, float)):
            numeric_amount = float(amount)
        elif isinstance(amount, str):
            try:
                numeric_amount = float(amount)
            except ValueError:
                numeric_amount = None
        else:
            numeric_amount = None

        price_parts: dict[str, Any] = {}
        if numeric_amount is not None:
            price_parts["amount"] = numeric_amount
        if isinstance(currency, str) and currency:
            price_parts["currency"] = currency
        if isinstance(frequency, str) and frequency:
            price_parts["frequency"] = frequency

        if price_parts:
            price = price_parts

    categories = []
    for source in (content.get("categories"), meta.get("categories")):
        if isinstance(source, Iterable) and not isinstance(source, (str, bytes)):
            for cat in source:
                if isinstance(cat, str) and cat:
                    categories.append(cat)
    if categories:
        categories = list(dict.fromkeys(categories))

    images: list[str] = []
    raw_images = content.get("images")
    if isinstance(raw_images, Iterable):
        for entry in raw_images:
            if isinstance(entry, Mapping):
                url = entry.get("url")
                if isinstance(url, str) and url:
                    images.append(url)

    identifier = content.get("id") or row.get("id")
    if isinstance(identifier, str):
        identifier = identifier.strip()
    else:
        identifier = None

    location = content.get("location") or meta.get("location")
    if not isinstance(location, str):
        location = None

    status = content.get("visibility") or meta.get("visibility")
    if not isinstance(status, str):
        status = None

    url = content.get("url")
    if not isinstance(url, str):
        url = None

    geohash_value = _extract_geohash(content, meta)
    latitude = _coerce_float(content.get("latitude") or meta.get("latitude"))
    longitude = _coerce_float(content.get("longitude") or meta.get("longitude"))

    if geohash_value:
        decoded = decode_geohash(geohash_value)
        if decoded:
            latitude = latitude if latitude is not None else decoded[0]
            longitude = longitude if longitude is not None else decoded[1]

    listing = _finalize_listing_payload(
        {
            "id": identifier or row.get("id"),
            "title": title,
            "summary": summary_text,
            "content": description or summary_text,
            "status": status,
            "location": location,
            "full_address": location,
            "geohash": geohash_value,
            "latitude": latitude,
            "longitude": longitude,
            "price": price,
            "published_at": None,
            "images": images,
            "tags": categories,
            "url": url,
            "identifier": identifier,
            "raw_tags": [["category", cat] for cat in categories] if categories else [],
        }
    )

    return seller_pubkey, listing


def _is_missing_table_error(exc: SQLAlchemyError) -> bool:
    orig = getattr(exc, "orig", None)
    if orig is None:
        return False
    if orig.__class__.__name__ == "UndefinedTableError":
        return True
    sqlstate = getattr(orig, "sqlstate", None)
    return sqlstate == "42P01"


def _disable_listings_table(context: str) -> None:
    global _LISTINGS_TABLE_AVAILABLE
    if _LISTINGS_TABLE_AVAILABLE:
        _LISTINGS_TABLE_AVAILABLE = False
        logger.info("listings_table_unavailable context=%s", context)


async def _get_classified_listings_from_fallback(
    session: AsyncSession,
    public_keys: Sequence[str],
) -> dict[str, list[dict[str, Any]]]:
    if not public_keys:
        return {}

    unique_keys = tuple(dict.fromkeys(public_keys))
    if not unique_keys:
        return {}

    meta_type = fallback_classified_table.c.meta_data["type"].astext
    meta_seller = fallback_classified_table.c.meta_data["seller"].astext

    stmt = (
        select(
            fallback_classified_table.c.id,
            fallback_classified_table.c.name,
            fallback_classified_table.c.meta_data,
            fallback_classified_table.c.content,
            fallback_classified_table.c.usage,
            fallback_classified_table.c.content_hash,
        )
        .where(meta_type == "classified_listing")
        .where(meta_seller.in_(unique_keys))
    )

    result = await session.execute(stmt)

    listings_map: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in result.mappings():
        seller_pubkey, listing = _parse_classified_listing_row(row)  # type: ignore[arg-type]
        if seller_pubkey and listing:
            keys_to_store = [seller_pubkey]
            hex_pubkey = _npub_to_hex(seller_pubkey)
            if hex_pubkey:
                keys_to_store.append(hex_pubkey)
            for key in keys_to_store:
                listings_map[key].append(listing)

    return {key: entries for key, entries in listings_map.items()}


async def get_listings_by_public_keys(
    session: AsyncSession,
    public_keys: Sequence[str],
) -> dict[str, list[dict[str, Any]]]:
    if not public_keys:
        return {}

    if listings_table is not None and _LISTINGS_TABLE_AVAILABLE:
        unique_keys = tuple(dict.fromkeys(public_keys))
        if unique_keys:
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
                if _is_missing_table_error(exc):
                    _disable_listings_table("get_by_pubkeys")
                    await session.rollback()
                else:
                    logger.warning("listings_query_failed error=%s", exc)
                    await session.rollback()
            else:
                listings_map: dict[str, list[dict[str, Any]]] = defaultdict(list)
                for row in result.mappings():
                    listing = _parse_listing(row)  # type: ignore[arg-type]
                    if listing:
                        key = row["pubkey"]
                        targets = [key]
                        hex_key = _npub_to_hex(key)
                        if hex_key:
                            targets.append(hex_key)
                        for target in targets:
                            listings_map[target].append(listing)

                max_items = max(settings.listings_per_seller, 0)
                if max_items:
                    zero_point = datetime.fromtimestamp(0, tz=timezone.utc)
                    for pubkey, entries in listings_map.items():
                        entries.sort(key=lambda item: item.get("published_at") or zero_point, reverse=True)
                        listings_map[pubkey] = entries[:max_items]

                if listings_map:
                    return {key: entries for key, entries in listings_map.items()}

    return await _get_classified_listings_from_fallback(session, public_keys)


async def _search_classified_listings_fallback(
    session: AsyncSession,
    query: str,
    limit: int,
) -> list[dict[str, Any]]:
    tokens = _tokenize_query(query)
    lowered_query = query.strip().lower()
    pattern = f"%{lowered_query}%"

    text_columns = [
        func.lower(fallback_classified_table.c.name),
        func.lower(fallback_classified_table.c.content),
    ]

    conditions = [column.like(pattern) for column in text_columns]
    for token in tokens:
        token_pattern = f"%{token}%"
        conditions.extend(column.like(token_pattern) for column in text_columns)

    meta_type = fallback_classified_table.c.meta_data["type"].astext
    stmt = select(
        fallback_classified_table.c.id,
        fallback_classified_table.c.name,
        fallback_classified_table.c.meta_data,
        fallback_classified_table.c.content,
        fallback_classified_table.c.usage,
        fallback_classified_table.c.content_hash,
    ).where(meta_type == "classified_listing")

    if conditions:
        stmt = stmt.where(or_(*conditions))

    stmt = stmt.order_by(fallback_classified_table.c.name.asc()).limit(max(limit, 1) * 4)

    result = await session.execute(stmt)

    matches: list[dict[str, Any]] = []
    fallback_entries: list[dict[str, Any]] = []

    for row in result.mappings():
        seller_pubkey, listing = _parse_classified_listing_row(row)  # type: ignore[arg-type]
        if not seller_pubkey or not listing:
            continue
        entry = {
            "pubkey": seller_pubkey,
            "listing": listing,
            "hex_pubkey": _npub_to_hex(seller_pubkey),
        }
        fallback_entries.append(entry)
        if tokens:
            score = _listing_match_score(listing, tokens)
            if score > 0:
                matches.append({**entry, "score": float(score)})
        else:
            matches.append({**entry, "score": 0.0})

    if tokens and not matches:
        matches = [{**entry, "score": 0.0} for entry in fallback_entries]

    zero_point = datetime.fromtimestamp(0, tz=timezone.utc)
    matches.sort(
        key=lambda item: (
            item.get("score", 0.0),
            item["listing"].get("published_at") or zero_point,
        ),
        reverse=True,
    )

    return matches[:limit]


async def search_listings_by_text(
    session: AsyncSession,
    query: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    if not query or not query.strip():
        return []

    if listings_table is not None and _LISTINGS_TABLE_AVAILABLE:
        tokens = _tokenize_query(query)
        lowered_query = query.strip().lower()
        pattern = f"%{lowered_query}%"

        text_columns = [
            func.lower(listings_table.c.content),
            func.lower(cast(listings_table.c.tags, Text)),
            func.lower(cast(listings_table.c.d, Text)),
        ]

        conditions = [column.like(pattern) for column in text_columns]

        for token in tokens:
            token_pattern = f"%{token}%"
            conditions.extend(column.like(token_pattern) for column in text_columns)

        stmt = select(
            listings_table.c.event_id,
            listings_table.c.pubkey,
            listings_table.c.created_at,
            listings_table.c.tags,
            listings_table.c.content,
        ).where(listings_table.c.kind == 30402)

        if conditions:
            stmt = stmt.where(or_(*conditions))

        stmt = stmt.order_by(listings_table.c.created_at.desc()).limit(max(limit, 1) * 4)

        try:
            result = await session.execute(stmt)
        except SQLAlchemyError as exc:  # pragma: no cover - defensive guard
            if _is_missing_table_error(exc):
                _disable_listings_table("text_search")
                await session.rollback()
            else:
                logger.warning("listings_search_failed error=%s", exc)
                await session.rollback()
        else:
            matches: list[dict[str, Any]] = []
            fallback_entries: list[dict[str, Any]] = []

            for row in result.mappings():
                listing = _parse_listing(row)  # type: ignore[arg-type]
                if not listing:
                    continue
                entry = {"pubkey": row["pubkey"], "listing": listing}
                fallback_entries.append(entry)
                if tokens:
                    score = _listing_match_score(listing, tokens)
                    if score > 0:
                        matches.append({**entry, "score": float(score)})
                else:
                    matches.append({**entry, "score": 0.0})

            if tokens and not matches:
                matches = [{**entry, "score": 0.0} for entry in fallback_entries]

            zero_point = datetime.fromtimestamp(0, tz=timezone.utc)
            matches.sort(
                key=lambda item: (
                    item.get("score", 0.0),
                    item["listing"].get("published_at") or zero_point,
                ),
                reverse=True,
            )

            if matches:
                return matches[:limit]

    return await _search_classified_listings_fallback(session, query.strip(), limit)
