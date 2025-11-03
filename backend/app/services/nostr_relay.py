"""
Nostr Relay Service for NIP-89 Handler Discovery.

This service manages persistent connections to Nostr relays and queries for
NIP-89 Application Handler events to determine which restaurants support
reservation messaging.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from nostr_sdk import Alphabet, Client, Event, Filter, Kind, PublicKey, RelayUrl, SingleLetterTag


logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    """Cache entry for NIP-89 handler discovery results."""

    value: bool
    expires_at: datetime


@dataclass
class RelayMetrics:
    """Performance metrics for a relay."""

    url: str
    status: str = "disconnected"  # disconnected, connected, circuit_open
    query_count: int = 0
    error_count: int = 0
    consecutive_errors: int = 0
    total_latency_ms: float = 0.0
    last_error: str | None = None
    last_error_time: datetime | None = None
    circuit_open_until: datetime | None = None

    @property
    def avg_latency_ms(self) -> float:
        """Calculate average query latency."""
        if self.query_count == 0:
            return 0.0
        return self.total_latency_ms / self.query_count


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
        circuit_breaker_threshold: int = 3,
        circuit_breaker_timeout: int = 60,
    ):
        """
        Initialize relay pool.

        Args:
            relays: List of WebSocket relay URLs
            cache_ttl: Cache time-to-live in seconds (default: 300)
            connection_timeout: Connection timeout in seconds (default: 5)
            query_timeout: Query timeout in seconds (default: 3)
            circuit_breaker_threshold: Consecutive errors before opening circuit (default: 3)
            circuit_breaker_timeout: Seconds to wait before retrying failed relay (default: 60)
        """
        self.relays = relays
        self.cache_ttl = timedelta(seconds=cache_ttl)
        self.connection_timeout = connection_timeout
        self.query_timeout = query_timeout
        self.circuit_breaker_threshold = circuit_breaker_threshold
        self.circuit_breaker_timeout = timedelta(seconds=circuit_breaker_timeout)

        self.client: Client | None = None
        self.cache: dict[str, CacheEntry] = {}
        self.relay_metrics: dict[str, RelayMetrics] = {
            url: RelayMetrics(url=url) for url in relays
        }
        self._connection_lock = asyncio.Lock()
        self._cache_hits = 0
        self._cache_misses = 0

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
                    # Wrap string URL in RelayUrl instance
                    relay = RelayUrl.parse(relay_url)
                    await self.client.add_relay(relay)
                    if relay_url in self.relay_metrics:
                        self.relay_metrics[relay_url].status = "connected"
                    logger.info(f"Added Nostr relay: {relay_url}")
                except Exception as e:
                    if relay_url in self.relay_metrics:
                        self.relay_metrics[relay_url].status = "disconnected"
                        self.relay_metrics[relay_url].error_count += 1
                        self.relay_metrics[relay_url].consecutive_errors += 1
                        self.relay_metrics[relay_url].last_error = str(e)
                        self.relay_metrics[relay_url].last_error_time = datetime.now()
                    logger.warning(f"Failed to add relay {relay_url}: {e}")

            # Connect to relays
            try:
                await asyncio.wait_for(
                    self.client.connect(), timeout=self.connection_timeout
                )
                logger.info(f"Connected to {len(self.relays)} Nostr relays")
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
            # PublicKey.parse() handles hex, bech32 (npub), and NIP-21 uri formats
            pk = PublicKey.parse(npub)
            return pk.to_hex()
        except Exception as e:
            logger.warning(f"Failed to convert npub {npub}: {e}")
            return None

    async def check_handlers(self, npubs: list[str], d_tags: list[str] | None = None) -> dict[str, bool | None]:
        """
        Check NIP-89 handler support for multiple npubs.

        Queries relays for kind 31989 events with specified d tags to determine if
        restaurants have published handler recommendations.

        Args:
            npubs: List of Nostr public keys (npub format)
            d_tags: List of d tag values to query for (default: ["9901"] for reservation support)

        Returns:
            Dictionary mapping npub -> handler support status
            - True: Handler found
            - False: No handler (but npub is valid)
            - None: Query failed or timeout
        """
        # Default to checking reservation support (d:9901)
        if d_tags is None:
            d_tags = ["9901"]
        
        results: dict[str, bool | None] = {}
        uncached_npubs: list[str] = []

        # Build cache key from d_tags
        cache_key_suffix = "_".join(sorted(d_tags))
        
        # Check cache first
        now = datetime.now()
        for npub in npubs:
            cache_key = f"nip89:{cache_key_suffix}:{npub}"
            cached = self.cache.get(cache_key)

            if cached and cached.expires_at > now:
                results[npub] = cached.value
                self._cache_hits += 1
                logger.debug(f"Cache hit for {npub} (kinds {d_tags}): {cached.value}")
            else:
                uncached_npubs.append(npub)
                self._cache_misses += 1

        # Query relays for uncached npubs
        if uncached_npubs:
            logger.info(f"Querying NIP-89 handlers for {len(uncached_npubs)} npubs (kinds {d_tags})")

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
                    events = await self._query_relays(hex_pubkeys, d_tags)

                    # Build set of pubkeys that have handlers
                    handler_pubkeys = {event.author().to_hex() for event in events}

                    # Map results back to npubs and update cache
                    expires_at = now + self.cache_ttl
                    for hex_pk in hex_pubkeys:
                        npub = npub_to_hex_map[hex_pk]
                        has_handler = hex_pk in handler_pubkeys

                        results[npub] = has_handler
                        self.cache[f"nip89:{cache_key_suffix}:{npub}"] = CacheEntry(
                            value=has_handler, expires_at=expires_at
                        )
                        logger.debug(f"Cached result for {npub} (kinds {d_tags}): {has_handler}")

                except Exception as e:
                    logger.error(f"Failed to query NIP-89 handlers (kinds {d_tags}): {e}")
                    # Set all uncached to None on error
                    for npub in uncached_npubs:
                        if npub not in results:
                            results[npub] = None

        return results

    async def _query_relays(self, hex_pubkeys: list[str], d_tags: list[str]) -> list[Event]:
        """
        Query relays for NIP-89 handler events.

        Args:
            hex_pubkeys: List of hex public keys

        Returns:
            List of kind 31989 events with d:9901
        """
        start_time = time.time()

        try:
            client = await self._ensure_client()

            # Build filter for kind 31989 events with d:9901
            # These are recommendations for reservation.request handlers
            # Convert hex pubkeys to PublicKey instances
            author_pks = [PublicKey.parse(hex_pk) for hex_pk in hex_pubkeys]

            # Create SingleLetterTag for 'd' tag
            d_tag = SingleLetterTag.lowercase(Alphabet.D)

            filter_obj = (
                Filter()
                .kinds([Kind(31989)])  # Handler recommendations
                .authors(author_pks)  # From these restaurants
                .custom_tags(
                    d_tag, ["9901"]
                )  # For reservation.request (use custom_tags for list)
            )

            logger.debug(
                f"Querying relays for {len(hex_pubkeys)} authors, kind 31989, d:9901"
            )

            # Query with timeout using fetch_events which expects a Duration (timedelta)
            timeout_duration = timedelta(seconds=self.query_timeout)
            events_result = await client.fetch_events(filter_obj, timeout_duration)

            # Convert Events object to list
            events = events_result.to_vec()

            # Track successful query metrics
            latency_ms = (time.time() - start_time) * 1000
            for relay_url in self.relays:
                if relay_url in self.relay_metrics:
                    metrics = self.relay_metrics[relay_url]
                    metrics.query_count += 1
                    metrics.total_latency_ms += latency_ms
                    metrics.consecutive_errors = 0  # Reset on success

            logger.info(
                f"Found {len(events)} NIP-89 handler events (d:{d_tags}) in {latency_ms:.0f}ms"
            )
            return events  # Already a list from to_vec()

        except asyncio.TimeoutError:
            latency_ms = (time.time() - start_time) * 1000
            logger.warning(f"Relay query timed out after {self.query_timeout}s")

            # Track timeout as error
            for relay_url in self.relays:
                if relay_url in self.relay_metrics:
                    self._record_query_error(relay_url, "Timeout")

            return []
        except Exception as e:
            logger.error(f"Relay query failed: {e}")

            # Track error
            for relay_url in self.relays:
                if relay_url in self.relay_metrics:
                    self._record_query_error(relay_url, str(e))

            return []

    def _record_query_error(self, relay_url: str, error: str) -> None:
        """Record a query error and potentially open circuit breaker."""
        metrics = self.relay_metrics[relay_url]
        metrics.error_count += 1
        metrics.consecutive_errors += 1
        metrics.last_error = error
        metrics.last_error_time = datetime.now()

        # Open circuit breaker if threshold exceeded
        if metrics.consecutive_errors >= self.circuit_breaker_threshold:
            metrics.status = "circuit_open"
            metrics.circuit_open_until = datetime.now() + self.circuit_breaker_timeout
            logger.warning(
                f"Circuit breaker opened for {relay_url} "
                f"({metrics.consecutive_errors} consecutive errors)"
            )

    def clear_cache(self) -> None:
        """Clear the entire NIP-89 cache."""
        self.cache.clear()
        logger.info("NIP-89 cache cleared")

    def get_cache_stats(self) -> dict[str, Any]:
        """
        Get cache statistics including hit rate and relay metrics.

        Returns:
            Dictionary with cache stats and relay performance metrics
        """
        now = datetime.now()
        valid_entries = sum(
            1 for entry in self.cache.values() if entry.expires_at > now
        )

        total_requests = self._cache_hits + self._cache_misses
        hit_rate = self._cache_hits / total_requests if total_requests > 0 else 0.0

        # Build relay metrics
        relay_stats = {}
        for url, metrics in self.relay_metrics.items():
            # Check if circuit breaker should be closed
            if (
                metrics.status == "circuit_open"
                and metrics.circuit_open_until
                and metrics.circuit_open_until < now
            ):
                metrics.status = "connected"
                metrics.consecutive_errors = 0
                metrics.circuit_open_until = None
                logger.info(f"Circuit breaker closed for {url}, retrying")

            relay_stats[url] = {
                "status": metrics.status,
                "query_count": metrics.query_count,
                "error_count": metrics.error_count,
                "avg_latency_ms": round(metrics.avg_latency_ms, 2),
            }

        return {
            "cache": {
                "size": len(self.cache),
                "valid_entries": valid_entries,
                "expired_entries": len(self.cache) - valid_entries,
                "hit_rate": round(hit_rate, 3),
                "total_hits": self._cache_hits,
                "total_misses": self._cache_misses,
            },
            "relays": relay_stats,
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
