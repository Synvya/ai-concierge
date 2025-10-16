from __future__ import annotations

import pytest

from app.utils.geolocation import decode_geohash


def test_decode_geohash_returns_coordinates() -> None:
    latitude, longitude = decode_geohash("c23q7u2hn")
    assert latitude == pytest.approx(47.52894, rel=1e-5)
    assert longitude == pytest.approx(-121.82711, rel=1e-5)


def test_decode_geohash_handles_invalid_inputs() -> None:
    assert decode_geohash("invalid!") is None
    assert decode_geohash("") is None
    assert decode_geohash(None) is None  # type: ignore[arg-type]

