import json
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, MetaData, String, Table, Text, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..utils.geolocation import build_maps_url, haversine_km
from .listings import (
    _npub_to_hex,
    filter_and_rank_listings,
    get_listings_by_public_keys,
    search_listings_by_text,
)

settings = get_settings()

metadata = MetaData(schema=settings.db_schema)

sellers_table = Table(
    settings.db_table,
    metadata,
    Column("id", String, primary_key=True),
    Column("name", Text),
    Column("meta_data", JSONB),
    Column("filters", JSONB),
    Column("content", Text),
    Column("embedding", Vector(settings.embedding_dimensions)),
    Column("usage", JSONB),
    Column("content_hash", Text),
    extend_existing=True,
)


def _should_exclude_seller(seller: Dict[str, Any]) -> bool:
    def has_demo_flag(data: Dict[str, Any] | None) -> bool:
        if not isinstance(data, dict):
            return False
        if data.get("hashtag_demo") is True:
            return True
        hashtags = data.get("hashtags")
        if isinstance(hashtags, list) and any(
            isinstance(tag, str) and tag.lower() == "demo" for tag in hashtags
        ):
            return True
        environment = data.get("environment")
        if isinstance(environment, str) and environment.lower() == "demo":
            return True
        return False

    meta = seller.get("meta_data")
    filters = seller.get("filters")
    return has_demo_flag(meta) or has_demo_flag(filters)


def _normalize_pubkeys(pubkeys: Iterable[str]) -> List[str]:
    normalized: List[str] = []
    for key in pubkeys:
        if not isinstance(key, str):
            continue
        candidate = key.strip()
        if not candidate:
            continue
        candidate_lower = candidate.lower()
        if candidate_lower not in normalized:
            normalized.append(candidate_lower)
        hex_key = _npub_to_hex(candidate)
        if hex_key and hex_key not in normalized:
            normalized.append(hex_key)
    return normalized


def _select_canonical_key(keys: List[str]) -> Optional[str]:
    for key in keys:
        if (
            isinstance(key, str)
            and len(key) == 64
            and all(c in "0123456789abcdef" for c in key.lower())
        ):
            return key.lower()
    return keys[0].lower() if keys else None


def _extract_seller_pubkeys(seller: Dict[str, Any]) -> List[str]:
    candidates: List[str] = []

    meta = seller.get("meta_data")
    if isinstance(meta, dict):
        if isinstance(meta.get("public_key"), str):
            candidates.append(meta["public_key"])
        if isinstance(meta.get("seller"), str):
            candidates.append(meta["seller"])

    content_raw = seller.get("content")
    content: Dict[str, Any] | None = None
    if isinstance(content_raw, dict):
        content = content_raw
    elif isinstance(content_raw, str):
        try:
            parsed = json.loads(content_raw)
            if isinstance(parsed, dict):
                content = parsed
        except json.JSONDecodeError:
            content = None

    if content:
        if isinstance(content.get("public_key"), str):
            candidates.append(content["public_key"])
        if isinstance(content.get("seller"), str):
            candidates.append(content["seller"])

    return _normalize_pubkeys(candidates)


async def _fetch_sellers_by_public_keys(
    session: AsyncSession,
    public_keys: Sequence[str],
) -> Dict[str, Dict[str, Any]]:
    if not public_keys:
        return {}

    normalized_keys = _normalize_pubkeys(public_keys)

    unique_pubkeys = tuple(dict.fromkeys(normalized_keys))
    if not unique_pubkeys:
        return {}

    pubkey_field = sellers_table.c.meta_data["public_key"].astext

    stmt = select(
        sellers_table.c.id,
        sellers_table.c.name,
        sellers_table.c.meta_data,
        sellers_table.c.filters,
        sellers_table.c.content,
        sellers_table.c.usage,
        sellers_table.c.content_hash,
    ).where(pubkey_field.in_(unique_pubkeys))

    result = await session.execute(stmt)
    seller_map: Dict[str, Dict[str, Any]] = {}
    for row in result.mappings():
        seller = dict(row)
        if _should_exclude_seller(seller):
            continue
        pubkeys = _extract_seller_pubkeys(seller)
        if not pubkeys:
            continue
        seller["normalized_pubkeys"] = pubkeys
        for key in pubkeys:
            seller_map[key] = seller
    return seller_map


async def search_sellers(
    session: AsyncSession,
    query_embedding: Sequence[float],
    limit: int,
    query_text: str | None = None,
    user_coordinates: Optional[Tuple[float, float]] = None,
    user_location: str | None = None,
) -> List[Dict[str, Any]]:
    distance_expr = sellers_table.c.embedding.cosine_distance(query_embedding).label(
        "vector_distance"
    )

    stmt = (
        select(
            sellers_table.c.id,
            sellers_table.c.name,
            sellers_table.c.meta_data,
            sellers_table.c.filters,
            sellers_table.c.content,
            sellers_table.c.usage,
            sellers_table.c.content_hash,
            distance_expr,
        )
        .order_by(distance_expr)
        .limit(max(limit * 3, limit))
    )

    result = await session.execute(stmt)
    rows = result.mappings().all()

    sellers: List[Dict[str, Any]] = []
    seller_pubkey_map: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        seller = dict(row)
        if _should_exclude_seller(seller):
            continue
        pubkeys = _extract_seller_pubkeys(seller)
        seller["normalized_pubkeys"] = pubkeys
        sellers.append(seller)
        for pubkey in pubkeys:
            seller_pubkey_map[pubkey] = seller
        if len(sellers) >= limit:
            break

    public_keys = list(dict.fromkeys(seller_pubkey_map.keys()))
    listings_map = await get_listings_by_public_keys(session, public_keys)

    listing_matches: List[Dict[str, Any]] = []
    if query_text:
        product_limit = max(limit, 1) * max(settings.listings_per_seller or 1, 1)
        listing_matches = await search_listings_by_text(
            session, query_text, product_limit
        )

        normalized_matches: List[Dict[str, Any]] = []
        missing_pubkeys: List[str] = []
        for match in listing_matches:
            pubkey = match["pubkey"]
            candidate_keys = _normalize_pubkeys([pubkey]) or [pubkey]
            normalized_pubkey = candidate_keys[0]
            match["normalized_pubkey"] = normalized_pubkey
            normalized_matches.append(match)
            for candidate in candidate_keys:
                if (
                    candidate not in seller_pubkey_map
                    and candidate not in missing_pubkeys
                ):
                    missing_pubkeys.append(candidate)

        listing_matches = normalized_matches
        if missing_pubkeys:
            extra_sellers = await _fetch_sellers_by_public_keys(
                session, missing_pubkeys
            )
            seen_sellers: set[int] = set()
            for seller in extra_sellers.values():
                sid = id(seller)
                if sid in seen_sellers:
                    continue
                seen_sellers.add(sid)
                seller.setdefault("vector_distance", None)
                if seller not in sellers:
                    sellers.append(seller)
                for key in seller.get("normalized_pubkeys", []):
                    seller_pubkey_map[key] = seller

        missing_listing_pubkeys = [
            key
            for key in dict.fromkeys(
                candidate
                for seller in sellers
                for candidate in seller.get("normalized_pubkeys", [])
            )
            if key not in listings_map
        ]
        if missing_listing_pubkeys:
            extra_listings = await get_listings_by_public_keys(
                session, missing_listing_pubkeys
            )
            listings_map.update(extra_listings)

        merged_sellers: Dict[str, Dict[str, Any]] = {}
        for seller in sellers:
            normalized_keys = seller.get("normalized_pubkeys") or []
            canonical_key = _select_canonical_key(normalized_keys)
            if not canonical_key:
                fallback_id = seller.get("id") or seller.get("name")
                if isinstance(fallback_id, str):
                    canonical_key = fallback_id.strip().lower()
            if not canonical_key:
                continue

            existing = merged_sellers.get(canonical_key)
            if existing:
                existing_keys = set(existing.get("normalized_pubkeys", []))
                for key in normalized_keys:
                    if key not in existing_keys:
                        existing.setdefault("normalized_pubkeys", []).append(key)
                        existing_keys.add(key)
                existing_listings = existing.setdefault("listings", [])
                new_listings = seller.get("listings", [])
                seen_listing_ids = {
                    item.get("id") for item in existing_listings if item.get("id")
                }
                for item in new_listings:
                    item_id = item.get("id")
                    if item_id and item_id in seen_listing_ids:
                        continue
                    if item_id:
                        seen_listing_ids.add(item_id)
                    existing_listings.append(item)
                existing["vector_distance"] = min(
                    float(existing.get("vector_distance") or float("inf")),
                    float(seller.get("vector_distance") or float("inf")),
                )
                existing["score"] = max(
                    float(existing.get("score") or 0.0),
                    float(seller.get("score") or 0.0),
                )
            else:
                merged_sellers[canonical_key] = seller

        sellers = list(merged_sellers.values())
        seller_pubkey_map = {}
        for seller in sellers:
            for key in seller.get("normalized_pubkeys", []):
                seller_pubkey_map[key] = seller

        for match in listing_matches:
            pubkey = match.get("normalized_pubkey") or match.get("pubkey")
            listing = match["listing"]
            listing_bucket = listings_map.setdefault(pubkey, [])
            if not any(
                existing.get("id") == listing.get("id") for existing in listing_bucket
            ):
                listing_bucket.append(listing)
            seller = seller_pubkey_map.get(pubkey)
            if seller is not None:
                seller_score = max(
                    float(seller.get("score", 0.0) or 0.0),
                    float(match.get("score", 0.0)),
                )
                seller["score"] = seller_score

    ranked_sellers: List[Dict[str, Any]] = []
    for seller in sellers:
        collected: List[Dict[str, Any]] = []
        ids_seen = set()
        for key in seller.get("normalized_pubkeys", []):
            for item in listings_map.get(key, []):
                item_id = item.get("id")
                if item_id and item_id in ids_seen:
                    continue
                if item_id:
                    ids_seen.add(item_id)
                collected.append(item)

        trimmed_listings, best_listing_score = filter_and_rank_listings(
            collected,
            query_text,
            settings.listings_per_seller,
        )
        # Compute per-listing geo distances and maps links if user coords provided
        if user_coordinates is not None:
            user_lat, user_lon = user_coordinates
            min_geo_distance: float | None = None
            min_coords: tuple[float, float] | None = None
            for listing in trimmed_listings:
                lat = listing.get("latitude")
                lon = listing.get("longitude")
                if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
                    d_km = haversine_km(
                        float(lat), float(lon), float(user_lat), float(user_lon)
                    )
                    listing["geo_distance_km"] = d_km
                    listing["maps_url"] = build_maps_url(float(lat), float(lon))
                    if min_geo_distance is None or d_km < min_geo_distance:
                        min_geo_distance = d_km
                        min_coords = (float(lat), float(lon))

            if min_geo_distance is not None:
                seller["geo_distance_km"] = min_geo_distance
                if min_coords is not None:
                    seller["latitude"], seller["longitude"] = min_coords
                    seller["maps_url"] = build_maps_url(min_coords[0], min_coords[1])

        seller["listings"] = trimmed_listings
        if seller.get("vector_distance") is None and best_listing_score > 0:
            boosted_score = min(1.0, 0.4 + 0.2 * min(best_listing_score, 4))
            seller["score"] = max(float(seller.get("score", 0.0) or 0.0), boosted_score)
        ranked_sellers.append(seller)

    def _sort_key(item: Dict[str, Any]) -> tuple:
        vector_distance = item.get("vector_distance")
        score = float(item.get("score", 0.0) or 0.0)
        if vector_distance is not None:
            adjusted_distance = float(vector_distance) - min(score, 1.0) * 0.1
            return (0, adjusted_distance)
        return (1, -score)

    ranked_sellers.sort(key=_sort_key)

    if user_location or user_coordinates:
        for seller in ranked_sellers:
            if user_location and not seller.get("user_location"):
                seller["user_location"] = user_location
            if user_coordinates and not seller.get("user_coordinates"):
                seller["user_coordinates"] = {
                    "latitude": user_coordinates[0],
                    "longitude": user_coordinates[1],
                }

    return ranked_sellers[:limit]


async def get_seller_by_id(
    session: AsyncSession, seller_id: str
) -> Dict[str, Any] | None:
    stmt = select(sellers_table).where(sellers_table.c.id == seller_id)
    result = await session.execute(stmt)
    row = result.mappings().first()
    if row is None:
        return None
    seller = dict(row)
    if _should_exclude_seller(seller):
        return None
    meta = seller.get("meta_data")
    pubkey = meta.get("public_key") if isinstance(meta, dict) else None
    if pubkey:
        listings_map = await get_listings_by_public_keys(session, [pubkey])
        seller["listings"] = listings_map.get(pubkey, [])
    else:
        seller["listings"] = []
    return seller
