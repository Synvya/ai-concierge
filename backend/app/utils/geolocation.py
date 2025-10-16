"""Geolocation helper utilities."""

from __future__ import annotations

from typing import Optional, Tuple

_GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def decode_geohash(geohash: str) -> Optional[Tuple[float, float]]:
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

