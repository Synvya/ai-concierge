from __future__ import annotations

# Pylint struggles to resolve the `app` package when run from repo root.
# Allow these imports in tests without affecting runtime correctness.
# pylint: disable=E0611,E0401
import os
import sys

# Ensure Pylint and runtime can resolve the `app` package from the repo root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.schemas import ListingPrice, ProductListing, SellerResult
from app.services.assistant import _build_context


def test_build_context_includes_location_details_and_map_link() -> None:
    listing = ProductListing(
        id="l1",
        title="Blueberry Muffin",
        summary="Freshly baked each morning",
        full_address="123 Main Street, Snoqualmie, WA",
        latitude=47.5289,
        longitude=-121.8271,
        geo_distance_km=1.3,
        price=ListingPrice(amount=3.50, currency="USD"),
    )
    result = SellerResult(
        id="s1",
        name="Pressed on Main",
        content="Local coffee and bakery",
        full_address="123 Main Street, Snoqualmie, WA",
        latitude=47.5289,
        longitude=-121.8271,
        geo_distance_km=1.3,
        listings=[listing],
        meta_data={"city": "Snoqualmie", "hashtags": ["coffee", "bakery"]},
        user_location="Downtown",
    )

    text = _build_context([result])

    assert "Address: 123 Main Street" in text
    assert "Coordinates: 47.528900, -121.827100" in text
    assert "Distance: 0.8 mi (1.3 km)" in text
    assert (
        "Map: https://www.google.com/maps/search/?api=1&query=47.528900%2C-121.827100"
        in text
    )
    assert "Products & Services:" in text
    assert "- Blueberry Muffin" in text
    assert "[0.8 mi (1.3 km)]" in text


def test_build_context_omits_when_data_absent() -> None:
    # No coordinates, geohash, or maps_url
    listing = ProductListing(
        id="l2",
        title="Cinnamon Roll",
        summary="Warm and flaky",
    )
    result = SellerResult(
        id="s2",
        name="Morning Treats",
        content="Bakery specials",
        listings=[listing],
        meta_data={"city": "Unknown"},
    )

    text = _build_context([result])

    assert "Coordinates: Unknown" in text
    assert "Distance: Unknown" in text
    assert "Map:" not in text
    # Listing line should not include distance bracket
    assert "[" not in text.split("Products & Services:")[-1]


def test_build_context_surfaces_geohash_mismatch_warning() -> None:
    # Geohash decodes near 47.52894,-121.82711; provided coords far enough to trigger warning
    listing = ProductListing(
        id="l3",
        title="Latte",
        geohash="c23q7u2hn",
        latitude=47.0,
        longitude=-121.0,
    )
    result = SellerResult(
        id="s3",
        name="Cafe",
        listings=[listing],
    )

    text = _build_context([result])
    assert "Listing 'Latte': Warning: geohash-derived coordinates may not match" in text
