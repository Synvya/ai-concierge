from typing import Any

from fastapi import APIRouter

from ..core.config import get_settings
from ..schemas import HealthResponse
from ..services.nostr_relay import get_relay_pool

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def healthcheck() -> HealthResponse:
    settings = get_settings()
    response_data: dict[str, Any] = {"status": "ok", "environment": settings.environment}
    
    # Try to get relay pool stats (may not exist yet if no queries have been made)
    try:
        pool = await get_relay_pool(
            relays=settings.nostr_relays,
            cache_ttl=settings.nip89_cache_ttl,
            connection_timeout=settings.nostr_connection_timeout,
            query_timeout=settings.nostr_query_timeout,
        )
        response_data["nip89"] = pool.get_cache_stats()
    except Exception:
        # If relay pool isn't initialized or fails, just skip metrics
        pass
    
    return HealthResponse(**response_data)
