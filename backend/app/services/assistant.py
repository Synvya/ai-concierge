import asyncio
import os

# Make tenacity optional at import time so tests for _build_context don't require it
try:  # pragma: no cover
    from tenacity import retry, stop_after_attempt, wait_random_exponential
except ImportError:  # pragma: no cover

    def retry(*_args, **_kwargs):  # type: ignore
        def _decorator(func):
            return func

        return _decorator

    def stop_after_attempt(*_args, **_kwargs):  # type: ignore
        return None

    def wait_random_exponential(*_args, **_kwargs):  # type: ignore
        return None


from ..schemas import ChatMessage, SellerResult
from ..utils.geolocation import build_maps_url, decode_geohash, haversine_km


class AssistantError(RuntimeError):
    pass


def _build_context(results: list[SellerResult]) -> str:
    def _format_distance_km(km: float | None) -> str | None:
        if km is None:
            return None
        if not isinstance(km, (int, float)):
            return None
        miles = km * 0.621371
        return f"{miles:.1f} mi ({km:.1f} km)"

    def _coords(result_like) -> tuple[float | None, float | None]:
        lat = getattr(result_like, "latitude", None)
        lon = getattr(result_like, "longitude", None)
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            return float(lat), float(lon)
        # Fallback to geohash decoding if available
        geoh = getattr(result_like, "geohash", None)
        if isinstance(geoh, str):
            decoded = decode_geohash(geoh)
            if decoded:
                return float(decoded[0]), float(decoded[1])
        return None, None

    def _geohash_mismatch_warning(result_like) -> str | None:
        geoh = getattr(result_like, "geohash", None)
        lat = getattr(result_like, "latitude", None)
        lon = getattr(result_like, "longitude", None)
        if (
            isinstance(geoh, str)
            and isinstance(lat, (int, float))
            and isinstance(lon, (int, float))
        ):
            decoded = decode_geohash(geoh)
            if decoded:
                d_km = haversine_km(
                    float(decoded[0]), float(decoded[1]), float(lat), float(lon)
                )
                if d_km and d_km > 1.0:  # consider >1km a mismatch
                    return "Warning: geohash-derived coordinates may not match provided coordinates/address."
        return None

    lines = []
    for idx, result in enumerate(results, start=1):
        meta = result.meta_data or {}
        location_city = meta.get("city")
        tags = ", ".join(meta.get("hashtags", [])) if meta.get("hashtags") else ""

        # Seller-level address and coordinates
        seller_address = result.full_address or location_city
        seller_lat, seller_lon = _coords(result)
        seller_distance = _format_distance_km(result.geo_distance_km)
        seller_map = result.maps_url
        if not seller_map and seller_lat is not None and seller_lon is not None:
            seller_map = build_maps_url(seller_lat, seller_lon)

        # Build listing lines with optional distance
        listing_lines: list[str] = []
        for listing in result.listings:
            price_parts: list[str] = []
            if listing.price:
                if listing.price.amount is not None:
                    price_parts.append(f"{listing.price.amount:g}")
                if listing.price.currency:
                    price_parts.append(listing.price.currency)
                if listing.price.frequency:
                    price_parts.append(listing.price.frequency)
            price_str = f" ({' '.join(price_parts)})" if price_parts else ""
            detail = listing.summary or listing.content or ""
            detail_str = f" – {detail}" if detail else ""

            # Per-listing distance if available
            l_dist = _format_distance_km(listing.geo_distance_km)
            l_dist_str = f" [{l_dist}]" if l_dist else ""

            listing_lines.append(
                f"     - {listing.title}{price_str}{detail_str}{l_dist_str}"
            )

        listings_block = ""
        if listing_lines:
            listings_block = "\n   Products & Services:\n" + "\n".join(listing_lines)

        # Optional warnings
        warnings: list[str] = []
        seller_warning = _geohash_mismatch_warning(result)
        if seller_warning:
            warnings.append(seller_warning)
        # Also surface per-listing mismatches succinctly
        for listing in result.listings:
            w = _geohash_mismatch_warning(listing)
            if w:
                warnings.append(f"Listing '{listing.title}': {w}")
                break  # keep context concise – show first occurrence only
        warnings_block = ("\n   " + "\n   ".join(warnings)) if warnings else ""

        # Compose seller entry
        coords_str = (
            f"{seller_lat:.6f}, {seller_lon:.6f}"
            if seller_lat is not None and seller_lon is not None
            else "Unknown"
        )
        distance_str = seller_distance or "Unknown"
        address_str = seller_address or "Unknown"
        map_str = f"\n   Map: {seller_map}" if seller_map else ""

        lines.append(
            f"{idx}. {result.name or 'Unknown'} (score: {result.score:.3f})\n"
            f"   Summary: {result.content or 'No description provided.'}\n"
            f"   Address: {address_str}\n"
            f"   Coordinates: {coords_str}\n"
            f"   Distance: {distance_str}{map_str}\n"
            f"   City: {location_city or 'Unknown'}\n"
            f"   Tags: {tags}"
            f"{warnings_block}"
            f"{listings_block}"
        )
    return "\n".join(lines)


@retry(wait=wait_random_exponential(multiplier=1, max=20), stop=stop_after_attempt(3))
async def generate_response(
    query: str,
    results: list[SellerResult],
    history: list[ChatMessage],
) -> str:
    """Call OpenAI to craft a concierge-style response."""

    def _call() -> str:
        # Lazy import to avoid dependency requirements when only using _build_context in tests
        from ..core.config import get_settings

        try:
            from openai import OpenAI  # type: ignore
        except ImportError as exc:  # pragma: no cover
            raise AssistantError("OpenAI SDK is not installed") from exc

        settings = get_settings()
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise AssistantError("OPENAI_API_KEY is not configured")

        system_prompt = (
            "You are a friendly AI concierge helping people discover local businesses. "
            "Use ONLY the facts present in the provided business context—do not infer or embellish missing details. "
            "Be proximity-aware: when distances are provided, reference them succinctly in miles and/or kilometers. "
            "Highlight pickup vs. delivery options only when the distance suggests feasibility (e.g., very close). "
            "Include the map link sparingly (at most once per recommendation) when it meaningfully helps. "
            "If any location data is missing or uncertain, explicitly mention that limitation. "
            "Respond concisely with at most three recommendations, include the city and a verbatim highlight drawn from the context, "
            "and suggest a follow-up only when it clearly adds value."
        )
        messages = [
            {"role": "system", "content": system_prompt},
        ]

        for msg in history[-6:]:
            messages.append({"role": msg.role, "content": msg.content})

        context_block = (
            _build_context(results) if results else "No relevant businesses found."
        )
        user_prompt = (
            f"User question: {query}\n\n" f"Business context:\n{context_block}"
        )
        messages.append({"role": "user", "content": user_prompt})

        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=settings.openai_assistant_model,
            temperature=0.4,
            messages=messages,  # type: ignore[arg-type]
        )
        choice = response.choices[0].message
        return choice.content or "I couldn't find anything right now, please try again."

    return await asyncio.to_thread(_call)
