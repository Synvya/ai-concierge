#!/usr/bin/env python3
"""Check what demo restaurant data exists and what distances are calculated."""
import asyncio
import sys
from pathlib import Path


# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import select

from app.db import AsyncSessionFactory
from app.repositories.sellers import search_sellers, sellers_table
from app.services.embedding import embed_text
from app.utils.geolocation import haversine_km


async def main():
    async with AsyncSessionFactory() as session:
        # Find demo Italian restaurants
        print("=== Searching for Demo Italian Restaurants ===\n")
        
        # Check what demo profiles exist
        stmt = select(
            sellers_table.c.id,
            sellers_table.c.name,
            sellers_table.c.meta_data,
            sellers_table.c.filters,
            sellers_table.c.content,
        )
        result = await session.execute(stmt)
        
        demo_profiles = []
        for row in result.mappings():
            seller = dict(row)
            meta = seller.get("meta_data") or {}
            filters = seller.get("filters") or {}
            
            # Check for demo flag
            is_demo = (
                meta.get("hashtag_demo") is True
                or filters.get("hashtag_demo") is True
                or (isinstance(meta.get("hashtags"), list) and "demo" in [str(h).lower() for h in meta.get("hashtags", [])])
            )
            
            if is_demo:
                name = seller.get("name") or "Unknown"
                content = seller.get("content") or {}
                if isinstance(content, dict):
                    display_name = content.get("display_name") or content.get("name") or name
                    city = content.get("city")
                    latitude = content.get("latitude")
                    longitude = content.get("longitude")
                    public_key = content.get("public_key")
                else:
                    display_name = name
                    city = None
                    latitude = None
                    longitude = None
                    public_key = None
                
                demo_profiles.append({
                    "id": seller.get("id"),
                    "name": name,
                    "display_name": display_name,
                    "city": city,
                    "latitude": latitude,
                    "longitude": longitude,
                    "public_key": public_key,
                    "meta_data": meta,
                    "filters": filters,
                })
        
        print(f"Found {len(demo_profiles)} demo profiles:\n")
        for profile in demo_profiles:
            print(f"  - {profile['display_name']} ({profile['name']})")
            print(f"    ID: {profile['id']}")
            print(f"    City: {profile['city']}")
            print(f"    Coordinates: {profile['latitude']}, {profile['longitude']}")
            print(f"    Public Key: {profile['public_key']}")
            print()
        
        # Now test the actual search
        print("\n=== Testing Search with 'italian restaurant' ===\n")
        user_lat = 47.6153
        user_lon = -122.3235
        print(f"User location: {user_lat}, {user_lon} (Seattle area)\n")
        
        query = "italian restaurant"
        query_embedding = await embed_text(query)
        
        results = await search_sellers(
            session=session,
            query_embedding=query_embedding,
            limit=10,
            query_text=query,
            user_coordinates=(user_lat, user_lon),
            user_location="Seattle, WA",
            show_demo_only=True,  # Demo mode
        )
        
        print(f"Found {len(results)} results:\n")
        for i, result in enumerate(results, 1):
            name = result.get("name") or "Unknown"
            geo_dist = result.get("geo_distance_km")
            latitude = result.get("latitude")
            longitude = result.get("longitude")
            npub = result.get("npub")
            normalized_pubkeys = result.get("normalized_pubkeys", [])
            
            print(f"{i}. {name}")
            print(f"   Coordinates: {latitude}, {longitude}")
            print(f"   Distance: {geo_dist} km ({geo_dist * 0.621371:.1f} mi)" if geo_dist else "   Distance: NOT CALCULATED")
            print(f"   npub: {npub}")
            print(f"   Public keys: {normalized_pubkeys}")
            
            # Manual distance calculation if coords are available
            if latitude and longitude:
                manual_dist = haversine_km(user_lat, user_lon, float(latitude), float(longitude))
                print(f"   Manual distance check: {manual_dist:.1f} km ({manual_dist * 0.621371:.1f} mi)")
            
            print()


if __name__ == "__main__":
    asyncio.run(main())

