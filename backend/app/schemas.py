from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    environment: str
    nip89: dict[str, Any] | None = None


class ChatMessage(BaseModel):
    role: str
    content: str


class GeoPoint(BaseModel):
    latitude: float
    longitude: float


class ActiveReservationContext(BaseModel):
    """Context from an active reservation thread (e.g., when user is responding to a modification request)"""
    restaurant_id: str
    restaurant_name: str
    npub: str
    party_size: int
    original_time: str
    suggested_time: str | None = None  # Deprecated: use modification_request.iso_time instead
    thread_id: str | None = None  # Thread ID to link acceptance to original request
    
class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    visitor_id: str | None = None
    history: list[ChatMessage] = Field(default_factory=list)
    top_k: int | None = None
    debug: bool = False
    user_location: str | None = None
    user_coordinates: GeoPoint | None = None
    active_reservation_context: ActiveReservationContext | None = None


class SearchRequest(BaseModel):
    query: str
    top_k: int | None = None
    debug: bool = False
    user_location: str | None = None
    user_coordinates: GeoPoint | None = None


class ListingPrice(BaseModel):
    amount: float | None = None
    currency: str | None = None
    frequency: str | None = None


class ProductListing(BaseModel):
    id: str
    title: str
    summary: str | None = None
    content: str | None = None
    status: str | None = None
    location: str | None = None
    full_address: str | None = None
    geohash: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    geo_distance_km: float | None = None
    maps_url: str | None = None
    price: ListingPrice | None = None
    published_at: datetime | None = None
    images: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    url: str | None = None
    identifier: str | None = None
    raw_tags: list[list[str]] = Field(default_factory=list)


class SellerResult(BaseModel):
    id: str
    name: str | None = None
    npub: str | None = None
    normalized_pubkeys: list[str] = Field(default_factory=list)
    supports_reservations: bool | None = Field(
        default=None,
        description="Whether restaurant supports reservations via Nostr (NIP-89 discovery)",
    )
    supports_modifications: bool | None = Field(
        default=None,
        description="Whether restaurant supports reservation modifications via Nostr (NIP-89 discovery for kinds 9903/9904)",
    )
    meta_data: dict[str, Any] | None = None
    filters: dict[str, Any] | None = None
    content: str | None = None
    full_address: str | None = None
    geohash: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    vector_distance: float | None = None
    geo_distance_km: float | None = None
    score: float = Field(default=0.0)
    maps_url: str | None = None
    listings: list[ProductListing] = Field(default_factory=list)
    user_location: str | None = None
    user_coordinates: GeoPoint | None = None

    def model_post_init(self, __context: Any) -> None:  # type: ignore[override]
        # Keep score separate from distances; do not auto-mutate based on distances.
        return


class ModificationResponseAction(BaseModel):
    """Structured modification response data returned by OpenAI function calling."""

    action: str = Field(
        default="send_modification_response",
        description="Action type: 'send_modification_response'"
    )
    restaurant_id: str = Field(description="Database ID of the restaurant")
    restaurant_name: str = Field(description="Name of the restaurant")
    npub: str = Field(description="Nostr public key (npub) of the restaurant")
    status: str = Field(
        description="Whether customer accepts or declines the modification",
        pattern="^(accepted|declined)$"
    )
    iso_time: str = Field(
        description="ISO 8601 datetime string with timezone (required if status is 'accepted')",
    )
    thread_id: str = Field(description="Modification request thread ID")
    message: str | None = Field(default=None, description="Optional message from customer")


class ReservationAction(BaseModel):
    """Structured reservation data returned by OpenAI function calling."""

    action: str = Field(
        description="Action type: 'send_reservation_request' or 'needs_confirmation'"
    )
    restaurant_id: str = Field(description="Database ID of the restaurant")
    restaurant_name: str = Field(description="Name of the restaurant")
    npub: str = Field(description="Nostr public key (npub) of the restaurant")
    party_size: int = Field(description="Number of guests", ge=1, le=20)
    iso_time: str = Field(
        description="ISO 8601 datetime string with timezone (e.g. 2025-10-25T15:00:00-07:00)"
    )
    notes: str | None = Field(default=None, description="Special requests or dietary restrictions")
    contact_name: str | None = Field(default=None, description="Guest name for the reservation")
    contact_phone: str | None = Field(default=None, description="Guest phone number for the reservation")
    thread_id: str | None = Field(default=None, description="Original reservation thread ID (for backward compatibility, not used for modification responses)")


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    results: list[SellerResult]
    query: str
    top_k: int
    debug_payload: dict[str, Any] | None = None
    user_location: str | None = None
    user_coordinates: GeoPoint | None = None
    reservation_action: ReservationAction | None = Field(
        default=None,
        description="Structured reservation data when OpenAI determines a booking is ready",
    )
    modification_response_action: ModificationResponseAction | None = Field(
        default=None,
        description="Structured modification response data when user accepts/declines a modification request",
    )


class SearchResponse(BaseModel):
    results: list[SellerResult]
    query: str
    top_k: int
    debug_payload: dict[str, Any] | None = None
    user_location: str | None = None
    user_coordinates: GeoPoint | None = None


# Explicit re-exports to help strict type checkers and IDEs
__all__ = [
    "ListingPrice",
    "ProductListing",
    "SellerResult",
]
