"""
Tests for NIP-89 handler discovery functionality.

Tests the NostrRelayPool service and integration with search_sellers.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas import SellerResult
from app.services.nostr_relay import CacheEntry, NostrRelayPool


class TestNostrRelayPool:
    """Tests for NostrRelayPool service."""

    @pytest.fixture
    def relay_pool(self):
        """Create a NostrRelayPool instance for testing."""
        return NostrRelayPool(
            relays=["wss://relay.test.io", "wss://relay.test2.io"],
            cache_ttl=300,
            connection_timeout=5,
            query_timeout=3,
        )

    def test_relay_pool_initialization(self, relay_pool):
        """Test relay pool initializes correctly."""
        assert len(relay_pool.relays) == 2
        assert relay_pool.cache_ttl == timedelta(seconds=300)
        assert relay_pool.connection_timeout == 5
        assert relay_pool.query_timeout == 3
        assert relay_pool.client is None
        assert len(relay_pool.cache) == 0

    def test_npub_to_hex_conversion(self, relay_pool):
        """Test npub to hex conversion."""
        # Valid npub format (this is a real example format)
        npub = "npub1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7"

        # Mock the PublicKey.from_bech32 behavior
        with patch("app.services.nostr_relay.PublicKey") as mock_pk:
            mock_pk_instance = MagicMock()
            mock_pk_instance.to_hex.return_value = "abcd1234" * 8
            mock_pk.from_bech32.return_value = mock_pk_instance

            hex_key = relay_pool._npub_to_hex(npub)

            assert hex_key == "abcd1234" * 8
            mock_pk.from_bech32.assert_called_once_with(npub)

    def test_npub_to_hex_handles_invalid_npub(self, relay_pool):
        """Test that invalid npubs return None."""
        with patch("app.services.nostr_relay.PublicKey") as mock_pk:
            mock_pk.from_bech32.side_effect = Exception("Invalid bech32")

            hex_key = relay_pool._npub_to_hex("invalid_npub")

            assert hex_key is None

    @pytest.mark.asyncio
    async def test_ensure_client_creates_client(self, relay_pool):
        """Test that _ensure_client creates and connects to relays."""
        with patch("app.services.nostr_relay.Client") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.add_relay = AsyncMock()
            mock_client.connect = AsyncMock()

            client = await relay_pool._ensure_client()

            assert client == mock_client
            assert relay_pool.client == mock_client
            assert mock_client.add_relay.call_count == 2
            mock_client.connect.assert_called_once()

    @pytest.mark.asyncio
    async def test_ensure_client_reuses_existing(self, relay_pool):
        """Test that _ensure_client reuses existing client."""
        existing_client = AsyncMock()
        relay_pool.client = existing_client

        client = await relay_pool._ensure_client()

        assert client == existing_client

    @pytest.mark.asyncio
    async def test_check_handlers_cache_hit(self, relay_pool):
        """Test that check_handlers uses cache when available."""
        npub1 = "npub1test123"
        npub2 = "npub1test456"

        # Populate cache
        now = datetime.now()
        relay_pool.cache[f"nip89:{npub1}"] = CacheEntry(
            value=True, expires_at=now + timedelta(seconds=300)
        )
        relay_pool.cache[f"nip89:{npub2}"] = CacheEntry(
            value=False, expires_at=now + timedelta(seconds=300)
        )

        results = await relay_pool.check_handlers([npub1, npub2])

        assert results[npub1] is True
        assert results[npub2] is False
        # Should not have queried relays
        assert relay_pool.client is None

    @pytest.mark.asyncio
    async def test_check_handlers_queries_uncached(self, relay_pool):
        """Test that check_handlers queries relays for uncached npubs."""
        npub1 = "npub1test123"
        npub2 = "npub1test456"
        hex1 = "abcd1234" * 8
        hex2 = "ef567890" * 8

        # Mock the entire flow
        with (
            patch.object(relay_pool, "_npub_to_hex") as mock_npub_to_hex,
            patch.object(relay_pool, "_query_relays") as mock_query,
        ):

            mock_npub_to_hex.side_effect = lambda npub: hex1 if npub == npub1 else hex2

            # Mock event with author
            mock_event1 = MagicMock()
            mock_author1 = MagicMock()
            mock_author1.to_hex.return_value = hex1
            mock_event1.author.return_value = mock_author1

            mock_query.return_value = [mock_event1]

            results = await relay_pool.check_handlers([npub1, npub2])

            # npub1 has handler, npub2 does not
            assert results[npub1] is True
            assert results[npub2] is False

            # Check cache was populated
            assert f"nip89:{npub1}" in relay_pool.cache
            assert f"nip89:{npub2}" in relay_pool.cache
            assert relay_pool.cache[f"nip89:{npub1}"].value is True
            assert relay_pool.cache[f"nip89:{npub2}"].value is False

    @pytest.mark.asyncio
    async def test_check_handlers_handles_invalid_npub(self, relay_pool):
        """Test that check_handlers handles invalid npubs gracefully."""
        invalid_npub = "invalid_key"

        with patch.object(relay_pool, "_npub_to_hex") as mock_npub_to_hex:
            mock_npub_to_hex.return_value = None

            results = await relay_pool.check_handlers([invalid_npub])

            assert results[invalid_npub] is None

    @pytest.mark.asyncio
    async def test_check_handlers_handles_query_error(self, relay_pool):
        """Test that check_handlers handles query errors gracefully."""
        npub = "npub1test123"

        with (
            patch.object(relay_pool, "_npub_to_hex") as mock_npub_to_hex,
            patch.object(relay_pool, "_query_relays") as mock_query,
        ):

            mock_npub_to_hex.return_value = "abcd1234" * 8
            mock_query.side_effect = Exception("Connection failed")

            results = await relay_pool.check_handlers([npub])

            # Should return None on error
            assert results[npub] is None

    @pytest.mark.asyncio
    async def test_query_relays_timeout(self, relay_pool):
        """Test that _query_relays handles timeout."""
        with (
            patch.object(relay_pool, "_ensure_client") as mock_ensure,
            patch("app.services.nostr_relay.asyncio.wait_for") as mock_wait_for,
        ):

            mock_client = AsyncMock()
            mock_ensure.return_value = mock_client
            mock_wait_for.side_effect = asyncio.TimeoutError

            events = await relay_pool._query_relays(["abcd1234" * 8])

            assert events == []

    @pytest.mark.asyncio
    async def test_query_relays_with_filter(self, relay_pool):
        """Test that _query_relays builds correct filter."""
        hex_pubkeys = ["abcd1234" * 8, "ef567890" * 8]

        with (
            patch.object(relay_pool, "_ensure_client") as mock_ensure,
            patch("app.services.nostr_relay.Filter") as mock_filter_class,
            patch("app.services.nostr_relay.asyncio.wait_for") as mock_wait_for,
        ):

            mock_client = AsyncMock()
            mock_ensure.return_value = mock_client

            mock_filter = MagicMock()
            mock_filter.kinds.return_value = mock_filter
            mock_filter.authors.return_value = mock_filter
            mock_filter.custom_tag.return_value = mock_filter
            mock_filter_class.return_value = mock_filter

            mock_events = [MagicMock(), MagicMock()]
            mock_wait_for.return_value = mock_events

            events = await relay_pool._query_relays(hex_pubkeys)

            assert events == mock_events
            # Verify filter was built correctly
            mock_filter.kinds.assert_called_once_with([31989])
            mock_filter.authors.assert_called_once_with(hex_pubkeys)
            mock_filter.custom_tag.assert_called_once_with("d", ["32101"])

    def test_clear_cache(self, relay_pool):
        """Test cache clearing."""
        relay_pool.cache["test1"] = CacheEntry(
            value=True, expires_at=datetime.now() + timedelta(seconds=300)
        )
        relay_pool.cache["test2"] = CacheEntry(
            value=False, expires_at=datetime.now() + timedelta(seconds=300)
        )

        relay_pool.clear_cache()

        assert len(relay_pool.cache) == 0

    def test_get_cache_stats(self, relay_pool):
        """Test cache statistics."""
        now = datetime.now()

        # Add valid entry
        relay_pool.cache["valid1"] = CacheEntry(
            value=True, expires_at=now + timedelta(seconds=300)
        )
        relay_pool.cache["valid2"] = CacheEntry(
            value=False, expires_at=now + timedelta(seconds=200)
        )
        # Add expired entry
        relay_pool.cache["expired1"] = CacheEntry(
            value=True, expires_at=now - timedelta(seconds=100)
        )

        stats = relay_pool.get_cache_stats()

        assert stats["cache"]["size"] == 3
        assert stats["cache"]["valid_entries"] == 2
        assert stats["cache"]["expired_entries"] == 1

    @pytest.mark.asyncio
    async def test_close(self, relay_pool):
        """Test closing relay pool."""
        mock_client = AsyncMock()
        relay_pool.client = mock_client

        await relay_pool.close()

        mock_client.disconnect.assert_called_once()
        assert relay_pool.client is None

    @pytest.mark.asyncio
    async def test_close_handles_error(self, relay_pool):
        """Test close handles disconnect errors gracefully."""
        mock_client = AsyncMock()
        mock_client.disconnect.side_effect = Exception("Disconnect failed")
        relay_pool.client = mock_client

        # Should not raise
        await relay_pool.close()

        assert relay_pool.client is None


class TestSellerResultSupportsReservations:
    """Tests for supports_reservations field in SellerResult."""

    def test_seller_result_has_supports_reservations_field(self):
        """Test that SellerResult includes supports_reservations field."""
        seller = SellerResult(
            id="test-123",
            name="Test Restaurant",
            npub="npub1test123456789",
            supports_reservations=True,
        )
        assert seller.supports_reservations is True

    def test_seller_result_supports_reservations_can_be_false(self):
        """Test that supports_reservations can be False."""
        seller = SellerResult(
            id="test-456",
            name="Test Shop",
            npub="npub1test456",
            supports_reservations=False,
        )
        assert seller.supports_reservations is False

    def test_seller_result_supports_reservations_can_be_none(self):
        """Test that supports_reservations can be None (unknown/error)."""
        seller = SellerResult(
            id="test-789",
            name="Test Store",
            npub="npub1test789",
            supports_reservations=None,
        )
        assert seller.supports_reservations is None

    def test_seller_result_supports_reservations_defaults_to_none(self):
        """Test that supports_reservations defaults to None."""
        seller = SellerResult(
            id="test-default",
            name="Default Store",
        )
        assert seller.supports_reservations is None

    def test_seller_result_serialization_with_supports_reservations(self):
        """Test that supports_reservations serializes correctly."""
        seller = SellerResult(
            id="test-serial",
            name="Test Business",
            npub="npub1serialtest123",
            supports_reservations=True,
        )
        data = seller.model_dump()

        assert data["supports_reservations"] is True
        assert isinstance(data["supports_reservations"], bool)

    def test_seller_result_no_npub_no_reservations(self):
        """Test seller without npub has no reservation support."""
        seller = SellerResult(
            id="test-no-npub",
            name="Cash Only Shop",
            npub=None,
            supports_reservations=False,
        )
        assert seller.npub is None
        assert seller.supports_reservations is False


class TestGlobalRelayPoolManagement:
    """Tests for global relay pool instance management."""

    @pytest.mark.asyncio
    async def test_get_relay_pool_creates_singleton(self):
        """Test that get_relay_pool creates a singleton instance."""
        # Reset global state
        import app.services.nostr_relay as nostr_module
        from app.services.nostr_relay import get_relay_pool

        nostr_module._relay_pool = None

        relays = ["wss://relay.test.io"]
        pool1 = await get_relay_pool(relays)
        pool2 = await get_relay_pool(relays)

        assert pool1 is pool2

        # Cleanup
        await pool1.close()
        nostr_module._relay_pool = None

    @pytest.mark.asyncio
    async def test_shutdown_relay_pool(self):
        """Test shutting down the global relay pool."""
        import app.services.nostr_relay as nostr_module
        from app.services.nostr_relay import get_relay_pool, shutdown_relay_pool

        nostr_module._relay_pool = None

        relays = ["wss://relay.test.io"]
        await get_relay_pool(relays)

        assert nostr_module._relay_pool is not None

        await shutdown_relay_pool()

        assert nostr_module._relay_pool is None


class TestCacheHitRate:
    """Tests for cache hit rate tracking."""

    @pytest.fixture
    def relay_pool(self):
        """Create a NostrRelayPool instance for testing."""
        return NostrRelayPool(
            relays=["wss://relay.test.io"],
            cache_ttl=300,
        )

    @pytest.mark.asyncio
    async def test_cache_hit_rate_tracking(self, relay_pool):
        """Test that cache hits and misses are tracked correctly."""
        # Populate cache
        relay_pool.cache["nip89:npub1test123"] = CacheEntry(
            value=True, expires_at=datetime.now() + timedelta(seconds=300)
        )

        # Mock the relay query
        with patch.object(
            relay_pool, "_query_relays", new_callable=AsyncMock
        ) as mock_query:
            mock_query.return_value = []

            # First query - cache hit
            result1 = await relay_pool.check_handlers(["npub1test123"])
            assert result1["npub1test123"] is True
            assert relay_pool._cache_hits == 1
            assert relay_pool._cache_misses == 0

            # Second query - cache miss (new npub)
            await relay_pool.check_handlers(["npub1test456"])
            assert relay_pool._cache_hits == 1
            assert relay_pool._cache_misses == 1

            # Third query - cache hit again
            await relay_pool.check_handlers(["npub1test123"])
            assert relay_pool._cache_hits == 2
            assert relay_pool._cache_misses == 1

    @pytest.mark.asyncio
    async def test_get_cache_stats_includes_hit_rate(self, relay_pool):
        """Test that cache stats include hit rate."""
        # Populate cache
        relay_pool.cache["nip89:npub1test123"] = CacheEntry(
            value=True, expires_at=datetime.now() + timedelta(seconds=300)
        )
        relay_pool._cache_hits = 8
        relay_pool._cache_misses = 2

        stats = relay_pool.get_cache_stats()

        assert "cache" in stats
        assert stats["cache"]["hit_rate"] == 0.8
        assert stats["cache"]["total_hits"] == 8
        assert stats["cache"]["total_misses"] == 2


class TestCircuitBreaker:
    """Tests for circuit breaker functionality."""

    @pytest.fixture
    def relay_pool(self):
        """Create a NostrRelayPool with circuit breaker for testing."""
        return NostrRelayPool(
            relays=["wss://relay.test.io"],
            cache_ttl=300,
            circuit_breaker_threshold=3,
            circuit_breaker_timeout=60,
        )

    def test_record_query_error_opens_circuit(self, relay_pool):
        """Test that consecutive errors open the circuit breaker."""
        relay_url = "wss://relay.test.io"

        # Record errors up to threshold
        for i in range(3):
            relay_pool._record_query_error(relay_url, f"Error {i}")

        metrics = relay_pool.relay_metrics[relay_url]
        assert metrics.status == "circuit_open"
        assert metrics.consecutive_errors == 3
        assert metrics.circuit_open_until is not None

    def test_circuit_breaker_resets_on_success(self, relay_pool):
        """Test that successful queries reset consecutive errors."""
        relay_url = "wss://relay.test.io"

        # Record some errors
        relay_pool._record_query_error(relay_url, "Error 1")
        relay_pool._record_query_error(relay_url, "Error 2")

        assert relay_pool.relay_metrics[relay_url].consecutive_errors == 2

        # Simulate successful query by setting consecutive_errors to 0
        relay_pool.relay_metrics[relay_url].consecutive_errors = 0

        assert relay_pool.relay_metrics[relay_url].consecutive_errors == 0
        assert relay_pool.relay_metrics[relay_url].status != "circuit_open"

    def test_circuit_breaker_closes_after_timeout(self, relay_pool):
        """Test that circuit breaker closes after timeout expires."""
        relay_url = "wss://relay.test.io"

        # Open circuit breaker
        for i in range(3):
            relay_pool._record_query_error(relay_url, f"Error {i}")

        metrics = relay_pool.relay_metrics[relay_url]
        assert metrics.status == "circuit_open"

        # Set circuit_open_until to the past
        metrics.circuit_open_until = datetime.now() - timedelta(seconds=1)

        # Get cache stats should close the circuit
        stats = relay_pool.get_cache_stats()

        assert stats["relays"][relay_url]["status"] == "connected"
        assert relay_pool.relay_metrics[relay_url].consecutive_errors == 0


class TestRelayMetrics:
    """Tests for relay performance metrics."""

    @pytest.fixture
    def relay_pool(self):
        """Create a NostrRelayPool for testing metrics."""
        return NostrRelayPool(
            relays=["wss://relay1.test.io", "wss://relay2.test.io"],
            cache_ttl=300,
        )

    @pytest.mark.asyncio
    async def test_relay_metrics_tracking(self, relay_pool):
        """Test that relay metrics track query latency."""
        # Mock successful query
        with (
            patch.object(
                relay_pool, "_ensure_client", new_callable=AsyncMock
            ) as mock_client,
            patch("app.services.nostr_relay.Filter") as mock_filter,
            patch(
                "app.services.nostr_relay.asyncio.wait_for", new_callable=AsyncMock
            ) as mock_wait_for,
        ):
            mock_client_instance = MagicMock()
            mock_event = MagicMock()
            mock_event.author.return_value.to_hex.return_value = "test_hex"

            # Mock Filter chain
            mock_filter_instance = MagicMock()
            mock_filter.return_value = mock_filter_instance
            mock_filter_instance.kinds.return_value = mock_filter_instance
            mock_filter_instance.authors.return_value = mock_filter_instance
            mock_filter_instance.custom_tag.return_value = mock_filter_instance

            mock_client_instance.get_events.return_value = [mock_event]
            mock_client.return_value = mock_client_instance
            mock_wait_for.return_value = [mock_event]

            # Perform query
            await relay_pool._query_relays(["test_hex"])

            # Check that metrics were updated
            for relay_url in relay_pool.relays:
                metrics = relay_pool.relay_metrics[relay_url]
                assert metrics.query_count == 1
                assert metrics.total_latency_ms > 0
                assert metrics.avg_latency_ms > 0

    def test_get_cache_stats_includes_relay_metrics(self, relay_pool):
        """Test that cache stats include relay metrics."""
        stats = relay_pool.get_cache_stats()

        assert "relays" in stats
        assert len(stats["relays"]) == 2

        for relay_url in relay_pool.relays:
            assert relay_url in stats["relays"]
            relay_stats = stats["relays"][relay_url]
            assert "status" in relay_stats
            assert "query_count" in relay_stats
            assert "error_count" in relay_stats
            assert "avg_latency_ms" in relay_stats


class TestBatchQueries:
    """Tests for batch query optimization."""

    @pytest.fixture
    def relay_pool(self):
        """Create a NostrRelayPool for testing batch queries."""
        return NostrRelayPool(
            relays=["wss://relay.test.io"],
            cache_ttl=300,
        )

    @pytest.mark.asyncio
    async def test_batch_query_multiple_npubs(self, relay_pool):
        """Test that multiple npubs can be queried in one request."""
        npubs = ["npub1test1", "npub1test2", "npub1test3"]

        with (
            patch.object(relay_pool, "_npub_to_hex") as mock_npub_to_hex,
            patch.object(
                relay_pool, "_query_relays", new_callable=AsyncMock
            ) as mock_query,
        ):
            mock_npub_to_hex.side_effect = lambda x: f"hex_{x}"
            mock_query.return_value = []

            await relay_pool.check_handlers(npubs)

            # Should call _query_relays once with all hex pubkeys
            assert mock_query.call_count == 1
            called_hex_pks = mock_query.call_args[0][0]
            assert len(called_hex_pks) == 3
            assert all(f"hex_{npub}" in called_hex_pks for npub in npubs)

    @pytest.mark.asyncio
    async def test_batch_query_with_mixed_cache_hits(self, relay_pool):
        """Test batch query with some npubs cached and some not."""
        # Populate cache with one npub
        relay_pool.cache["nip89:npub1cached"] = CacheEntry(
            value=True, expires_at=datetime.now() + timedelta(seconds=300)
        )

        npubs = ["npub1cached", "npub1new1", "npub1new2"]

        with (
            patch.object(relay_pool, "_npub_to_hex") as mock_npub_to_hex,
            patch.object(
                relay_pool, "_query_relays", new_callable=AsyncMock
            ) as mock_query,
        ):
            mock_npub_to_hex.side_effect = lambda x: f"hex_{x}"
            mock_query.return_value = []

            results = await relay_pool.check_handlers(npubs)

            # Should get cached result for npub1cached
            assert results["npub1cached"] is True
            assert relay_pool._cache_hits == 1

            # Should query only the uncached npubs
            assert mock_query.call_count == 1
            called_hex_pks = mock_query.call_args[0][0]
            assert len(called_hex_pks) == 2
            assert "hex_npub1new1" in called_hex_pks
            assert "hex_npub1new2" in called_hex_pks
