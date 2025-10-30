# Reservation Request Format (kind:32101)

This document describes the format of reservation request messages sent via Nostr using kind:32101 (wrapped in NIP-59 gift wrap).

## Overview

Reservation requests are sent from the AI Concierge to restaurants using the Nostr protocol. The message is encrypted using NIP-44 and wrapped in a NIP-59 gift wrap (kind:1059).

## Message Structure

### Outer Layer (Gift Wrap - kind:1059)

```json
{
  "kind": 1059,
  "pubkey": "<random ephemeral pubkey>",
  "created_at": <unix timestamp>,
  "tags": [
    ["p", "<restaurant_pubkey_hex>"]
  ],
  "content": "<encrypted seal>",
  "id": "<event_id>",
  "sig": "<signature>"
}
```

### Middle Layer (Seal - kind:13)

After decrypting the gift wrap content, you get a seal:

```json
{
  "kind": 13,
  "pubkey": "<sender_pubkey_hex>",
  "created_at": <unix timestamp>,
  "tags": [],
  "content": "<encrypted rumor>",
  "id": "<event_id>",
  "sig": "<signature>"
}
```

### Inner Layer (Rumor - kind:32101)

After decrypting the seal content, you get the actual reservation request (an unsigned event called a "rumor"):

```json
{
  "kind": 32101,
  "pubkey": "<sender_pubkey_hex>",
  "created_at": <unix timestamp>,
  "tags": [],
  "content": "<encrypted_payload>"
}
```

### Decrypted Payload

The `content` field of the rumor is encrypted using NIP-44 and contains:

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

## Field Descriptions

### Required Fields

- **`party_size`** (integer, 1-20): Number of guests for the reservation
- **`iso_time`** (string): Requested reservation time in ISO 8601 format with timezone

### Optional Fields

- **`notes`** (string, max 2000 chars): Special requests, dietary restrictions, or seating preferences
  
- **`contact`** (object): Guest contact information
  - **`name`** (string, max 200 chars): Guest's full name
  - **`phone`** (string, max 64 chars): Guest's phone number
  - **`email`** (string, email format): Guest's email address (optional)

- **`constraints`** (object): Preferences that affect negotiation
  - **`earliest_iso_time`** (string): Earliest acceptable time
  - **`latest_iso_time`** (string): Latest acceptable time
  - **`outdoor_ok`** (boolean): Whether outdoor seating is acceptable
  - **`accessibility_required`** (boolean): Whether accessibility features are required

## Implementation Notes

### For Restaurants

1. **Decryption Process**:
   - Receive gift wrap (kind:1059) addressed to your restaurant's pubkey
   - Decrypt the gift wrap to get the seal (kind:13)
   - Decrypt the seal to get the rumor (kind:32101)
   - Decrypt the rumor's content to get the reservation payload

2. **Contact Information**:
   - The `contact.name` and `contact.phone` fields are provided by the guest
   - Use this information to contact the guest if needed
   - Store this information securely according to your privacy policy

3. **Time Format**:
   - All times are in ISO 8601 format with timezone
   - Example: `"2025-10-30T19:00:00-07:00"` means 7:00 PM Pacific Time
   - Parse using your preferred datetime library

4. **Response Format**:
   - Respond using kind:32102 (see [RESTAURANT_RESPONSE_FORMAT.md](./RESTAURANT_RESPONSE_FORMAT.md))
   - Include the original gift wrap `id` in your response's `e` tag for threading

### Example Implementation (JavaScript/TypeScript)

```typescript
import { nip44, nip59 } from 'nostr-tools';

// Step 1: Receive and unwrap the gift wrap
function handleGiftWrap(giftWrapEvent, restaurantPrivateKey) {
  // Unwrap using NIP-59
  const rumor = nip59.unwrap(giftWrapEvent, restaurantPrivateKey);
  
  if (rumor.kind !== 32101) {
    console.error('Unexpected rumor kind:', rumor.kind);
    return null;
  }
  
  // Step 2: Decrypt the rumor content
  const senderPubkey = rumor.pubkey;
  const payload = nip44.decrypt(
    rumor.content,
    senderPubkey,
    restaurantPrivateKey
  );
  
  const request = JSON.parse(payload);
  
  return {
    threadId: giftWrapEvent.id, // Use for threading responses
    senderPubkey,
    request,
  };
}

// Step 3: Process the reservation request
function processReservation(data) {
  const { threadId, senderPubkey, request } = data;
  
  console.log(`New reservation request for ${request.party_size} guests`);
  console.log(`Requested time: ${request.iso_time}`);
  console.log(`Guest name: ${request.contact?.name}`);
  console.log(`Guest phone: ${request.contact?.phone}`);
  
  // Check availability and respond...
}
```

## Schema Validation

The JSON schema for the decrypted payload is available at:
- [docs/schemas/reservation.request.schema.json](../schemas/reservation.request.schema.json)

You can use this schema to validate incoming reservation requests.

## Changes from Previous Version

**New in this version:**
- Added `contact.name` field (optional)
- Added `contact.phone` field (optional)

**Backward compatibility:**
- The `contact` object and its fields are optional
- Existing implementations without these fields will continue to work
- Restaurants should handle requests both with and without contact information

## Security Considerations

1. **End-to-End Encryption**: The entire reservation request is encrypted using NIP-44, ensuring only the restaurant can read it
2. **Contact Information**: Handle guest contact information according to privacy regulations (GDPR, CCPA, etc.)
3. **Authentication**: Verify the sender's pubkey matches expected AI Concierge services
4. **Rate Limiting**: Implement rate limiting to prevent spam
5. **Validation**: Always validate the payload against the schema before processing

## Support

For questions or issues with reservation message handling, please refer to:
- [NIP-59 Specification](https://github.com/nostr-protocol/nips/blob/master/59.md)
- [NIP-44 Specification](https://github.com/nostr-protocol/nips/blob/master/44.md)
- [Implementation Status](./restaurants/implementation-status.md)

