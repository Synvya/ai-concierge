from typing import Any, Dict, List, Sequence

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, MetaData, String, Table, Text, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings


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
        .limit(limit)
    )

    result = await session.execute(stmt)
    rows = result.mappings().all()
    return [dict(row) for row in rows]


async def get_seller_by_id(session: AsyncSession, seller_id: str) -> Dict[str, Any] | None:
    stmt = select(sellers_table).where(sellers_table.c.id == seller_id)
    result = await session.execute(stmt)
    row = result.mappings().first()
    if row is None:
        return None
    return dict(row)
