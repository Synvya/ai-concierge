from __future__ import annotations

from app.schemas import (
    ChatRequest,
    ChatResponse,
    GeoPoint,
    ProductListing,
    SearchRequest,
    SearchResponse,
    SellerResult,
)


def test_chat_request_accepts_user_coordinates() -> None:
    payload = ChatRequest(
        message="Hello there",
        user_location="Seattle, WA",
        user_coordinates={"latitude": 47.6062, "longitude": -122.3321},
    )
    assert payload.user_location == "Seattle, WA"
    assert payload.user_coordinates is not None
    assert payload.user_coordinates.latitude == 47.6062
    assert payload.user_coordinates.longitude == -122.3321


def test_search_request_allows_user_coordinates() -> None:
    payload = SearchRequest(
        query="coffee",
        user_coordinates=GeoPoint(latitude=40.7128, longitude=-74.0060),
    )
    assert payload.user_coordinates is not None
    assert payload.user_coordinates.latitude == 40.7128
    assert payload.user_coordinates.longitude == -74.006


def test_seller_result_carries_user_location_context() -> None:
    seller = SellerResult(
        id="seller-1",
        score=0.5,
        listings=[],
        user_location="Portland, OR",
        user_coordinates={"latitude": 45.5152, "longitude": -122.6784},
    )
    assert seller.user_location == "Portland, OR"
    assert seller.user_coordinates is not None
    assert seller.user_coordinates.latitude == 45.5152
    assert seller.user_coordinates.longitude == -122.6784


def test_chat_response_includes_user_location_fields() -> None:
    seller = SellerResult(id="seller-2", score=0.2, listings=[])
    response = ChatResponse(
        session_id="session-123",
        answer="Here are some ideas.",
        results=[seller],
        query="something",
        top_k=3,
        user_location="Austin, TX",
        user_coordinates=GeoPoint(latitude=30.266666, longitude=-97.73333),
    )

    dumped = response.model_dump()
    assert dumped["user_location"] == "Austin, TX"
    assert dumped["user_coordinates"]["latitude"] == 30.266666
    assert dumped["user_coordinates"]["longitude"] == -97.73333


def test_search_response_includes_user_location_fields() -> None:
    seller = SellerResult(id="seller-3", score=0.1, listings=[])
    response = SearchResponse(
        results=[seller],
        query="ice cream",
        top_k=5,
        user_location="Denver, CO",
        user_coordinates={"latitude": 39.7392, "longitude": -104.9903},
    )

    dumped = response.model_dump()
    assert dumped["user_location"] == "Denver, CO"
    assert dumped["user_coordinates"]["latitude"] == 39.7392
    assert dumped["user_coordinates"]["longitude"] == -104.9903


def test_new_distance_and_maps_fields_present() -> None:
    listing = ProductListing(
        id="l1",
        title="Item",
        latitude=47.6,
        longitude=-122.3,
        geo_distance_km=1.23,
        maps_url="https://www.google.com/maps/search/?api=1&query=47.600000%2C-122.300000",
    )
    seller = SellerResult(
        id="s1",
        score=0.0,
        listings=[listing],
        vector_distance=0.12,
        geo_distance_km=1.23,
        maps_url="https://www.google.com/maps/search/?api=1&query=47.600000%2C-122.300000",
    )
    dumped = seller.model_dump()
    assert dumped["vector_distance"] == 0.12
    assert dumped["geo_distance_km"] == 1.23
    assert isinstance(dumped["maps_url"], str) and dumped["maps_url"].startswith(
        "https://"
    )
    assert (
        isinstance(dumped["listings"], list)
        and dumped["listings"][0]["geo_distance_km"] == 1.23
    )
