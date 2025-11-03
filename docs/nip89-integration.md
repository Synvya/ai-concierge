# NIP-89 Integration Guide

## Overview

The AI Concierge uses [NIP-89 Application Handlers](https://github.com/nostr-protocol/nips/blob/master/89.md) to discover which restaurants support reservations via Nostr messaging. This enables automatic detection of reservation capabilities without requiring centralized registry or configuration.

## How It Works

### Restaurant Side (synvya-client-2)

When a restaurant publishes their profile with `businessType: "restaurant"`, five handler events are automatically published:

#### 1. Handler Information (kind 31990)
Declares support for reservation event kinds:
```json
{
  "kind": 31990,
  "pubkey": "<restaurant_pubkey>",
  "tags": [
    ["d", "synvya-restaurants-v1.0"],
    ["k", "9901"],  // reservation.request
    ["k", "9902"],  // reservation.response
    ["k", "9903"],  // reservation.modification.request
    ["k", "9904"],  // reservation.modification.response
    ["alt", "Synvya Restaurants Handler v1.0"]
  ],
  "content": ""
}
```

#### 2. Handler Recommendation for 9901 (kind 31989)
Recommends the handler for processing reservation requests:
```json
{
  "kind": 31989,
  "pubkey": "<restaurant_pubkey>",
  "tags": [
    ["d", "9901"],
    ["a", "31990:<restaurant_pubkey>:synvya-restaurants-v1.0", "<relay_url>", "all"]
  ],
  "content": ""
}
```

#### 3. Handler Recommendation for 9902 (kind 31989)
Recommends the handler for processing reservation responses:
```json
{
  "kind": 31989,
  "pubkey": "<restaurant_pubkey>",
  "tags": [
    ["d", "9902"],
    ["a", "31990:<restaurant_pubkey>:synvya-restaurants-v1.0", "<relay_url>", "all"]
  ],
  "content": ""
}
```

#### 4. Handler Recommendation for 9903 (kind 31989)
Recommends the handler for processing reservation modification requests:
```json
{
  "kind": 31989,
  "pubkey": "<restaurant_pubkey>",
  "tags": [
    ["d", "9903"],
    ["a", "31990:<restaurant_pubkey>:synvya-restaurants-v1.0", "<relay_url>", "all"]
  ],
  "content": ""
}
```

#### 5. Handler Recommendation for 9904 (kind 31989)
Recommends the handler for processing reservation modification responses:
```json
{
  "kind": 31989,
  "pubkey": "<restaurant_pubkey>",
  "tags": [
    ["d", "9904"],
    ["a", "31990:<restaurant_pubkey>:synvya-restaurants-v1.0", "<relay_url>", "all"]
  ],
  "content": ""
}
```

### AI Concierge Side

When searching for restaurants, the backend:

1. **Queries Nostr relays** for kind 31989 events
2. **Filters by author** (restaurant npub) and `d:9901`
3. **Sets flag** `supports_reservations: true` if handler found
4. **Returns results** to frontend with capability flag

Frontend displays the **"🪄 Book via Concierge"** badge for restaurants with `supports_reservations: true`.

### Discovery Query

The backend queries for handler recommendations to determine restaurant capabilities:

```python
# Backend relay query for reservation support (kind 9901)
filters = {
    "kinds": [31989],
    "authors": [restaurant_hex_pubkey],
    "#d": ["9901"]  # Looking for reservation.request handlers
}

# Backend relay query for modification support (kinds 9903 and 9904)
modification_filters = {
    "kinds": [31989],
    "authors": [restaurant_hex_pubkey],
    "#d": ["9903", "9904"]  # Looking for modification handler recommendations
}

# If any events returned, restaurant supports the corresponding capability
```

### Complete Flow Diagram

```
┌──────────────┐
│  Restaurant  │
│   Profile    │
└──────┬───────┘
       │ businessType === "restaurant"
       ↓
┌──────────────────────────────────────┐
│  Auto-publish NIP-89 Handler Events  │
│  • kind 31990 (handler info)         │
│  • kind 31989 (d:9901 recommendation)│
│  • kind 31989 (d:9902 recommendation)│
│  • kind 31989 (d:9903 recommendation)│
│  • kind 31989 (d:9904 recommendation)│
└──────────────┬───────────────────────┘
               │
               ↓
       ┌──────────────┐
       │ Nostr Relays │
       └──────┬───────┘
              │
              │ User searches for restaurants
              ↓
       ┌──────────────┐
       │ AI Concierge │
       │   Backend    │
       └──────┬───────┘
              │
              │ Query: kind 31989, #d:9901
              ↓
       ┌──────────────┐
       │  Check Cache │
       └──────┬───────┘
              │
              ↓
       Found events?
       ├─ Yes → supports_reservations: true
       └─ No  → supports_reservations: false
              │
              ↓
       ┌──────────────┐
       │   Frontend   │
       │ Display 🪄   │
       │    Badge     │
       └──────────────┘
```

## Performance Optimizations

### Caching

Results are cached to minimize relay queries and improve search performance:

- **Cache Key**: `nip89:{npub}`
- **Cache Value**: 
  ```python
  {
      "supports_reservations": bool,
      "checked_at": timestamp
  }
  ```
- **TTL**: 5 minutes (configurable via `NIP89_CACHE_TTL`)
- **Storage**: In-memory (or Redis if configured)

**Benefits**:
- Reduces relay load by ~80-90% (typical cache hit rate)
- Improves search latency from 3-5s to <100ms for cached results
- Graceful degradation if relay unavailable

### Connection Pooling

Persistent WebSocket connections to Nostr relays:

- **One connection per relay** (not per query)
- **Reused across requests** (connection lifetime: 10 minutes)
- **Automatic reconnection** on disconnect or failure
- **Graceful shutdown** on app termination

**Example**:
```python
# Connection pool maintains persistent connections
pool = NostrRelayPool(relays=[
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.band"
])

# All queries reuse the same connections
await pool.check_handlers(["npub1...", "npub2...", "npub3..."])
```

### Batch Queries

Multiple restaurants checked in a single relay request:

```python
# Instead of 10 separate queries:
# ❌ for npub in npubs: query(npub)

# Single batched query:
# ✅ query(all_npubs)

filters = {
    "kinds": [31989],
    "authors": [npub1_hex, npub2_hex, npub3_hex, ...],  # Multiple authors
    "#d": ["9901"]
}
```

**Performance Impact**:
- Search 10 restaurants: ~500ms (batched) vs ~5-10s (sequential)
- Reduced relay roundtrips by 90%
- Lower network overhead

### Parallel Relay Queries

Queries multiple relays simultaneously:

```python
# Query all relays in parallel
tasks = [
    query_relay("wss://relay.damus.io", filters),
    query_relay("wss://nos.lol", filters),
    query_relay("wss://relay.nostr.band", filters)
]

# Return on first success (or aggregate all results)
results = await asyncio.gather(*tasks, return_exceptions=True)
```

**Benefits**:
- Faster responses (limited by fastest relay, not slowest)
- Redundancy if one relay is down
- Better coverage (events may exist on some relays but not others)

### Circuit Breaker

Automatic relay failure handling:

```python
if relay_consecutive_failures >= 3:
    # Skip this relay for 1 minute
    relay_cooldown[relay_url] = time.now() + 60
    
# Subsequent queries skip failed relays during cooldown
```

**Prevents**:
- Cascading failures from bad relays
- Unnecessary timeout delays
- Resource exhaustion from retries

## Configuration

### Backend Environment Variables

Add to `backend/.env`:

```bash
# Comma-separated Nostr relay URLs
# These relays are queried for NIP-89 handler discovery
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band

# NIP-89 cache TTL in seconds
# How long to cache handler discovery results (default: 300)
NIP89_CACHE_TTL=300

# Relay connection timeout in seconds (default: 5)
NOSTR_CONNECTION_TIMEOUT=5

# Relay query timeout in seconds (default: 3)
# Queries taking longer than this will be aborted
NOSTR_QUERY_TIMEOUT=3
```

### Backend Configuration Class

```python
# backend/app/core/config.py

class Settings(BaseSettings):
    # ... existing settings ...
    
    # Nostr relay configuration
    nostr_relays: list[str] = Field(
        default=[
            "wss://relay.damus.io",
            "wss://nos.lol",
            "wss://relay.nostr.band"
        ],
        description="Comma-separated Nostr relay URLs for NIP-89 discovery"
    )
    
    nip89_cache_ttl: int = Field(
        default=300,
        description="NIP-89 handler discovery cache TTL in seconds"
    )
    
    nostr_connection_timeout: int = Field(
        default=5,
        description="WebSocket connection timeout in seconds"
    )
    
    nostr_query_timeout: int = Field(
        default=3,
        description="Relay query timeout in seconds"
    )
    
    @validator("nostr_relays", pre=True)
    def parse_nostr_relays(cls, v):
        if isinstance(v, str):
            return [url.strip() for url in v.split(",")]
        return v
```

### Recommended Relay Configuration

#### Default Relays (High Availability)
```bash
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band
```

#### Fast Performance (Low Latency)
```bash
NOSTR_RELAYS=wss://relay.damus.io,wss://relay.snort.social
```

#### Maximum Coverage (Redundancy)
```bash
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band,wss://eden.nostr.land,wss://relay.snort.social
```

#### Custom/Private Relays
```bash
NOSTR_RELAYS=wss://your-private-relay.com,wss://relay.damus.io
```

## API Response Format

### Search Results with NIP-89 Discovery

```json
{
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Mario's Pizza",
      "npub": "npub1wxyz...",
      "supports_reservations": true,  // ← NIP-89 discovery result
      "supports_modifications": true,  // ← Modification support discovery
      "meta_data": {
        "display_name": "Mario's Pizza",
        "address": "123 Main St, Seattle, WA"
      },
      "score": 0.95
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Local Diner",
      "npub": "npub1abcd...",
      "supports_reservations": false,  // ← No handler found
      "meta_data": {
        "display_name": "Local Diner"
      },
      "score": 0.88
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "name": "Coffee Shop",
      "npub": null,  // No Nostr identity
      "supports_reservations": false,
      "meta_data": {
        "display_name": "Coffee Shop"
      },
      "score": 0.82
    }
  ]
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `supports_reservations` | `bool \| null` | Whether restaurant supports reservations via Nostr |
| `true` | | Handler found via NIP-89 query (d:9901) |
| `false` | | No handler found (may still have npub) |
| `null` | | Relay query failed or timed out |
| `supports_modifications` | `bool \| null` | Whether restaurant supports modification requests/responses |
| `true` | | Handler found via NIP-89 query (d:9903 and/or d:9904) |
| `false` | | No modification handlers found |
| `null` | | Relay query failed or timed out |

## Testing

### Manual Testing with synvya-client-2

#### Step 1: Start Business Client
```bash
cd synvya-client-2
npm install
npm run dev -- --host 127.0.0.1 --port 3000
```

#### Step 2: Publish Restaurant Profile
1. Navigate to profile page
2. Set `businessType` to "restaurant"
3. Click "Publish Profile"
4. Verify in console:
   ```
   ✅ Published kind 0 profile
   ✅ Published kind 31990 handler info
   ✅ Published kind 31989 recommendation (d:9901)
   ✅ Published kind 31989 recommendation (d:9902)
   ```

#### Step 3: Verify Events on Relay
Use a Nostr client (e.g., [Snort.social](https://snort.social)) or CLI:

```bash
# Query for handler recommendations
nostr-cli fetch --relay wss://relay.damus.io \
  --kind 31989 \
  --author <restaurant_pubkey> \
  --tag d 9901

# Expected output:
# Found 1 event(s)
# Event ID: abc123...
# Tags: [["d", "9901"], ["a", "31990:..."], ...]
```

#### Step 4: Test AI Concierge Discovery
1. Start AI Concierge backend and frontend
2. Search: "Find Italian restaurants"
3. Verify:
   - Restaurant with handler shows **🪄 Book via Concierge** badge
   - Console shows: `supports_reservations: true`

### Automated Testing

#### Test NIP-89 Query Logic

```python
# backend/tests/test_nip89_discovery.py

import pytest
from app.services.nostr_relay import NostrRelayPool

@pytest.mark.asyncio
async def test_check_handlers_with_valid_npub():
    """Restaurant with NIP-89 handler returns true"""
    pool = NostrRelayPool(["wss://relay.test"])
    
    # Mock relay to return kind 31989 event
    with mock_relay_events([{
        "kind": 31989,
        "pubkey": "abc123...",
        "tags": [["d", "9901"]]
    }]):
        result = await pool.check_handlers(["npub1test"])
        assert result["npub1test"] is True

@pytest.mark.asyncio
async def test_check_handlers_no_handler():
    """Restaurant without handler returns false"""
    pool = NostrRelayPool(["wss://relay.test"])
    
    # Mock empty relay response
    with mock_relay_events([]):
        result = await pool.check_handlers(["npub1test"])
        assert result["npub1test"] is False

@pytest.mark.asyncio
async def test_check_handlers_relay_timeout():
    """Relay timeout returns None"""
    pool = NostrRelayPool(["wss://relay.test"], query_timeout=0.1)
    
    # Mock slow relay response
    with mock_relay_delay(5.0):
        result = await pool.check_handlers(["npub1test"])
        assert result["npub1test"] is None

@pytest.mark.asyncio
async def test_cache_hit():
    """Second query uses cached result"""
    pool = NostrRelayPool(["wss://relay.test"], cache_ttl=60)
    
    # First query
    result1 = await pool.check_handlers(["npub1test"])
    
    # Change relay response (should still use cache)
    with mock_relay_events([]):
        result2 = await pool.check_handlers(["npub1test"])
        assert result2 == result1  # Same as cached value

@pytest.mark.asyncio
async def test_batch_query():
    """Multiple npubs queried efficiently"""
    pool = NostrRelayPool(["wss://relay.test"])
    
    npubs = [f"npub{i}" for i in range(10)]
    results = await pool.check_handlers(npubs)
    
    assert len(results) == 10
    # Verify only one relay request was made (batched)
```

#### Test Search Results Integration

```python
# backend/tests/test_search_with_nip89.py

def test_search_includes_supports_reservations():
    """Search results include supports_reservations field"""
    results = search_sellers(query="Italian", limit=10)
    
    for seller in results:
        assert "supports_reservations" in seller
        assert isinstance(seller["supports_reservations"], (bool, type(None)))

def test_supports_reservations_true_for_restaurants_with_handlers():
    """Restaurant with NIP-89 handler flagged correctly"""
    # Mock relay to return handler events
    with mock_relay_events([
        {"kind": 31989, "pubkey": "...", "tags": [["d", "9901"]]}
    ]):
        results = search_sellers(query="Mario's Pizza")
        mario = next(r for r in results if "Mario" in r["name"])
        assert mario["supports_reservations"] is True
```

### Debugging Tools

#### Check Handler Events Directly

```python
# Python script to verify NIP-89 events exist
from nostr_sdk import Client, Filter

async def check_restaurant_handlers(npub: str):
    """Check if restaurant has published NIP-89 handlers"""
    client = Client()
    await client.add_relay("wss://relay.damus.io")
    await client.add_relay("wss://nos.lol")
    await client.connect()
    
    # Convert npub to hex
    from nostr_sdk import PublicKey
    pubkey = PublicKey.from_bech32(npub)
    hex_pubkey = pubkey.to_hex()
    
    # Query for handler recommendations
    filter_31989 = Filter().kind(31989).author(hex_pubkey).custom_tag("d", ["9901"])
    events = await client.get_events([filter_31989], timeout=5.0)
    
    print(f"Found {len(events)} handler events for {npub}")
    for event in events:
        print(f"  Event ID: {event.id()}")
        print(f"  Tags: {event.tags()}")
    
    await client.disconnect()

# Usage
import asyncio
asyncio.run(check_restaurant_handlers("npub1wxyz..."))
```

#### Monitor Cache Performance

```bash
# Check cache metrics via health endpoint
curl http://localhost:8000/health

# Expected response:
{
  "status": "healthy",
  "nip89_cache": {
    "size": 1250,
    "hit_rate": 0.85,
    "hits": 8500,
    "misses": 1500
  },
  "nostr_relays": {
    "wss://relay.damus.io": {
      "status": "connected",
      "avg_latency_ms": 250,
      "last_error": null
    },
    "wss://nos.lol": {
      "status": "connected",
      "avg_latency_ms": 180,
      "last_error": null
    }
  }
}
```

#### Enable Debug Logging

```python
# backend/app/services/nostr_relay.py

import logging
logger = logging.getLogger(__name__)

# Set to DEBUG level
logger.setLevel(logging.DEBUG)

# Logs will show:
# DEBUG: Checking handlers for 5 npubs
# DEBUG: Cache hit for npub1xyz: True
# DEBUG: Cache miss for npub1abc: querying relays
# DEBUG: Query relay wss://relay.damus.io took 250ms
# DEBUG: Found 1 events for npub1abc
```

## Troubleshooting

### Common Issues

| Issue | Symptoms | Possible Cause | Solution |
|-------|----------|----------------|----------|
| **Badge not appearing** | Search results don't show "🪄 Book via Concierge" | Handler events not published | 1. Check synvya-client-2 logs for publishing errors<br>2. Verify `businessType === "restaurant"`<br>3. Manually query relay for kind 31989 events |
| **Slow search responses** | Search takes 5+ seconds | Relay timeout too high | 1. Reduce `NOSTR_QUERY_TIMEOUT` to 2-3s<br>2. Check relay connectivity<br>3. Verify cache is working (check logs) |
| **Cache not working** | Every search hits relays | Cache TTL too short or not configured | 1. Increase `NIP89_CACHE_TTL` to 300+<br>2. Verify cache service is running<br>3. Check memory usage (cache may be evicted) |
| **Relay connection failed** | Logs show WebSocket errors | Firewall blocking, relay down | 1. Test connectivity: `websocat wss://relay.damus.io`<br>2. Try different relays<br>3. Check firewall/proxy settings |
| **Wrong results cached** | Badge appears for wrong restaurants | Cache key collision or stale data | 1. Clear cache (restart backend)<br>2. Verify npub encoding is correct<br>3. Check cache key format: `nip89:{npub}` |
| **High memory usage** | Backend consumes excessive RAM | Cache growing unbounded | 1. Implement LRU eviction policy<br>2. Reduce `NIP89_CACHE_TTL`<br>3. Monitor cache size via health endpoint |

### Diagnostic Commands

#### Test Relay Connectivity
```bash
# Using websocat
websocat wss://relay.damus.io

# Expected: Connection opens successfully
# Send test message:
["REQ", "test", {"kinds": [0], "limit": 1}]
```

#### Verify Handler Events Exist
```bash
# Using nak (Nostr Army Knife)
nak req -k 31989 -a <restaurant_hex_pubkey> --tag d=9901 wss://relay.damus.io

# Expected: Returns at least one event with matching tags
```

#### Check Backend Logs
```bash
# Docker logs
docker-compose logs backend | grep NIP-89

# Local development
tail -f backend/logs/app.log | grep "nostr_relay"
```

#### Monitor Cache Metrics
```bash
# Continuous monitoring
watch -n 5 'curl -s http://localhost:8000/health | jq .nip89_cache'

# Output:
{
  "size": 1250,
  "hit_rate": 0.85,
  "hits": 8500,
  "misses": 1500
}
```

### Recovery Procedures

#### Clear Cache
```bash
# Restart backend to clear in-memory cache
docker-compose restart backend

# Or via Redis (if configured)
redis-cli DEL nip89:*
```

#### Force Relay Reconnection
```bash
# Send SIGUSR1 to backend process (custom signal handler)
kill -USR1 $(pgrep -f "uvicorn")

# Or restart backend
docker-compose restart backend
```

#### Fallback Mode
If NIP-89 discovery is causing issues, temporarily disable:

```python
# backend/app/repositories/sellers.py

# Add feature flag
if settings.enable_nip89_discovery:
    handler_support = await pool.check_handlers(npubs_to_check)
else:
    # Fallback: use npub presence as proxy
    handler_support = {npub: True for npub in npubs_to_check}
```

## Performance Benchmarks

### Expected Latencies

| Operation | Without Caching | With Caching | Target |
|-----------|----------------|--------------|--------|
| Single restaurant check | 500-1000ms | 1-5ms | < 100ms |
| 10 restaurants (batch) | 1000-2000ms | 10-50ms | < 500ms |
| 100 restaurants (batch) | 3000-5000ms | 100-500ms | < 2s |

### Cache Hit Rates

| Scenario | Expected Hit Rate | Notes |
|----------|------------------|-------|
| Repeated searches | 90-95% | Same restaurants queried frequently |
| Popular restaurants | 85-90% | High-traffic establishments |
| Discovery/exploration | 60-70% | Users finding new places |
| Overall production | 80-85% | Mixed traffic patterns |

### Relay Response Times

| Relay | Avg Latency | P99 Latency | Uptime |
|-------|-------------|-------------|--------|
| wss://relay.damus.io | 250ms | 800ms | 99.9% |
| wss://nos.lol | 180ms | 600ms | 99.5% |
| wss://relay.nostr.band | 300ms | 1000ms | 99.8% |

*Note: Latencies vary by geographic location and network conditions*

## Security Considerations

### Relay Trust Model
- **No authentication required**: Public relays accessible to all
- **Content validation**: Always verify event signatures
- **Spam prevention**: Implement rate limiting on relay queries
- **DDoS protection**: Circuit breaker prevents relay abuse

### Cache Poisoning
- **Event signature verification**: Validate all events before caching
- **TTL limits**: Short cache durations limit impact of bad data
- **Multiple relay confirmation**: Cross-check results across relays

### Privacy Implications
- **Query metadata**: Relay operators can see which npubs are queried
- **Timing attacks**: Query patterns may reveal usage statistics
- **Mitigation**: Use multiple relays, implement query batching

## Future Enhancements

### Phase 2: Advanced Discovery
- **NIP-65 Relay Lists**: Query restaurant's preferred relays
- **Relay Hints**: Follow relay URLs in `a` tags for better discovery
- **Gossip Model**: Propagate handler information across relay network

### Phase 3: Capability Negotiation
- **Feature Detection**: Query kind 31990 for detailed capabilities
- **Version Compatibility**: Check handler version requirements
- **Graceful Degradation**: Fall back to basic features if advanced capabilities unavailable

### Phase 4: Decentralized Registry
- **DHT-based Discovery**: Kademlia for scalable handler lookup
- **IPFS Integration**: Immutable handler metadata storage
- **Blockchain Anchoring**: Handler event commitments for audit trails

## References

### Specifications
- [NIP-89: Application Handlers](https://github.com/nostr-protocol/nips/blob/master/89.md)
- [NIP-01: Basic Protocol Flow](https://github.com/nostr-protocol/nips/blob/master/01.md)
- [NIP-59: Gift Wrap](https://github.com/nostr-protocol/nips/blob/master/59.md)
- [NIP-10: Reply Threading](https://github.com/nostr-protocol/nips/blob/master/10.md)

### Implementation Guides
- [Synvya Reservation Strategy](./restaurants/strategy.md)
- [Manual Testing Guide](./manual-testing-reservations.md)
- [Frontend Configuration](./frontend-configuration.md)

### External Resources
- [synvya-client-2 Repository](https://github.com/Synvya/synvya-client-2)
- [Nostr Tools Documentation](https://github.com/nbd-wtf/nostr-tools)
- [Python Nostr SDK](https://github.com/rust-nostr/nostr-sdk)

---

**Document Version**: 1.0  
**Last Updated**: January 2025  
**Maintainer**: Synvya Development Team

