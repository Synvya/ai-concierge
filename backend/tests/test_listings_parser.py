from datetime import datetime, timezone

from app.repositories.listings import _parse_listing


def test_parse_listing_with_price_and_tags() -> None:
    row = {
        "event_id": "evt1",
        "created_at": 1715731200,
        "tags": [
            ["title", "Sourdough Loaf"],
            ["summary", "Fresh bread baked every morning"],
            ["price", "9.50", "USD"],
            ["location", "Snoqualmie"],
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
