"""Test that the AI assistant respects distance constraints specified by users."""
from __future__ import annotations

from app.schemas import SellerResult
from app.services.assistant import _build_context


def test_context_includes_distance_information():
    """Verify that distance information is included in the context provided to the AI."""
    results = [
        SellerResult(
            id="restaurant1",
            name="Gianfranco Ristorante Italiano",
            content="Italian restaurant",
            score=0.95,
            geo_distance_km=12.5,  # ~7.8 miles - beyond 5 mile constraint
            latitude=47.5288,
            longitude=-121.8227,
            full_address="8150 Railroad Ave, Snoqualmie, WA",
            meta_data={"city": "Snoqualmie"},
            listings=[],
        ),
        SellerResult(
            id="restaurant2",
            name="Francesco Ristorante Italiano",
            content="Italian dining",
            score=0.93,
            geo_distance_km=13.2,  # ~8.2 miles - beyond 5 mile constraint
            latitude=47.5203,
            longitude=-121.8312,
            full_address="7708 Center Blvd SE, Snoqualmie, WA",
            meta_data={"city": "Snoqualmie"},
            listings=[],
        ),
    ]
    
    context = _build_context(results)
    
    # Verify distance information is prominently included
    assert "Distance: 7.8 mi (12.5 km)" in context
    assert "Distance: 8.2 mi (13.2 km)" in context
    
    # Verify restaurant names are included
    assert "Gianfranco Ristorante Italiano" in context
    assert "Francesco Ristorante Italiano" in context
    
    # The AI should see this information and make an intelligent decision
    # to exclude these results when the user asks for "within 5 miles"


def test_context_with_mixed_distances():
    """Test context with some results inside and some outside distance constraint."""
    results = [
        SellerResult(
            id="restaurant1",
            name="Nearby Italian",
            content="Close restaurant",
            score=0.95,
            geo_distance_km=3.2,  # ~2 miles - within 5 mile constraint
            latitude=47.6200,
            longitude=-122.3300,
            full_address="123 Main St, Seattle, WA",
            meta_data={"city": "Seattle"},
            listings=[],
        ),
        SellerResult(
            id="restaurant2",
            name="Far Italian",
            content="Distant restaurant",
            score=0.93,
            geo_distance_km=12.5,  # ~7.8 miles - beyond 5 mile constraint
            latitude=47.5288,
            longitude=-121.8227,
            full_address="456 Far Ave, Snoqualmie, WA",
            meta_data={"city": "Snoqualmie"},
            listings=[],
        ),
    ]
    
    context = _build_context(results)
    
    # Verify both distances are provided
    assert "Distance: 2.0 mi (3.2 km)" in context
    assert "Distance: 7.8 mi (12.5 km)" in context
    
    # The AI should intelligently filter:
    # - For "within 5 miles" query: show only Nearby Italian
    # - For "within 10 miles" query: show both
    # - For general query: show both, sorted by relevance/distance


def test_context_without_distance_information():
    """Test that context handles missing distance information gracefully."""
    results = [
        SellerResult(
            id="restaurant1",
            name="Italian Restaurant",
            content="Great food",
            score=0.95,
            # No geo_distance_km provided
            full_address="789 Unknown St",
            meta_data={"city": "Seattle"},
            listings=[],
        ),
    ]
    
    context = _build_context(results)
    
    # Verify that missing distance is handled
    assert "Distance: Unknown" in context
    assert "Italian Restaurant" in context
    
    # The AI should mention that distance information is unavailable
    # when the user asks for location-based filtering

