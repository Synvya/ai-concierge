#!/usr/bin/env python3
"""Check Italian restaurant data in detail."""
import asyncio
import json
import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import select

from app.db import AsyncSessionFactory
from app.repositories.listings import get_listings_by_public_keys
from app.repositories.sellers import sellers_table


async def main():
    async with AsyncSessionFactory() as session:
        # Find the Italian restaurants
        stmt = select(
            sellers_table.c.id,
            sellers_table.c.name,
            sellers_table.c.meta_data,
            sellers_table.c.filters,
            sellers_table.c.content,
        ).where(
            sellers_table.c.name.in_(["gianfrancoristoranteitaliano", "francescoristoranteitaliano"])
        )
        
        result = await session.execute(stmt)
        for row in result.mappings():
            seller = dict(row)
            print(f"\n=== {seller['name']} ===")
            print(f"ID: {seller['id']}")
            
            # Check content
            content = seller.get("content")
            print(f"\nContent type: {type(content)}")
            if isinstance(content, str):
                try:
                    content_parsed = json.loads(content)
                    print(f"Content (parsed): {json.dumps(content_parsed, indent=2)[:500]}")
                    print(f"\nHas latitude: {'latitude' in content_parsed}")
                    print(f"Has longitude: {'longitude' in content_parsed}")
                    print(f"Has geohash: {'geohash' in content_parsed}")
                    if 'geohash' in content_parsed:
                        print(f"Geohash value: {content_parsed.get('geohash')}")
                except Exception:
                    print(f"Content (raw): {content[:200]}")
            elif isinstance(content, dict):
                print(f"Content (dict): {json.dumps(content, indent=2)[:500]}")
                print(f"\nHas latitude: {'latitude' in content}")
                print(f"Has longitude: {'longitude' in content}")
                print(f"Has geohash: {'geohash' in content}")
                if 'geohash' in content:
                    print(f"Geohash value: {content.get('geohash')}")
            
            # Check meta_data
            meta = seller.get("meta_data") or {}
            print(f"\nMeta_data has latitude: {'latitude' in meta}")
            print(f"Meta_data has longitude: {'longitude' in meta}")
            print(f"Meta_data has geohash: {'geohash' in meta}")
            
            # Check filters
            filters = seller.get("filters") or {}
            print(f"\nFilters has geohash: {'geohash' in filters}")
            
            # Check for listings
            # Extract public key from content
            public_key = None
            if isinstance(content, dict):
                public_key = content.get("public_key")
            elif isinstance(content, str):
                try:
                    content_parsed = json.loads(content)
                    public_key = content_parsed.get("public_key")
                except Exception:
                    pass
            
            if public_key:
                print(f"\nPublic key: {public_key}")
                listings = await get_listings_by_public_keys(session, [public_key])
                if public_key in listings:
                    print(f"Found {len(listings[public_key])} listings")
                    for listing in listings[public_key][:3]:  # Show first 3
                        print(f"  Listing: {listing.get('title', 'No title')}")
                        print(f"    Has latitude: {'latitude' in listing}")
                        print(f"    Has longitude: {'longitude' in listing}")
                        print(f"    Has geohash: {'geohash' in listing}")
                        if listing.get('geohash'):
                            print(f"    Geohash: {listing.get('geohash')}")


if __name__ == "__main__":
    asyncio.run(main())

