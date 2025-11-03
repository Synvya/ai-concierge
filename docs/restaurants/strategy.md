# Synvya Reservation Messaging Strategy

## Overview

Synvya enables AI agents and local businesses to communicate and transact directly over **Nostr** using open, standardized event flows.  
The first use case is **restaurant reservations**, implemented as a structured, encrypted conversation between the **Synvya AI Concierge** and the **Synvya Business Client**.

This design avoids fragmented API integrations and builds a **universal agent-to-business communication rail** — secure, composable, and AI-native.

---

## Core Principles

1. **Conversation, Not Availability**
   - Restaurants rarely publish live availability.
   - The “availability” emerges through messaging negotiation.
   - Focus on a natural, conversational protocol that AI agents can handle autonomously.

2. **Mandatory Privacy**
   - All reservation messages **must use NIP-59 Gift Wrap** for metadata privacy.
   - This ensures that only sender and recipient can decrypt message contents.

3. **Event Kind Definitions**
   - App-specific kinds (in the **30000–30999** range) are assigned as:
     - `kind:9901` — `reservation.request`
     - `kind:9902` — `reservation.response`
     - `kind:9903` — `reservation.modification.request`
     - `kind:9904` — `reservation.modification.response`
   - All messages are encrypted and exchanged via NIP-59 gift wrap.

4. **NIP References**
   - **NIP-01:** Core protocol + Addressable Events
   - **NIP-09:** Event Deletion
   - **NIP-10:** Threaded conversations (`root` and `reply` markers)
   - **NIP-13:** Proof of Work (light anti-spam)
   - **NIP-40:** Expiration timestamps
   - **NIP-44:** Versioned encryption (for rumor payloads)
   - **NIP-52:** Calendar events
   - **NIP-59:** Gift Wrap (mandatory for all inter-party messages)
   - **NIP-89:** Application Handlers (for capability discovery)

---

## Handler Discovery (NIP-89)

Before AI agents can send reservation requests, they must **discover which restaurants support reservations**. This is accomplished using **NIP-89 Application Handlers**, which provide a standardized way for applications to announce their capabilities.

### Five-Event Pattern

When a restaurant with `businessType === "restaurant"` publishes their profile, five additional events are automatically published:

1. **Handler Information (kind 31990)**
   - Declares support for `kind:9901` (reservation.request), `kind:9902` (reservation.response), `kind:9903` (reservation.modification.request), and `kind:9904` (reservation.modification.response)
   - Tagged with `["d", "synvya-restaurants-v1.0"]` for identification
   - Content is empty (refer to kind 0 profile for restaurant metadata)

2. **Handler Recommendation for 9901 (kind 31989)**
   - Recommends the restaurant's 31990 handler for processing reservation requests
   - Tagged with `["d", "9901"]`
   - Includes `["a", "31990:<restaurant_pubkey>:synvya-restaurants-v1.0", "<relay_url>", "all"]`

3. **Handler Recommendation for 9902 (kind 31989)**
   - Recommends the restaurant's 31990 handler for processing reservation responses
   - Tagged with `["d", "9902"]`
   - Includes same `a` tag format as above

4. **Handler Recommendation for 9903 (kind 31989)** - Optional but recommended
   - Recommends the restaurant's 31990 handler for processing modification requests
   - Tagged with `["d", "9903"]`
   - Includes same `a` tag format as above

5. **Handler Recommendation for 9904 (kind 31989)** - Optional but recommended
   - Recommends the restaurant's 31990 handler for processing modification responses
   - Tagged with `["d", "9904"]`
   - Includes same `a` tag format as above

### Publishing Lifecycle

- **Created:** Handler events are published automatically when a restaurant publishes their profile
- **Deleted:** Handler events are removed via NIP-09 deletion events (kind 5) when the business changes from "restaurant" to another type
- **Updated:** Republishing the profile republishes the handler events (replaceable events)

### AI Agent Discovery Flow

```typescript
// Step 1: Find all restaurants by querying kind 0 profiles
const restaurants = await pool.querySync(relays, {
  kinds: [0],
  "#l": ["restaurant"],
  "#L": ["business.type"]
});

// Step 2: Check which restaurants handle reservations
const restaurantPubkeys = restaurants.map(e => e.pubkey);

// Check for reservation support (9901/9902)
const reservationRecommendations = await pool.querySync(relays, {
  kinds: [31989],
  authors: restaurantPubkeys,
  "#d": ["9901"]  // Looking for reservation.request handlers
});

// Check for modification support (9903/9904) - Optional but recommended
const modificationRecommendations = await pool.querySync(relays, {
  kinds: [31989],
  authors: restaurantPubkeys,
  "#d": ["9903", "9904"]  // Looking for modification handler recommendations
});

// Build maps of restaurant capabilities
const reservationCapable = new Set(reservationRecommendations.map(e => e.pubkey));
const modificationCapable = new Set(modificationRecommendations.map(e => e.pubkey));

// Filter and annotate restaurants
const availableRestaurants = restaurantData.map(r => ({
  ...r,
  supports_reservations: reservationCapable.has(r.pubkey),
  supports_modifications: modificationCapable.has(r.pubkey)
})).filter(r => r.supports_reservations);
```

### Step 3: (Optional) Fetch Detailed Handler Information

If you need detailed handler information, parse the `a` tag from the recommendation to find the handler info event:

```typescript
// Check both reservation and modification recommendations
for (const rec of [...reservationRecommendations, ...modificationRecommendations]) {
  const aTag = rec.tags.find(t => t[0] === "a" && t[1].startsWith("31990:"));
  if (aTag) {
    const [kind, pubkey, dTag] = aTag[1].split(":");
    const handlerInfo = await pool.get(relays, {
      kinds: [31990],
      authors: [pubkey],
      "#d": [dTag]
    });
    
    if (handlerInfo) {
      // Extract supported event kinds from 'k' tags
      const supportedKinds = handlerInfo.tags
        .filter(t => t[0] === "k")
        .map(t => t[1]);
      
      console.log(`Restaurant ${pubkey} supports: ${supportedKinds.join(", ")}`);
      // Expected: ["9901", "9902"] for basic reservations
      // Expected: ["9901", "9902", "9903", "9904"] for full modification support
    }
  }
}
```

### Benefits

- **Decentralized Discovery:** No central registry or API required
- **Standards-Compliant:** Uses official NIP-89 for application handlers
- **Explicit Opt-In:** Restaurants choose to enable reservation support
- **Efficient Queries:** AI agents can filter capabilities before sending requests
- **Backward Compatible:** Modification messages (9903/9904) work even without NIP-89 handlers
- **Composable:** Same pattern can extend to orders, payments, and other capabilities

---

## Message Construction (NIP-59 Protocol)

### Reservation Request

1. **Create a rumor**
   - Unsigned event of `kind:9901` containing the reservation request payload.
   - Payload encrypted with **NIP-44**.

2. **Seal the rumor**
   - Create a `kind:13` **seal event** that wraps the rumor.

3. **Gift wrap**
   - Create a `kind:1059` **gift wrap event** that contains the seal and is addressed to the restaurant (`p` tag = restaurant pubkey).
   - **Create TWO gift wraps**: one for recipient, one for self (Self CC)
   - Publish both to relays
   - **Thread ID**: Store the recipient's gift wrap ID as the thread ID for future messages

### Reservation Response

1. **Create a rumor**
   - Unsigned event of `kind:9902` containing the reservation response payload.

2. **Seal the rumor**
   - Create a `kind:13` seal event containing the rumor.

3. **Gift wrap**
   - Create a `kind:1059` gift wrap event addressed to the **AI Concierge**.

### Reservation Response

1. **Create a rumor**
   - Unsigned event of `kind:9902` containing the reservation response payload.
   - Payload encrypted with **NIP-44**.
   - Include NIP-10 threading tags: `[["e", "<original_request_giftwrap_id>", "", "root"]]`

2. **Seal the rumor**
   - Create a `kind:13` seal event containing the rumor.

3. **Gift wrap**
   - Create a `kind:1059` gift wrap event addressed to the **AI Concierge**.
   - **Create TWO gift wraps**: one for recipient, one for self (Self CC)
   - Publish both to relays

### Modification Request

1. **Create a rumor**
   - Unsigned event of `kind:9903` containing the modification request payload.
   - Payload encrypted with **NIP-44**.
   - Include NIP-10 threading tags: `[["e", "<original_request_giftwrap_id>", "", "root"]]`

2. **Seal the rumor**
   - Create a `kind:13` seal event containing the rumor.

3. **Gift wrap**
   - Create a `kind:1059` gift wrap event addressed to the **AI Concierge**.
   - **Create TWO gift wraps**: one for recipient, one for self (Self CC)
   - Publish both to relays

### Modification Response

1. **Create a rumor**
   - Unsigned event of `kind:9904` containing the modification response payload.
   - Payload encrypted with **NIP-44**.
   - Include NIP-10 threading tags:
     - `[["e", "<original_request_giftwrap_id>", "", "root"]]`
     - `[["e", "<modification_request_giftwrap_id>", "", "reply"]]`

2. **Seal the rumor**
   - Create a `kind:13` seal event containing the rumor.

3. **Gift wrap**
   - Create a `kind:1059` gift wrap event addressed to the **Restaurant**.
   - **Create TWO gift wraps**: one for recipient, one for self (Self CC)
   - Publish both to relays

---

## Replaceable Events

Addressable (replaceable) events now use the **`a` tag** per NIP-01:

```
["a", "<kind integer>:<32-bytes lowercase hex of a pubkey>:", <optional relay URL>]
```

Do **not** use the deprecated `d` tag for addressable identification.

---

## End-to-End Flow Summary

### Complete 4-Message Flow

1. **AI Concierge → Restaurant**
   - Sends `reservation.request` (`kind:9901`) wrapped via NIP-59.
   - Thread ID: Gift wrap event ID of this request (becomes root for all subsequent messages)

2. **Restaurant → Concierge** (One of two paths)
   - **Path A**: Sends `reservation.response` (`kind:9902`) with `status: "confirmed"` or `status: "declined"` → Conversation ends
   - **Path B**: Sends `reservation.modification.request` (`kind:9903`) suggesting alternative time → Continue to step 3

3. **AI Concierge → Restaurant** (If modification requested)
   - Sends `reservation.modification.response` (`kind:9904`) with `status: "accepted"` or `status: "declined"`
   - Threads link to original request (root) and modification request (reply)

4. **Restaurant → Concierge** (After modification response)
   - Sends `reservation.response` (`kind:9902`) with `status: "confirmed"` or `status: "declined"` → Conversation ends

### Threading

All messages in a conversation thread must reference the original request's gift wrap event ID:
- **Thread ID**: Gift wrap event ID of the original reservation request (kind:9901)
- **NIP-10 Tags**: All subsequent messages include `["e", "<thread_id>", "", "root"]` tag
- **Modification Response**: Also includes `["e", "<modification_request_id>", "", "reply"]` tag

### Self CC Pattern

All outgoing messages use **Self CC** (Copy to Self):
- **Two gift wraps** created for each message: one for recipient, one for sender
- Enables remote storage, multi-device sync, and recovery from local storage loss
- Both gift wraps published to relays
- Recipient's gift wrap ID is used as thread ID for consistency

---

## Security and Scalability

| Concern | Solution |
|----------|-----------|
| Metadata privacy | Mandatory NIP-59 gift wrap |
| Content encryption | NIP-44 |
| Spam prevention | NIP-13 Proof of Work |
| Event referencing | NIP-10 threading + NIP-01 addressable |
| Future composability | Extend same model for `order.request` and `order.response` |

---

## Relay Strategy

### Development
- Use public test relays for development and testing
- Recommended relays:
  - `wss://relay.damus.io`
  - `wss://nos.lol`
  - `wss://relay.nostr.band`
- Configure relays in client settings
- Test harness publishes to configured relays

### Production
- Businesses should configure their preferred relays
- Multiple relay support for redundancy
- AI agents should:
  1. Check business profile for relay hints (future: NIP-65)
  2. Use common public relays as fallback
  3. Subscribe to multiple relays simultaneously
  4. Handle relay failures gracefully with timeout/retry logic

### Relay Selection Criteria
- **Uptime**: Choose relays with high availability
- **Performance**: Low latency and fast response times
- **Privacy**: Consider relay policies on data retention
- **Geographic proximity**: Reduce latency for regional businesses

### Future: NIP-65 Relay Lists
- Businesses publish preferred relay lists
- AI agents query NIP-65 relay metadata
- Dynamic relay discovery and failover
- Better message delivery guarantees

---

## Vision

This protocol creates a **message-based commerce fabric** — every booking, order, or payment begins as a secure message over Nostr.  
The restaurant reservation loop is the first end-to-end proof of AI-driven commerce.

---
