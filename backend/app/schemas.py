from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    environment: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    visitor_id: Optional[str] = None
    history: List[ChatMessage] = Field(default_factory=list)
    top_k: Optional[int] = None
    debug: bool = False


class SearchRequest(BaseModel):
    query: str
    top_k: Optional[int] = None
    debug: bool = False


class SellerResult(BaseModel):
    id: str
    name: Optional[str] = None
    meta_data: Optional[Dict[str, Any]] = None
    filters: Optional[Dict[str, Any]] = None
    content: Optional[str] = None
    distance: Optional[float] = None
    score: float = Field(default=0.0)

    def model_post_init(self, __context: Any) -> None:  # type: ignore[override]
        if self.distance is not None and self.distance != 0:
            self.score = max(0.0, 1.0 - self.distance)


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    results: List[SellerResult]
    query: str
    top_k: int
    debug_payload: Optional[Dict[str, Any]] = None


class SearchResponse(BaseModel):
    results: List[SellerResult]
    query: str
    top_k: int
    debug_payload: Optional[Dict[str, Any]] = None
