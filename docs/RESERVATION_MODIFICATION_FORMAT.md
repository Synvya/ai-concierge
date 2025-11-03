# Reservation Modification Format (kinds 9903 and 9904)

This document describes the format of reservation modification messages used to negotiate alternative times in the 4-message reservation flow.

## Overview

Modification messages allow restaurants and customers to negotiate alternative reservation times when the requested time is unavailable. The messages are encrypted using NIP-44 and wrapped in NIP-59 gift wrap (kind:1059).

This is part of the 4-message reservation flow:
1. **Reservation.request** (kind:9901) - Customer → Restaurant
2. **Reservation.response** (kind:9902) - Restaurant → Customer (confirmed/declined) - Ends conversation
3. **Reservation.modification.request** (kind:9903) - Restaurant → Customer (this document) - Suggest alternative time
4. **Reservation.modification.response** (kind:9904) - Customer → Restaurant (this document) - Accept/decline modification

## When to Use Modification Messages

### Restaurant → Customer (kind:9903)

Send a modification request when:
- The requested time is unavailable
- You have alternative times available
- You want to negotiate with the customer rather than declining

**Do NOT use** kind:9902 with `status: "suggested"` (deprecated). Use kind:9903 instead.

**NIP-89 Discovery**: Restaurants should publish NIP-89 handler recommendations (kind:31989) with `d:9903` and `d:9904` to advertise modification support. See [NIP-89 Integration Guide](./nip89-integration.md) for details. However, the system will still process modification requests even if not advertised via NIP-89.

### Customer → Restaurant (kind:9904)

Send a modification response when:
- You receive a modification request (kind:9903) from a restaurant
- You want to accept or decline the suggested alternative time

**Implementation Note**: The AI Concierge will respond to modification requests even if the restaurant doesn't advertise modification support via NIP-89. This ensures backward compatibility with restaurants that support modifications but haven't published NIP-89 handlers yet.

## Message Structure

### Outer Layer (Gift Wrap - kind:1059)

Both modification request and response messages use the same gift wrap structure:

```json
{
  "kind": 1059,
  "pubkey": "<random ephemeral pubkey>",
  "created_at": <unix timestamp>,
  "tags": [
    ["p", "<recipient_pubkey_hex>"]
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

### Inner Layer (Rumor)

After decrypting the seal content, you get the actual modification message (an unsigned event called a "rumor"):

#### Modification Request (kind:9903)
```json
{
  "kind": 9903,
  "pubkey": "<restaurant_pubkey_hex>",
  "created_at": <unix timestamp>,
  "tags": [
    ["e", "<original_request_giftwrap_id>", "", "root"]
  ],
  "content": "<encrypted_payload>"
}
```

#### Modification Response (kind:9904)
```json
{
  "kind": 9904,
  "pubkey": "<customer_pubkey_hex>",
  "created_at": <unix timestamp>,
  "tags": [
    ["e", "<original_request_giftwrap_id>", "", "root"],
    ["e", "<modification_request_giftwrap_id>", "", "reply"]
  ],
  "content": "<encrypted_payload>"
}
```

## Modification Request Payload (kind:9903)

### Decrypted Payload

The `content` field of the rumor is encrypted using NIP-44 and contains:

```json
{
  "iso_time": "2025-10-30T19:30:00-07:00",
  "message": "We're fully booked at 7pm, but 7:30pm is available. Would that work for you?",
  "original_iso_time": "2025-10-30T19:00:00-07:00"
}
```

### Field Descriptions

#### Required Fields

- **`iso_time`** (string, date-time): Suggested alternative time in ISO 8601 format with timezone
  - Example: `"2025-10-30T19:30:00-07:00"` means 7:30 PM Pacific Time
  
- **`message`** (string, max 2000 chars): Explanation of why modification is needed and details about the suggested time
  - Should explain why the original time doesn't work
  - Should describe the alternative time clearly
  - Be friendly and helpful

#### Optional Fields

- **`original_iso_time`** (string, date-time): Original requested time (for reference)
  - Helps customers understand what they originally requested
  - Useful for comparison and context

### Example Implementation (Restaurant Side)

```typescript
import { nip44, nip59 } from 'nostr-tools';

function buildModificationRequest(
  originalRequestId: string,
  suggestedTime: string,
  originalTime: string,
  reason: string,
  restaurantPrivateKey: string,
  customerPublicKey: string
) {
  const payload = {
    iso_time: suggestedTime,
    message: reason,
    original_iso_time: originalTime
  };

  // Encrypt payload
  const encrypted = nip44.encrypt(
    JSON.stringify(payload),
    restaurantPrivateKey,
    customerPublicKey
  );

  // Build rumor
  const rumor = {
    kind: 9903,
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
```

## Modification Response Payload (kind:9904)

### Decrypted Payload

The `content` field of the rumor is encrypted using NIP-44 and contains:

#### Accepted Response
```json
{
  "status": "accepted",
  "iso_time": "2025-10-30T19:30:00-07:00",
  "message": "Yes, 7:30pm works perfectly!"
}
```

#### Declined Response
```json
{
  "status": "declined",
  "message": "Unfortunately 7:30pm doesn't work for us. We'll try another day."
}
```

### Field Descriptions

#### Required Fields

- **`status`** (string, enum): Whether customer accepts the modification
  - `"accepted"`: Customer accepts the suggested alternative time
  - `"declined"`: Customer declines the suggested alternative time

#### Conditionally Required Fields

- **`iso_time`** (string, date-time): **Required when `status` is `"accepted"`**
  - Should match the `iso_time` from the modification request
  - Confirms the exact time being accepted

#### Optional Fields

- **`message`** (string, max 2000 chars): Optional message from customer
  - Can provide additional context or preferences
  - Can be a simple acknowledgment

### Example Implementation (Customer Side)

```typescript
import { nip44, nip59 } from 'nostr-tools';

function buildModificationResponse(
  originalRequestId: string,
  modificationRequestId: string,
  acceptedTime: string,
  status: "accepted" | "declined",
  message: string,
  customerPrivateKey: string,
  restaurantPublicKey: string
) {
  const payload: any = {
    status,
    message
  };

  // Include iso_time if accepted
  if (status === "accepted") {
    payload.iso_time = acceptedTime;
  }

  // Encrypt payload
  const encrypted = nip44.encrypt(
    JSON.stringify(payload),
    customerPrivateKey,
    restaurantPublicKey
  );

  // Build rumor with NIP-10 threading
  const rumor = {
    kind: 9904,
    pubkey: customerPublicKey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["e", originalRequestId, "", "root"],      // Link to original request
      ["e", modificationRequestId, "", "reply"]  // Reply to modification request
    ],
    content: encrypted
  };

  // Wrap with NIP-59
  return nip59.wrapEvent(rumor, customerPrivateKey, restaurantPublicKey);
}
```

## Threading (NIP-10)

### Modification Request (kind:9903)

Include the original reservation request's gift wrap event ID as the root:

```json
{
  "kind": 9903,
  "tags": [
    ["e", "<original_request_giftwrap_id>", "", "root"]
  ],
  ...
}
```

### Modification Response (kind:9904)

Include both the original request and the modification request:

```json
{
  "kind": 9904,
  "tags": [
    ["e", "<original_request_giftwrap_id>", "", "root"],
    ["e", "<modification_request_giftwrap_id>", "", "reply"]
  ],
  ...
}
```

This ensures all messages in the conversation are properly linked.

## Complete Flow Example

### Scenario: Restaurant suggests alternative time

1. **Customer sends request** (kind:9901)
   - Requested time: 7:00 PM
   - Thread ID: `event_abc123`

2. **Restaurant sends modification request** (kind:9903)
   - Suggested time: 7:30 PM
   - Tags: `[["e", "event_abc123", "", "root"]]`
   - Thread ID: `event_def456`

3. **Customer accepts** (kind:9904)
   - Status: `"accepted"`
   - Tags: `[["e", "event_abc123", "", "root"], ["e", "event_def456", "", "reply"]]`
   - Thread ID: `event_ghi789`

4. **Restaurant sends confirmation** (kind:9902)
   - Status: `"confirmed"`
   - Tags: `[["e", "event_abc123", "", "root"]]`
   - Conversation ends

## Implementation Notes

### For Restaurants

1. **When to Use Modification Requests**:
   - Preferred over declining when alternatives are available
   - Shows flexibility and customer service
   - Allows negotiation rather than rejection

2. **Modification Request Content**:
   - Be clear about why the original time doesn't work
   - Suggest specific alternative times
   - Include `original_iso_time` for context

3. **After Receiving Modification Response**:
   - If `status: "accepted"`: Send kind:9902 with `status: "confirmed"`
   - If `status: "declined"`: You can send another modification request or decline with kind:9902

4. **NIP-89 Discovery** (Recommended):
   - Publish NIP-89 handler recommendations (kind:31989) with `d:9903` and `d:9904` to advertise modification support
   - This helps AI Concierge systems discover your modification capabilities
   - See [NIP-89 Integration Guide](./nip89-integration.md) for implementation details
   - **Note**: You can still send modification requests without NIP-89 handlers (backward compatible)

### For Customers (AI Concierge)

1. **Handling Modification Requests**:
   - Parse incoming kind:9903 messages
   - Display to user with clear comparison (original vs. suggested)
   - Allow user to accept or decline

2. **Sending Modification Responses**:
   - Always include `iso_time` when accepting
   - Link properly to both original request and modification request
   - Wait for restaurant's final response (kind:9902)

3. **NIP-89 Discovery and Behavior**:
   - The system checks for modification support via NIP-89 discovery (queries for `d:9903` and `d:9904`)
   - If a restaurant sends a modification request (kind:9903) but doesn't advertise support via NIP-89:
     - The system will log a warning but **still process the modification request**
     - Modification responses (kind:9904) will be sent normally
     - This ensures backward compatibility with restaurants that support modifications but haven't published NIP-89 handlers
   - See [NIP-89 Integration Guide](./nip89-integration.md) for discovery details

## Schema Validation

The JSON schemas for the decrypted payloads are available at:
- [docs/schemas/reservation.modification.request.schema.json](../schemas/reservation.modification.request.schema.json)
- [docs/schemas/reservation.modification.response.schema.json](../schemas/reservation.modification.response.schema.json)

You can use these schemas to validate incoming and outgoing modification messages.

## Security Considerations

1. **End-to-End Encryption**: All modification messages are encrypted using NIP-44
2. **Threading**: Always include proper NIP-10 tags to maintain conversation context
3. **Validation**: Validate payloads against schemas before processing
4. **Rate Limiting**: Implement rate limiting to prevent spam

## Support

For questions or issues with modification message handling, please refer to:
- [NIP-59 Specification](https://github.com/nostr-protocol/nips/blob/master/59.md)
- [NIP-44 Specification](https://github.com/nostr-protocol/nips/blob/master/44.md)
- [NIP-10 Specification](https://github.com/nostr-protocol/nips/blob/master/10.md) (Threading)
- [NIP-89 Specification](https://github.com/nostr-protocol/nips/blob/master/89.md) (Application Handlers)
- [NIP-89 Integration Guide](./nip89-integration.md) (Modification discovery)
- [Reservation Request Format](./RESERVATION_REQUEST_FORMAT.md)
- [Restaurant Response Format](./RESTAURANT_RESPONSE_FORMAT.md)
- [Implementation Status](./restaurants/implementation-status.md)

