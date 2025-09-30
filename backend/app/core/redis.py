from __future__ import annotations

from collections.abc import AsyncIterator

from redis.asyncio import Redis, from_url

from .config import get_settings

settings = get_settings()
redis_client: Redis = from_url(settings.redis_url, decode_responses=True)


async def get_redis() -> AsyncIterator[Redis]:
    yield redis_client
