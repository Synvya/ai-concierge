from typing import Any, Dict, List, Sequence

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, MetaData, String, Table, Text, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from .listings import get_listings_by_public_keys


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


async def search_sellers(
    session: AsyncSession,
    query_embedding: Sequence[float],
    limit: int,
) -> List[Dict[str, Any]]:
    distance = sellers_table.c.embedding.cosine_distance(query_embedding).label("distance")

    stmt = (
        select(
            sellers_table.c.id,
            sellers_table.c.name,
            sellers_table.c.meta_data,
            sellers_table.c.filters,
            sellers_table.c.content,
            sellers_table.c.usage,
            sellers_table.c.content_hash,
            distance,
        )
        .order_by(distance)
        .limit(max(limit * 3, limit))
    )

    result = await session.execute(stmt)
    rows = result.mappings().all()

    sellers: List[Dict[str, Any]] = []
    for row in rows:
        seller = dict(row)
        if _should_exclude_seller(seller):
            continue
        sellers.append(seller)
        if len(sellers) >= limit:
            break

    public_keys: List[str] = []
    for seller in sellers:
        meta = seller.get("meta_data")
        if isinstance(meta, dict):
            pubkey = meta.get("public_key")
            if isinstance(pubkey, str) and pubkey:
                public_keys.append(pubkey)

    listings_map = await get_listings_by_public_keys(session, public_keys)

    for seller in sellers:
        meta = seller.get("meta_data")
        pubkey = meta.get("public_key") if isinstance(meta, dict) else None
        seller["listings"] = listings_map.get(pubkey, []) if pubkey else []

    return sellers


async def get_seller_by_id(session: AsyncSession, seller_id: str) -> Dict[str, Any] | None:
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
