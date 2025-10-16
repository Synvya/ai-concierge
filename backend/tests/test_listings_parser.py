from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from app.repositories.listings import (
    _parse_classified_listing_row,
    _parse_listing,
    filter_and_rank_listings,
)


def test_parse_listing_with_price_and_tags() -> None:
    row = {
        "event_id": "evt1",
        "created_at": 1715731200,
        "tags": [
            ["title", "Sourdough Loaf"],
            ["summary", "Fresh bread baked every morning"],
            ["price", "9.50", "USD"],
            ["location", "Snoqualmie"],
            ["geohash", "c23q7u2hn"],
            ["status", "active"],
            ["published_at", "1715731200"],
            ["image", "https://example.com/bread.jpg"],
            ["t", "bakery"],
            ["url", "https://example.com/products/bread"],
        ],
        "content": "Handmade sourdough loaf with a crisp crust.",
    }

    listing = _parse_listing(row)
    assert listing is not None
    assert listing["id"] == "evt1"
    assert listing["title"] == "Sourdough Loaf"
    assert listing["summary"] == "Fresh bread baked every morning"
    assert listing["price"] == {"amount": 9.5, "currency": "USD"}
    assert listing["location"] == "Snoqualmie"
    assert listing["full_address"] == "Snoqualmie"
    assert listing["geohash"] == "c23q7u2hn"
    assert listing["latitude"] == pytest.approx(47.52894, rel=1e-5)
    assert listing["longitude"] == pytest.approx(-121.82711, rel=1e-5)
    assert listing["status"] == "active"
    assert listing["images"] == ["https://example.com/bread.jpg"]
    assert listing["tags"] == ["bakery"]
    assert listing["url"] == "https://example.com/products/bread"
    assert listing["content"] == "Handmade sourdough loaf with a crisp crust."
    assert listing["published_at"] == datetime.fromtimestamp(1715731200, tz=timezone.utc)


def test_parse_listing_with_created_at_fallback() -> None:
    row = {
        "event_id": "evt2",
        "created_at": 1700000000,
        "tags": [
            ["title", "Custom Bike Fitting"],
            ["summary", "Professional fitting session"],
            ["price", "120", "USD", "per-session"],
            ["status", "active"],
        ],
        "content": "",
    }

    listing = _parse_listing(row)
    assert listing is not None
    assert listing["id"] == "evt2"
    assert listing["price"] == {"amount": 120.0, "currency": "USD", "frequency": "per-session"}
    assert listing["published_at"] == datetime.fromtimestamp(1700000000, tz=timezone.utc)


def test_filter_and_rank_listings_prioritizes_query_matches() -> None:
    published = datetime(2024, 5, 15, tzinfo=timezone.utc)
    listings = [
        {
            "id": "l1",
            "title": "Maple Latte",
            "summary": "Rich espresso with local maple syrup",
            "published_at": published,
            "tags": ["coffee", "latte"],
        },
        {
            "id": "l2",
            "title": "Blueberry Muffin",
            "summary": "Freshly baked muffin",
            "published_at": published,
            "tags": ["bakery"],
        },
    ]

    filtered, best_score = filter_and_rank_listings(listings, "latte", max_items=4)
    assert [entry["id"] for entry in filtered] == ["l1"]
    assert best_score > 0


def test_filter_and_rank_listings_falls_back_to_recent_items() -> None:
    older = datetime(2024, 1, 1, tzinfo=timezone.utc)
    newer = datetime(2024, 6, 1, tzinfo=timezone.utc)
    listings = [
        {"id": "older", "title": "Vintage Lamp", "published_at": older, "tags": []},
        {"id": "newer", "title": "Modern Desk", "published_at": newer, "tags": []},
    ]

    filtered, best_score = filter_and_rank_listings(listings, "garden tools", max_items=3)
    assert [entry["id"] for entry in filtered] == ["newer", "older"]
    assert best_score == 0


def test_filter_and_rank_listings_respects_zero_max_items() -> None:
    listings = [
        {"id": "only", "title": "Test Item", "published_at": datetime.now(tz=timezone.utc), "tags": []},
    ]
    filtered, best_score = filter_and_rank_listings(listings, "test", max_items=0)
    assert filtered == []
    assert best_score == 0


def test_parse_classified_listing_row_extracts_product_details() -> None:
    row = {
        "meta_data": {
            "type": "classified_listing",
            "seller": "npub123",
            "location": "Pressed on Main",
            "categories": ["beverage", "smoothie"],
            "visibility": "on-sale",
        },
        "content": json.dumps(
            {
                "id": "sq-123",
                "title": "Energy Smoothie",
                "summary": "Charge up your day",
                "description": "**Energy Smoothie**",
                "location": "123 Main Street, Snoqualmie, WA",
                "geohash": "c23q7u2hn",
                "price": {"amount": 4.99, "currency": "USD"},
                "images": [{"url": "https://example.com/smoothie.jpg"}],
                "categories": ["smoothie", "beverage"],
                "seller": "npub123",
            }
        ),
    }

    seller, listing = _parse_classified_listing_row(row)
    assert seller == "npub123"
    assert listing is not None
    assert listing["title"] == "Energy Smoothie"
    assert listing["summary"] == "Charge up your day"
    assert listing["price"] == {"amount": 4.99, "currency": "USD"}
    assert listing["images"] == ["https://example.com/smoothie.jpg"]
    assert listing["tags"] == ["smoothie", "beverage"]
    assert listing["geohash"] == "c23q7u2hn"
    assert listing["full_address"] == "123 Main Street, Snoqualmie, WA"
    assert listing["latitude"] == pytest.approx(47.52894, rel=1e-5)
    assert listing["longitude"] == pytest.approx(-121.82711, rel=1e-5)


def test_parse_classified_listing_row_handles_string_metadata() -> None:
    row = {
        "meta_data": json.dumps({"type": "classified_listing", "seller": "npub456"}),
        "content": json.dumps(
            {
                "id": "sq-456",
                "title": "Cinnamon Muffin",
                "summary": "Delicious and gluten free",
                "description": "Freshly baked each morning",
                "price": {"amount": 3.99, "currency": "USD"},
                "seller": "npub456",
                "location": "Pressed on Main",
            }
        ),
    }

    seller, listing = _parse_classified_listing_row(row)
    assert seller == "npub456"
    assert listing is not None
    assert listing["title"] == "Cinnamon Muffin"
    assert listing["summary"] == "Delicious and gluten free"
    assert listing["price"] == {"amount": 3.99, "currency": "USD"}
    assert listing.get("full_address") == "Pressed on Main"
    assert listing.get("geohash") is None
