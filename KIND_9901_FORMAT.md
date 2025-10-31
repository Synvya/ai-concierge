# Kind 9901 Reservation Request Format

## Summary

Reservation requests now use **kind 9901** (changed from 9901).  
Reservation responses now use **kind 9902** (changed from 9902).

This document describes the complete format for restaurants to receive and process reservation requests.

---

## Complete Message Structure

### 1. Outer Layer: Gift Wrap (kind 1059)
```json
{
  "kind": 1059,
  "pubkey": "<ephemeral_random_pubkey>",
  "created_at": <unix_timestamp>,
  "tags": [
    ["p", "<restaurant_pubkey_hex>"]
  ],
  "content": "<encrypted_seal>",
  "id": "<event_id>",
  "sig": "<signature>"
}
```

### 2. Middle Layer: Seal (kind 13)
After decrypting the gift wrap using NIP-59:
```json
{
  "kind": 13,
  "pubkey": "<sender_pubkey_hex>",
  "created_at": <unix_timestamp>,
  "tags": [],
  "content": "<encrypted_rumor>",
  "id": "<event_id>",
  "sig": "<signature>"
}
```

### 3. Inner Layer: Rumor (kind 9901) 
After decrypting the seal:
```json
{
  "kind": 9901,
  "pubkey": "<sender_pubkey_hex>",
  "created_at": <unix_timestamp>,
  "tags": [],
  "content": "<encrypted_payload>"
}
```

### 4. Decrypted Payload
After decrypting the rumor's content using NIP-44:
```json
{
  "party_size": 2,
  "iso_time": "2025-10-30T19:00:00-07:00",
  "notes": "Window seat if possible",
  "contact": {
    "name": "Alejandro Martinez",
    "phone": "+1-555-0100"
  },
  "constraints": {
    "earliest_iso_time": "2025-10-30T18:30:00-07:00",
    "latest_iso_time": "2025-10-30T20:00:00-07:00",
    "outdoor_ok": true,
    "accessibility_required": false
  }
}
```

---

## Field Descriptions

### Required Fields
- **`party_size`** (integer, 1-20): Number of guests
- **`iso_time`** (string): Requested time in ISO 8601 format with timezone

### New Optional Fields (Issue #61)
- **`contact`** (object): Guest contact information
  - **`name`** (string, max 200 chars): Guest's full name
  - **`phone`** (string, max 64 chars): Guest's phone number
  - `email` (string, email format): Guest's email (optional)

### Other Optional Fields
- **`notes`** (string, max 2000 chars): Special requests or preferences
- **`constraints`** (object): Negotiation preferences
  - `earliest_iso_time`: Earliest acceptable time
  - `latest_iso_time`: Latest acceptable time
  - `outdoor_ok`: Whether outdoor seating is acceptable
  - `accessibility_required`: Whether accessibility features are required

---

## NIP-89 Discovery

Restaurants must publish kind 31989 events with `d:9901` tags to advertise reservation support:

```json
{
  "kind": 31989,
  "pubkey": "<restaurant_pubkey>",
  "tags": [
    ["d", "9901"],
    ["a", "31990:<restaurant_pubkey>:<d_value>"]
  ],
  "content": "Reservation request handler",
  "created_at": <timestamp>
}
```

The AI Concierge queries relays with:
- kind: 31989
- author: restaurant pubkey
- d tag: "9901"

---

## Implementation for Restaurants

### 1. Receive and Decrypt
```typescript
import { nip44, nip59 } from 'nostr-tools';

function handleReservationRequest(giftWrapEvent, restaurantPrivateKey) {
  // Step 1: Unwrap gift wrap to get rumor
  const rumor = nip59.unwrap(giftWrapEvent, restaurantPrivateKey);
  
  // Step 2: Verify kind number
  if (rumor.kind !== 9901) {
    console.error('Unexpected kind:', rumor.kind);
    return null;
  }
  
  // Step 3: Decrypt rumor content
  const payload = nip44.decrypt(
    rumor.content,
    rumor.pubkey,
    restaurantPrivateKey
  );
  
  const request = JSON.parse(payload);
  
  return {
    threadId: giftWrapEvent.id,  // For threading responses
    senderPubkey: rumor.pubkey,
    request: {
      partySize: request.party_size,
      time: request.iso_time,
      guestName: request.contact?.name,
      guestPhone: request.contact?.phone,
      notes: request.notes,
      constraints: request.constraints
    }
  };
}
```

### 2. Send Response (kind 9902)
```typescript
function sendReservationResponse(
  originalThreadId: string,
  senderPubkey: string,
  response: {
    status: 'confirmed' | 'declined' | 'suggested',
    iso_time?: string,
    message?: string,
    table?: string
  },
  restaurantPrivateKey: string
) {
  // Create response payload
  const payload = {
    status: response.status,
    iso_time: response.iso_time || null,
    message: response.message,
    table: response.table || null
  };
  
  // Build rumor (kind 9902)
  const rumor = {
    kind: 9902,
    content: nip44.encrypt(
      JSON.stringify(payload),
      senderPubkey,
      restaurantPrivateKey
    ),
    tags: [
      ["p", senderPubkey],
      ["e", originalThreadId, "", "root"]  // Thread marker
    ],
    created_at: Math.floor(Date.now() / 1000)
  };
  
  // Wrap and publish
  const giftWrap = nip59.wrap(rumor, restaurantPrivateKey, senderPubkey);
  
  // Publish to relays
  await publishToRelays(giftWrap, relays);
}
```

---

## Key Changes from Previous Version

1. **Kind numbers changed**:
   - Reservation requests: 9901 → **9901**
   - Reservation responses: 9902 → **9902**
   - NIP-89 discovery: d:9901 → **d:9901**

2. **New contact fields** (Issue #61):
   - `contact.name`: Guest's full name
   - `contact.phone`: Guest's phone number

3. **User experience**:
   - First-time reservation prompts for name and phone
   - Information stored securely in localStorage
   - Auto-included in all future reservations

---

## Security Considerations

1. **End-to-End Encryption**: All reservation data is encrypted with NIP-44
2. **Privacy**: Handle contact information according to GDPR/CCPA regulations
3. **Validation**: Always validate payloads against the JSON schema
4. **Rate Limiting**: Implement rate limiting to prevent spam
5. **Authentication**: Verify sender pubkeys

---

## Testing

Query for your restaurant's NIP-89 events:
```bash
nak req -k 31989 -a <your_restaurant_hex_pubkey> --tag d=9901 wss://relay.damus.io
```

---

## Full Documentation

For complete documentation, see:
- `docs/RESERVATION_REQUEST_FORMAT.md` - Detailed request format
- `docs/RESTAURANT_RESPONSE_FORMAT.md` - Response format
- `docs/nip89-integration.md` - NIP-89 discovery setup
- `docs/schemas/reservation.request.schema.json` - JSON schema

---

## Support

Questions or issues? Check:
- [Implementation Status](docs/restaurants/implementation-status.md)
- [NIP-59 Specification](https://github.com/nostr-protocol/nips/blob/master/59.md)
- [NIP-44 Specification](https://github.com/nostr-protocol/nips/blob/master/44.md)

