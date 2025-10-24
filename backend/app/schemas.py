from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    environment: str


class ChatMessage(BaseModel):
    role: str
    content: str


class GeoPoint(BaseModel):
    latitude: float
    longitude: float


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    visitor_id: str | None = None
    history: list[ChatMessage] = Field(default_factory=list)
    top_k: int | None = None
    debug: bool = False
    user_location: str | None = None
    user_coordinates: GeoPoint | None = None


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


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    results: list[SellerResult]
    query: str
    top_k: int
    debug_payload: dict[str, Any] | None = None
    user_location: str | None = None
    user_coordinates: GeoPoint | None = None


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
