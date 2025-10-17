from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

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
    session_id: Optional[str] = None
    visitor_id: Optional[str] = None
    history: List[ChatMessage] = Field(default_factory=list)
    top_k: Optional[int] = None
    debug: bool = False
    user_location: Optional[str] = None
    user_coordinates: Optional[GeoPoint] = None


class SearchRequest(BaseModel):
    query: str
    top_k: Optional[int] = None
    debug: bool = False
    user_location: Optional[str] = None
    user_coordinates: Optional[GeoPoint] = None


class ListingPrice(BaseModel):
    amount: Optional[float] = None
    currency: Optional[str] = None
    frequency: Optional[str] = None


class ProductListing(BaseModel):
    id: str
    title: str
    summary: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    location: Optional[str] = None
    full_address: Optional[str] = None
    geohash: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    geo_distance_km: Optional[float] = None
    maps_url: Optional[str] = None
    price: Optional[ListingPrice] = None
    published_at: Optional[datetime] = None
    images: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    url: Optional[str] = None
    identifier: Optional[str] = None
    raw_tags: List[List[str]] = Field(default_factory=list)


class SellerResult(BaseModel):
    id: str
    name: Optional[str] = None
    meta_data: Optional[Dict[str, Any]] = None
    filters: Optional[Dict[str, Any]] = None
    content: Optional[str] = None
    full_address: Optional[str] = None
    geohash: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    vector_distance: Optional[float] = None
    geo_distance_km: Optional[float] = None
    score: float = Field(default=0.0)
    maps_url: Optional[str] = None
    listings: List[ProductListing] = Field(default_factory=list)
    user_location: Optional[str] = None
    user_coordinates: Optional[GeoPoint] = None

    def model_post_init(self, __context: Any) -> None:  # type: ignore[override]
        # Keep score separate from distances; do not auto-mutate based on distances.
        return


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    results: List[SellerResult]
    query: str
    top_k: int
    debug_payload: Optional[Dict[str, Any]] = None
    user_location: Optional[str] = None
    user_coordinates: Optional[GeoPoint] = None


class SearchResponse(BaseModel):
    results: List[SellerResult]
    query: str
    top_k: int
    debug_payload: Optional[Dict[str, Any]] = None
    user_location: Optional[str] = None
    user_coordinates: Optional[GeoPoint] = None


# Explicit re-exports to help strict type checkers and IDEs
__all__ = [
    "ListingPrice",
    "ProductListing",
    "SellerResult",
]
