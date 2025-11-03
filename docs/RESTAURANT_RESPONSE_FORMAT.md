# Restaurant Response Format (kind:9902)

This document describes the format of reservation response messages sent from restaurants to customers using kind:9902 (wrapped in NIP-59 gift wrap).

## Overview

Restaurant responses are sent from restaurants to the AI Concierge (customer) using the Nostr protocol. The message is encrypted using NIP-44 and wrapped in a NIP-59 gift wrap (kind:1059).

This is part of the 4-message reservation flow:
1. **Reservation.request** (kind:9901) - Customer → Restaurant
2. **Reservation.response** (kind:9902) - Restaurant → Customer (this document) - Ends conversation when confirmed or declined
3. **Reservation.modification.request** (kind:9903) - Restaurant → Customer (suggest alternative time)
4. **Reservation.modification.response** (kind:9904) - Customer → Restaurant (accept/decline modification)

## When to Use kind:9902

Restaurants should send a kind:9902 response in the following scenarios:

- **Confirmed**: Reservation is accepted and confirmed
- **Declined**: Reservation request is declined (unavailable, fully booked, etc.)
- **Expired**: Reservation window has expired
- **Cancelled**: Previously confirmed reservation is cancelled

**Important**: If the requested time is unavailable and you want to suggest an alternative time, use **kind:9903** (modification request) instead of kind:9902. See [RESERVATION_MODIFICATION_FORMAT.md](./RESERVATION_MODIFICATION_FORMAT.md).

**NIP-89 Discovery**: To advertise modification support (kinds 9903 and 9904), publish NIP-89 handler recommendations. See [NIP-89 Integration Guide](./nip89-integration.md) for details. However, you can still send modification requests without NIP-89 handlers (backward compatible).

## Message Structure

### Outer Layer (Gift Wrap - kind:1059)

```json
{
  "kind": 1059,
  "pubkey": "<random ephemeral pubkey>",
  "created_at": <unix timestamp>,
  "tags": [
    ["p", "<customer_pubkey_hex>"]
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
  "pubkey": "<restaurant_pubkey_hex>",
  "created_at": <unix timestamp>,
  "tags": [],
  "content": "<encrypted rumor>",
  "id": "<event_id>",
  "sig": "<signature>"
}
```

### Inner Layer (Rumor - kind:9902)

After decrypting the seal content, you get the actual reservation response (an unsigned event called a "rumor"):

```json
{
  "kind": 9902,
  "pubkey": "<restaurant_pubkey_hex>",
  "created_at": <unix timestamp>,
  "tags": [
    ["e", "<original_request_giftwrap_id>", "", "root"]
  ],
  "content": "<encrypted_payload>"
}
```

### Decrypted Payload

The `content` field of the rumor is encrypted using NIP-44 and contains:

#### Confirmed Response
```json
{
  "status": "confirmed",
  "iso_time": "2025-10-30T19:00:00-07:00",
  "table": "A4",
  "message": "See you at 7pm!"
}
```

#### Declined Response
```json
{
  "status": "declined",
  "iso_time": null,
  "message": "Fully booked tonight, sorry!"
}
```

#### Expired Response
```json
{
  "status": "expired",
  "iso_time": null,
  "message": "The reservation window has expired."
}
```

#### Cancelled Response
```json
{
  "status": "cancelled",
  "iso_time": "2025-10-30T19:00:00-07:00",
  "message": "We've had to cancel your reservation. Please contact us to reschedule."
}
```

## Field Descriptions

### Required Fields

- **`status`** (string, enum): Response status
  - `"confirmed"`: Reservation is confirmed
  - `"declined"`: Reservation request is declined
  - `"expired"`: Reservation window expired
  - `"cancelled"`: Previously confirmed reservation is cancelled

### Conditionally Required Fields

- **`iso_time`** (string, date-time): **Required when `status` is `"confirmed"`**
  - Confirmed reservation time in ISO 8601 format with timezone
  - Should be `null` for `declined` and `expired` statuses
  - For `cancelled` status, include the original reservation time

### Optional Fields

- **`message`** (string, max 2000 chars): Human-readable message to the customer
  - Can explain why request was declined
  - Can include confirmation details
  - Can provide instructions or next steps

- **`table`** (string, nullable): Table identifier or name (only for `confirmed` status)
  - Example: `"A4"`, `"Window Table 2"`, `"Patio Section 3"`
  - Optional but helpful for customer reference

## Threading (NIP-10)

Always include the original reservation request's gift wrap event ID in the `e` tag with `"root"` marker:

```json
{
  "kind": 9902,
  "tags": [
    ["e", "<original_giftwrap_event_id>", "", "root"]
  ],
  ...
}
```

This ensures the response is properly linked to the original request in conversation threads.

## Implementation Notes

### For Restaurants

1. **Response Timing**:
   - Send responses promptly after receiving requests
   - For unavailable times, consider using kind:9903 (modification request) instead of declining

2. **Status Selection**:
   - Use `confirmed` when the reservation is accepted
   - Use `declined` when you cannot accommodate the request
   - Use `expired` if the customer took too long to confirm
   - Use `cancelled` only for previously confirmed reservations

3. **Time Format**:
   - All times are in ISO 8601 format with timezone
   - Example: `"2025-10-30T19:00:00-07:00"` means 7:00 PM Pacific Time
   - When `status` is `confirmed`, `iso_time` is required

4. **Modification Requests**:
   - If the requested time is unavailable but you have alternatives, use **kind:9903** (modification request)
   - Do NOT use `status: "suggested"` in kind:9902 (this status is deprecated)

### Example Implementation (JavaScript/TypeScript)

```typescript
import { nip44, nip59 } from 'nostr-tools';

// Build a confirmed response
function buildConfirmedResponse(
  originalRequestId: string,
  confirmedTime: string,
  restaurantPrivateKey: string,
  customerPublicKey: string
) {
  const payload = {
    status: "confirmed",
    iso_time: confirmedTime,
    message: "Your reservation is confirmed!",
    table: "A4"
  };

  // Encrypt payload
  const encrypted = nip44.encrypt(
    JSON.stringify(payload),
    restaurantPrivateKey,
    customerPublicKey
  );

  // Build rumor
  const rumor = {
    kind: 9902,
    pubkey: restaurantPublicKey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["e", originalRequestId, "", "root"]
    ],
    content: encrypted
  };

  // Wrap with NIP-59
  return nip59.wrapEvent(rumor, restaurantPrivateKey, customerPublicKey);
}

// Build a declined response
function buildDeclinedResponse(
  originalRequestId: string,
  reason: string,
  restaurantPrivateKey: string,
  customerPublicKey: string
) {
  const payload = {
    status: "declined",
    iso_time: null,
    message: reason
  };

  // ... same encryption and wrapping process ...
}
```

## Schema Validation

The JSON schema for the decrypted payload is available at:
- [docs/schemas/reservation.response.schema.json](../schemas/reservation.response.schema.json)

You can use this schema to validate outgoing reservation responses.

## Status Flow

### Conversation End States

Both `confirmed` and `declined` statuses **end the reservation conversation**. After sending a kind:9902 with either status, the conversation is complete.

### Modification Flow

If you need to suggest an alternative time:
1. Do NOT send kind:9902 with `status: "suggested"` (deprecated)
2. Instead, send **kind:9903** (modification request) with the suggested time
3. Wait for customer response (kind:9904)
4. Then send kind:9902 with `status: "confirmed"` or `status: "declined"` based on their response

## Security Considerations

1. **End-to-End Encryption**: The entire reservation response is encrypted using NIP-44, ensuring only the customer can read it
2. **Threading**: Always include the original request event ID for proper conversation threading
3. **Validation**: Validate the payload against the schema before sending
4. **Rate Limiting**: Implement rate limiting to prevent spam

## Support

For questions or issues with reservation message handling, please refer to:
- [NIP-59 Specification](https://github.com/nostr-protocol/nips/blob/master/59.md)
- [NIP-44 Specification](https://github.com/nostr-protocol/nips/blob/master/44.md)
- [NIP-10 Specification](https://github.com/nostr-protocol/nips/blob/master/10.md) (Threading)
- [NIP-89 Specification](https://github.com/nostr-protocol/nips/blob/master/89.md) (Application Handlers)
- [NIP-89 Integration Guide](./nip89-integration.md) (Capability discovery)
- [Reservation Request Format](./RESERVATION_REQUEST_FORMAT.md)
- [Reservation Modification Format](./RESERVATION_MODIFICATION_FORMAT.md)
- [Implementation Status](./restaurants/implementation-status.md)

