import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..db import get_session
from ..repositories.sellers import search_sellers
from ..schemas import (
    ChatRequest,
    ChatResponse,
    ModificationResponseAction,
    ReservationAction,
    SellerResult,
)
from ..services.analytics import analytics_service
from ..services.assistant import generate_response
from ..services.embedding import embed_text


router = APIRouter(prefix="/chat", tags=["chat"])
settings = get_settings()
logger = logging.getLogger(__name__)


@router.post("", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    session: AsyncSession = Depends(get_session),
) -> ChatResponse:
    session_id = payload.session_id or str(uuid.uuid4())
    top_k = payload.top_k or settings.search_top_k
    user_coordinates = payload.user_coordinates
    user_location = payload.user_location
    coordinates_tuple = None
    if user_coordinates is not None:
        coordinates_tuple = (user_coordinates.latitude, user_coordinates.longitude)

    query_embedding = await embed_text(payload.message)
    sellers = await search_sellers(
        session=session,
        query_embedding=query_embedding,
        limit=top_k,
        query_text=payload.message,
        user_coordinates=coordinates_tuple,
        user_location=user_location,
    )

    results = [SellerResult(**seller) for seller in sellers]

    answer, function_call_data, modification_response_data = await generate_response(
        payload.message, results, payload.history, payload.active_reservation_context, payload.user_datetime
    )

    # Convert function call data to ReservationAction if present
    reservation_action = None
    if function_call_data:
        try:
            reservation_action = ReservationAction(**function_call_data)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to create ReservationAction: %s", exc)

    # Convert modification response data to ModificationResponseAction if present
    modification_response_action = None
    if modification_response_data:
        try:
            modification_response_action = ModificationResponseAction(**modification_response_data)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to create ModificationResponseAction: %s", exc)

    analytics_summary = None
    try:
        analytics_summary = await asyncio.wait_for(
            analytics_service.record_query(
                visitor_id=payload.visitor_id or session_id,
                session_id=session_id,
                query=payload.message,
            ),
            timeout=3,
        )
    except asyncio.TimeoutError:
        logger.warning("analytics_record_timeout session_id=%s", session_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "analytics_record_failed session_id=%s error=%s", session_id, exc
        )

    debug_payload = None
    if payload.debug and analytics_summary is not None:
        debug_payload = {
            "embedding_length": len(query_embedding),
            "raw_results": sellers,
            "analytics": analytics_summary,
            "user_location": user_location,
            "user_coordinates": coordinates_tuple,
        }

    return ChatResponse(
        session_id=session_id,
        answer=answer,
        results=results,
        query=payload.message,
        top_k=top_k,
        debug_payload=debug_payload,
        user_location=user_location,
        user_coordinates=user_coordinates,
        reservation_action=reservation_action,
        modification_response_action=modification_response_action,
    )
