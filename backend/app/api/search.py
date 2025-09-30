from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..db import get_session
from ..repositories.sellers import search_sellers
from ..schemas import SearchRequest, SearchResponse, SellerResult
from ..services.embedding import embed_text


router = APIRouter(prefix="/search", tags=["search"])
settings = get_settings()


@router.post("", response_model=SearchResponse)
async def search(
    payload: SearchRequest,
    session: AsyncSession = Depends(get_session),
) -> SearchResponse:
    top_k = payload.top_k or settings.search_top_k

    query_embedding = await embed_text(payload.query)
    sellers = await search_sellers(session=session, query_embedding=query_embedding, limit=top_k)
    results = [SellerResult(**seller) for seller in sellers]

    debug_payload = None
    if payload.debug:
        debug_payload = {
            "embedding_length": len(query_embedding),
            "raw_results": sellers,
        }

    return SearchResponse(results=results, query=payload.query, top_k=top_k, debug_payload=debug_payload)
