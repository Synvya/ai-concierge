"""
Nostr Relay Service for NIP-89 Handler Discovery.

This service manages persistent connections to Nostr relays and queries for
NIP-89 Application Handler events to determine which restaurants support
reservation messaging.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from nostr_sdk import Client, Event, Filter, PublicKey

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    """Cache entry for NIP-89 handler discovery results."""

    value: bool
    expires_at: datetime


class NostrRelayPool:
    """
    Persistent WebSocket pool for Nostr relay queries with caching.

    Manages connections to multiple relays and provides efficient batch queries
    for NIP-89 Application Handler discovery with in-memory caching.
    """

    def __init__(
        self,
        relays: list[str],
        cache_ttl: int = 300,
        connection_timeout: int = 5,
        query_timeout: int = 3,
    ):
        """
        Initialize relay pool.

        Args:
            relays: List of WebSocket relay URLs
            cache_ttl: Cache time-to-live in seconds (default: 300)
            connection_timeout: Connection timeout in seconds (default: 5)
            query_timeout: Query timeout in seconds (default: 3)
        """
        self.relays = relays
        self.cache_ttl = timedelta(seconds=cache_ttl)
        self.connection_timeout = connection_timeout
        self.query_timeout = query_timeout

        self.client: Client | None = None
        self.cache: dict[str, CacheEntry] = {}
        self._connection_lock = asyncio.Lock()

    async def _ensure_client(self) -> Client:
        """Ensure client is initialized and connected to relays."""
        if self.client is not None:
            return self.client

        async with self._connection_lock:
            # Double-check after acquiring lock
            if self.client is not None:
                return self.client

            # Initialize client
            self.client = Client()

            # Add relays
            for relay_url in self.relays:
                try:
                    await self.client.add_relay(relay_url)
                    logger.info(f"Added Nostr relay: {relay_url}")
                except Exception as e:
                    logger.warning(f"Failed to add relay {relay_url}: {e}")

            # Connect to relays
            try:
                await asyncio.wait_for(
                    self.client.connect(), timeout=self.connection_timeout
                )
                logger.info(
                    f"Connected to {len(self.relays)} Nostr relays"
                )
            except asyncio.TimeoutError:
                logger.warning("Relay connection timed out, continuing anyway")
            except Exception as e:
                logger.error(f"Failed to connect to relays: {e}")

            return self.client

    def _npub_to_hex(self, npub: str) -> str | None:
        """
        Convert npub to hex public key.

        Args:
            npub: Nostr public key in bech32 format (npub1...)

        Returns:
            Hex public key string, or None if conversion fails
        """
        try:
            pk = PublicKey.from_bech32(npub)
            return pk.to_hex()
        except Exception as e:
            logger.warning(f"Failed to convert npub {npub}: {e}")
            return None

    async def check_handlers(self, npubs: list[str]) -> dict[str, bool | None]:
        """
        Check NIP-89 handler support for multiple npubs.

        Queries relays for kind 31989 events with d:32101 to determine if
        restaurants have published reservation.request handlers.

        Args:
            npubs: List of Nostr public keys (npub format)

        Returns:
            Dictionary mapping npub -> supports_reservations status
            - True: Handler found
            - False: No handler (but npub is valid)
            - None: Query failed or timeout
        """
        results: dict[str, bool | None] = {}
        uncached_npubs: list[str] = []

        # Check cache first
        now = datetime.now()
        for npub in npubs:
            cache_key = f"nip89:{npub}"
            cached = self.cache.get(cache_key)

            if cached and cached.expires_at > now:
                results[npub] = cached.value
                logger.debug(f"Cache hit for {npub}: {cached.value}")
            else:
                uncached_npubs.append(npub)

        # Query relays for uncached npubs
        if uncached_npubs:
            logger.info(f"Querying NIP-89 handlers for {len(uncached_npubs)} npubs")

            # Convert npubs to hex
            hex_pubkeys: list[str] = []
            npub_to_hex_map: dict[str, str] = {}

            for npub in uncached_npubs:
                hex_pk = self._npub_to_hex(npub)
                if hex_pk:
                    hex_pubkeys.append(hex_pk)
                    npub_to_hex_map[hex_pk] = npub
                else:
                    # Invalid npub, set to None
                    results[npub] = None
                    logger.warning(f"Invalid npub: {npub}")

            # Query relays if we have valid hex pubkeys
            if hex_pubkeys:
                try:
                    events = await self._query_relays(hex_pubkeys)

                    # Build set of pubkeys that have handlers
                    handler_pubkeys = {event.author().to_hex() for event in events}

                    # Map results back to npubs and update cache
                    expires_at = now + self.cache_ttl
                    for hex_pk in hex_pubkeys:
                        npub = npub_to_hex_map[hex_pk]
                        has_handler = hex_pk in handler_pubkeys

                        results[npub] = has_handler
                        self.cache[f"nip89:{npub}"] = CacheEntry(
                            value=has_handler, expires_at=expires_at
                        )
                        logger.debug(f"Cached result for {npub}: {has_handler}")

                except Exception as e:
                    logger.error(f"Failed to query NIP-89 handlers: {e}")
                    # Set all uncached to None on error
                    for npub in uncached_npubs:
                        if npub not in results:
                            results[npub] = None

        return results

    async def _query_relays(self, hex_pubkeys: list[str]) -> list[Event]:
        """
        Query relays for NIP-89 handler events.

        Args:
            hex_pubkeys: List of hex public keys

        Returns:
            List of kind 31989 events with d:32101
        """
        try:
            client = await self._ensure_client()

            # Build filter for kind 31989 events with d:32101
            # These are recommendations for reservation.request handlers
            filter_obj = (
                Filter()
                .kinds([31989])  # Handler recommendations
                .authors(hex_pubkeys)  # From these restaurants
                .custom_tag("d", ["32101"])  # For reservation.request
            )

            logger.debug(
                f"Querying relays for {len(hex_pubkeys)} authors, kind 31989, d:32101"
            )

            # Query with timeout
            events = await asyncio.wait_for(
                client.get_events([filter_obj]), timeout=self.query_timeout
            )

            logger.info(f"Found {len(events)} NIP-89 handler events")
            return list(events)

        except asyncio.TimeoutError:
            logger.warning(
                f"Relay query timed out after {self.query_timeout}s"
            )
            return []
        except Exception as e:
            logger.error(f"Relay query failed: {e}")
            return []

    def clear_cache(self) -> None:
        """Clear the entire NIP-89 cache."""
        self.cache.clear()
        logger.info("NIP-89 cache cleared")

    def get_cache_stats(self) -> dict[str, Any]:
        """
        Get cache statistics.

        Returns:
            Dictionary with cache size and valid entry count
        """
        now = datetime.now()
        valid_entries = sum(
            1 for entry in self.cache.values() if entry.expires_at > now
        )

        return {
            "size": len(self.cache),
            "valid_entries": valid_entries,
            "expired_entries": len(self.cache) - valid_entries,
        }

    async def close(self) -> None:
        """Close all relay connections."""
        if self.client:
            try:
                await self.client.disconnect()
                logger.info("Disconnected from Nostr relays")
            except Exception as e:
                logger.warning(f"Error disconnecting from relays: {e}")
            finally:
                self.client = None


# Global pool instance (initialized on first use)
_relay_pool: NostrRelayPool | None = None


async def get_relay_pool(
    relays: list[str],
    cache_ttl: int = 300,
    connection_timeout: int = 5,
    query_timeout: int = 3,
) -> NostrRelayPool:
    """
    Get or create the global relay pool instance.

    Args:
        relays: List of relay URLs
        cache_ttl: Cache TTL in seconds
        connection_timeout: Connection timeout in seconds
        query_timeout: Query timeout in seconds

    Returns:
        Initialized NostrRelayPool instance
    """
    global _relay_pool

    if _relay_pool is None:
        _relay_pool = NostrRelayPool(
            relays=relays,
            cache_ttl=cache_ttl,
            connection_timeout=connection_timeout,
            query_timeout=query_timeout,
        )
        logger.info("Initialized global Nostr relay pool")

    return _relay_pool


async def shutdown_relay_pool() -> None:
    """Shutdown the global relay pool (called on app shutdown)."""
    global _relay_pool

    if _relay_pool:
        await _relay_pool.close()
        _relay_pool = None
        logger.info("Shutdown global Nostr relay pool")

