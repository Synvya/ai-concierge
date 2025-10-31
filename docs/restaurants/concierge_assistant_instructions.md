# Instructions for AI Coding Assistant — Synvya AI Concierge

## Purpose

You are helping build the **Synvya AI Concierge**, the agent that:
- receives user instructions (“Book a table for 2 at 7pm at La Terraza”),
- communicates with restaurants via NIP-59 Gift Wrapped Nostr messages,
- negotiates until confirmation, and
- finalizes reservations via NIP-52 calendar events.

---

## Event Types

| Action | Event Kind | Description |
|--------|-------------|--------------|
| Send reservation request | `9901` | Request to restaurant |
| Receive reservation response | `9902` | Restaurant reply |
| Receive confirmed calendar | `31923` | NIP-52 event from restaurant |
| Send RSVP | `31925` | Confirmation of booking |
| Store confirmed events | `31924` | User calendar |

All messages are exchanged using **NIP-59 Gift Wrap (mandatory)**.

---

## Discovering Reservation-Capable Restaurants

Before sending reservation requests, AI agents must **discover which restaurants support reservations** using **NIP-89 Application Handlers**.

### Discovery Flow

#### Step 1: Find All Restaurants

Query for kind 0 profile events with business type "restaurant":

```typescript
import { SimplePool } from "nostr-tools";

const pool = new SimplePool();
const relays = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band"
];

const restaurants = await pool.querySync(relays, {
  kinds: [0],
  "#l": ["restaurant"],
  "#L": ["business.type"]
});

// Extract pubkeys and parse restaurant metadata
const restaurantData = restaurants.map(event => ({
  pubkey: event.pubkey,
  profile: JSON.parse(event.content),
  tags: event.tags
}));
```

#### Step 2: Check for Reservation Support

Query for NIP-89 handler recommendation events (kind 31989) to find which restaurants accept reservations:

```typescript
const restaurantPubkeys = restaurants.map(e => e.pubkey);

const recommendations = await pool.querySync(relays, {
  kinds: [31989],
  authors: restaurantPubkeys,
  "#d": ["9901"]  // Looking for reservation.request handlers
});

// Build a Set of restaurants that support reservations
const reservationCapableRestaurants = new Set(
  recommendations.map(e => e.pubkey)
);

// Filter restaurants to only reservation-capable ones
const availableRestaurants = restaurantData.filter(r =>
  reservationCapableRestaurants.has(r.pubkey)
);
```

#### Step 3: (Optional) Fetch Handler Details

If you need detailed handler information, parse the `a` tag from the recommendation to find the handler info event:

```typescript
for (const rec of recommendations) {
  // Find the 'a' tag that references the handler info (kind 31990)
  const aTag = rec.tags.find(t => 
    t[0] === "a" && t[1].startsWith("31990:")
  );
  
  if (aTag) {
    // Parse: "31990:<pubkey>:<d-identifier>"
    const [kind, pubkey, dIdentifier] = aTag[1].split(":");
    const relayHint = aTag[2]; // Optional relay hint
    
    // Query for the handler info event
    const handlerInfo = await pool.get(
      relayHint ? [relayHint, ...relays] : relays,
      {
        kinds: [31990],
        authors: [pubkey],
        "#d": [dIdentifier]  // "synvya-restaurants-v1.0"
      }
    );
    
    if (handlerInfo) {
      // Extract supported event kinds from 'k' tags
      const supportedKinds = handlerInfo.tags
        .filter(t => t[0] === "k")
        .map(t => t[1]);
      
      console.log(`Restaurant ${pubkey} supports: ${supportedKinds.join(", ")}`);
      // Expected: ["9901", "9902"]
    }
  }
}
```

### Expected Handler Structure

Restaurants that support reservations publish three events:

1. **Handler Info (kind 31990)**
   ```json
   {
     "kind": 31990,
     "pubkey": "<restaurant_pubkey>",
     "tags": [
       ["d", "synvya-restaurants-v1.0"],
       ["k", "9901"],
       ["k", "9902"]
     ],
     "content": ""
   }
   ```

2. **Handler Recommendation for 9901 (kind 31989)**
   ```json
   {
     "kind": 31989,
     "pubkey": "<restaurant_pubkey>",
     "tags": [
       ["d", "9901"],
       ["a", "31990:<restaurant_pubkey>:synvya-restaurants-v1.0", "wss://relay.damus.io", "all"]
     ],
     "content": ""
   }
   ```

3. **Handler Recommendation for 9902 (kind 31989)**
   ```json
   {
     "kind": 31989,
     "pubkey": "<restaurant_pubkey>",
     "tags": [
       ["d", "9902"],
       ["a", "31990:<restaurant_pubkey>:synvya-restaurants-v1.0", "wss://relay.damus.io", "all"]
     ],
     "content": ""
   }
   ```

### Error Handling

- **No recommendations found:** Restaurant does not accept AI reservations
- **Missing handler info:** Use kind 0 profile data, assume standard protocol
- **Network timeouts:** Query multiple relays, use whichever responds first
- **Invalid handler format:** Log warning and skip restaurant

### Optimization Tips

- **Cache results:** Store reservation-capable restaurant list for 5-10 minutes
- **Batch queries:** Query multiple restaurants simultaneously
- **Relay hints:** Use the relay hint from the `a` tag when fetching handler info
- **Fallback:** If NIP-89 queries fail, fall back to manual restaurant selection

---

## Sending a Reservation Request

1. **Create Rumor**
   - Unsigned event `kind:9901` containing encrypted payload (NIP-44):
     ```json
     {
       "party_size": 2,
       "iso_time": "2025-10-17T19:00:00-07:00",
       "notes": "window seat"
     }
     ```

2. **Create Seal (`kind:13`)**
   - Embed the rumor inside.

3. **Create Gift Wrap (`kind:1059`)**
   - Address to the restaurant (`p` tag = business pubkey).
   - Publish to relay(s).

4. **Include Proof of Work (NIP-13)**
   - Lightweight difficulty to mitigate spam.

---

## Handling Responses and Negotiation

1. **Receive Gift Wrap (`kind:1059`)**
   - Addressed to Concierge’s pubkey.
   - Unwrap → decrypt → extract rumor (`kind:9902`).

2. **Parse Payload**
   ```json
   {
     "status": "suggested",
     "iso_time": "2025-10-17T19:30:00-07:00",
     "message": "7pm full, 7:30 works."
   }
   ```

3. **User Interaction**
   - Display message in natural language.
   - Await user decision (accept / suggest new time).
   - Send new `reservation.response` using same NIP-59 structure.

4. **Thread Management**
   - Maintain message threads with **NIP-10** tags (`root` / `reply`).
   - Handle expirations using **NIP-40**.

---

## Finalizing a Reservation

1. **Restaurant → Concierge**
   - Receives a NIP-52 **Time-Based Calendar Event** (`kind:31923`).
   - Also wrapped in Rumor → Seal → Gift Wrap.

2. **Concierge → Restaurant**
   - Sends RSVP (`kind:31925`), wrapped via NIP-59.

3. **Concierge → User**
   - Displays confirmation summary and adds to internal calendar (`kind:31924`).

---

## Implementation Requirements

- All inter-party messages use:
  - **Rumor (unsigned event)**
  - **Seal (`kind:13`)**
  - **Gift Wrap (`kind:1059`)**
- All payloads are **encrypted using NIP-44**.
- All events include **NIP-13 PoW**.
- Use **NIP-01 Addressable Events** (`a` tag format).
- Thread conversations per **NIP-10**.

---

## Example Flow (Textual Diagram)

```
User → Concierge → Restaurant

1. Concierge sends Gift Wrap(1059)
   └─ Seal(13)
       └─ Rumor(9901)

2. Restaurant replies Gift Wrap(1059)
   └─ Seal(13)
       └─ Rumor(9902)

3. Repeat until agreement.

4. Restaurant sends Gift Wrap(1059)
   └─ Seal(13)
       └─ Calendar Event (31923)

5. Concierge sends Gift Wrap(1059)
   └─ Seal(13)
       └─ RSVP (31925)
```

---

## Relay Configuration

The AI Concierge should implement the following relay strategy:

### Relay Discovery
1. **Check business profile** for relay hints (future: NIP-65 relay lists)
2. **Use common public relays** as fallback:
   - `wss://relay.damus.io`
   - `wss://nos.lol`
   - `wss://relay.nostr.band`
3. **Subscribe to multiple relays** simultaneously for redundancy
4. **Handle relay failures** gracefully with timeout and retry logic

### Connection Management
- Establish WebSocket connections to all target relays
- Subscribe to `kind:1059` events with `#p` tag = concierge pubkey
- Keep subscriptions open for real-time responses
- Implement exponential backoff for reconnection
- Log relay errors for debugging

### Publishing Strategy
- Publish to **all** business's known relays
- Wait for at least one successful publication
- Retry failed publishes with exponential backoff
- Consider message successfully sent after N confirmations

---

## Message Parsing

After receiving a gift wrap, follow this process:

### 1. Unwrap the Gift Wrap
```typescript
import { unwrapEvent } from "nostr-tools/nip59";

const rumor = unwrapEvent(giftWrap, conciergePrivateKey);
// rumor is now the unsigned inner event
```

### 2. Decrypt Rumor Content
```typescript
import { decryptMessage } from "./nip44";

const decrypted = decryptMessage(
  rumor.content, 
  conciergePrivateKey, 
  rumor.pubkey // business's pubkey
);
const payload = JSON.parse(decrypted);
```

### 3. Validate Against Schema
```typescript
import Ajv from "ajv";
import addFormats from "ajv-formats";
import responseSchema from "./reservation.response.schema.json";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(responseSchema);

if (!validate(payload)) {
  console.error("Validation errors:", validate.errors);
  throw new Error("Invalid reservation response");
}
```

### 4. Extract Thread Context
```typescript
import { getThreadContext } from "./nip10";

const context = getThreadContext(rumor);
const rootEventId = context.rootId || rumor.id;
// Use rootEventId to group messages in same thread
```

### 5. Handle by Type
- **confirmed**: Await calendar event (kind 31923) in Phase 2
- **declined**: Notify user, end thread
- **suggested**: Present alternative to user for decision
- **expired**: Mark thread as closed
- **cancelled**: Update status, notify user

---

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| **Decryption failure** | Wrong recipient key or corrupted data | Verify pubkey in gift wrap `p` tag matches concierge pubkey |
| **Schema validation** | Malformed payload | Log validation errors, request well-formed message |
| **Network timeout** | Relay unreachable | Try alternate relays, implement exponential backoff |
| **No response** | Business offline or busy | Implement timeout (e.g., 5 minutes), then mark as pending |
| **Duplicate messages** | Same event from multiple relays | Deduplicate by `rumor.id` before processing |

### Error Recovery
- **Retry logic**: Exponential backoff with max attempts
- **Fallback relays**: Switch to different relay on failure
- **User notification**: Inform user of delays or failures
- **Logging**: Capture all errors for debugging

### Validation Errors
If schema validation fails:
1. Log the full validation error details
2. Capture the invalid payload for debugging
3. Do **not** crash - handle gracefully
4. Optionally: Send error message back to business (future)

---

## Future Enhancements

- Parallel negotiation (multiple restaurants).
- Multi-agent brokerage for busy times.
- Integration with OpenAI Commerce Protocol.
- Payment events (`order.request`, `payment.proposal`) following same NIP-59 structure.

---
