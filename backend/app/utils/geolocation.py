"""Geolocation helper utilities."""

from __future__ import annotations

import math


_GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def decode_geohash(geohash: str) -> tuple[float, float] | None:
    """Decode a geohash string into a latitude/longitude pair.

    Returns the midpoint of the decoded bounding box. If the geohash is invalid
    the function returns ``None`` instead of raising an exception.
    """
    if not isinstance(geohash, str):
        return None

    chunk = geohash.strip().lower()
    if not chunk:
        return None

    lat_interval = [-90.0, 90.0]
    lon_interval = [-180.0, 180.0]
    even = True

    for char in chunk:
        try:
            char_value = _GEOHASH_BASE32.index(char)
        except ValueError:
            return None

        for mask in (16, 8, 4, 2, 1):
            if even:
                _refine_interval(lon_interval, mask, char_value)
            else:
                _refine_interval(lat_interval, mask, char_value)
            even = not even

    latitude = (lat_interval[0] + lat_interval[1]) / 2.0
    longitude = (lon_interval[0] + lon_interval[1]) / 2.0
    return latitude, longitude


def _refine_interval(interval: list[float], mask: int, value: int) -> None:
    midpoint = (interval[0] + interval[1]) / 2.0
    if value & mask:
        interval[0] = midpoint
    else:
        interval[1] = midpoint


def haversine_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Compute the great-circle distance in kilometers between two points.

    Uses the haversine formula on a sphere with mean Earth radius 6371.0088 km.
    Inputs are expected in decimal degrees.
    """
    # Guard against obviously invalid values
    for v in (lat1, lon1, lat2, lon2):
        if not isinstance(v, (int, float)):
            return float("nan")

    rlat1 = math.radians(lat1)
    rlon1 = math.radians(lon1)
    rlat2 = math.radians(lat2)
    rlon2 = math.radians(lon2)

    dlat = rlat2 - rlat1
    dlon = rlon2 - rlon1

    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2.0) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return 6371.0088 * c


def build_maps_url(latitude: float, longitude: float) -> str:
    """Generate a Google Maps search URL for a given coordinate pair."""
    return f"https://www.google.com/maps/search/?api=1&query={latitude:.6f}%2C{longitude:.6f}"
