from __future__ import annotations

import pytest

from app.utils.geolocation import build_maps_url, decode_geohash, haversine_km


def test_decode_geohash_returns_coordinates() -> None:
    latitude, longitude = decode_geohash("c23q7u2hn")
    assert latitude == pytest.approx(47.52894, rel=1e-5)
    assert longitude == pytest.approx(-121.82711, rel=1e-5)


def test_decode_geohash_handles_invalid_inputs() -> None:
    assert decode_geohash("invalid!") is None
    assert decode_geohash("") is None
    assert decode_geohash(None) is None  # type: ignore[arg-type]


def test_haversine_km_basic_values() -> None:
    # Same point should be 0
    assert haversine_km(0.0, 0.0, 0.0, 0.0) == 0.0

    # Known approximate distance: NYC (40.7128,-74.0060) to LA (34.0522,-118.2437)
    d = haversine_km(40.7128, -74.0060, 34.0522, -118.2437)
    # Approx 3936 km; allow tolerance
    assert d == pytest.approx(3936, rel=0.02)


def test_build_maps_url_format() -> None:
    url = build_maps_url(47.6062, -122.3321)
    assert url.startswith("https://www.google.com/maps/search/?api=1&query=")
    assert "47.606200%2C-122.332100" in url
