# Restaurant Reservation Response Format

## Overview
When responding to a reservation request, the restaurant MUST include proper thread markers (NIP-10) to ensure the AI Concierge can match the response to the original request.

## Required Response Format

### 1. Response Structure (kind 32102)

```typescript
{
  kind: 32102,  // Reservation response
  content: "{encrypted_payload}",  // NIP-44 encrypted JSON
  tags: [
    ["p", "<customer_pubkey_hex>"],           // Required: Customer's public key
    ["e", "<original_giftwrap_id>", "", "root"],  // Required: Original request ID
  ],
  // ... other standard Nostr event fields
}
```

### 2. Thread Matching

**CRITICAL**: The `e` tag MUST reference the **gift wrap ID** of the original reservation request, NOT the rumor ID.

When the customer sends a reservation:
```
Customer Request (Gift Wrap):
  - ID: "abc123..." ← USE THIS ID
  - Contains: Encrypted Rumor (kind 32101)
```

Your response MUST tag this gift wrap ID:
```typescript
tags: [
  ["p", customerPubkeyHex],
  ["e", "abc123...", "", "root"],  // Reference the gift wrap ID
]
```

### 3. Encrypted Payload

The `content` field contains a NIP-44 encrypted JSON payload:

```typescript
{
  status: "confirmed" | "suggested" | "declined" | "expired" | "cancelled",
  iso_time?: string,      // ISO 8601 datetime (required for confirmed/suggested)
  table?: string,         // Optional table number
  message?: string,       // Optional message to customer
  hold_expires_at?: string  // Optional expiry for soft holds
}
```

### 4. Complete Example

```typescript
// Step 1: Receive and decrypt the customer's request
const customerRequest = unwrapEvent(receivedGiftWrap, restaurantPrivateKey);
const requestData = JSON.parse(decryptNip44(customerRequest.content, ...));

// requestData will be:
// {
//   party_size: 2,
//   iso_time: "2025-10-26T17:00:00-07:00",
//   notes: "Window seat please"
// }

// Step 2: Build your response payload
const responsePayload = {
  status: "confirmed",
  iso_time: requestData.iso_time,  // Confirm the requested time
  table: "12",
  message: "Looking forward to seeing you!"
};

// Step 3: Create response rumor
const responseRumor = {
  kind: 32102,
  content: encryptNip44(
    JSON.stringify(responsePayload),
    restaurantPrivateKey,
    customerPubkey
  ),
  tags: [
    ["p", customerPubkey],
    ["e", receivedGiftWrap.id, "", "root"],  // ← KEY: Reference original gift wrap ID
  ],
  created_at: Math.floor(Date.now() / 1000),
  pubkey: restaurantPubkey,
};

// Step 4: Wrap and send
const responseGiftWrap = wrapEvent(
  responseRumor,
  restaurantPrivateKey,
  customerPubkey
);

await publishToRelays(responseGiftWrap, relays);
```

## Response Status Types

### confirmed
Restaurant accepts the reservation at the requested time.

```json
{
  "status": "confirmed",
  "iso_time": "2025-10-26T17:00:00-07:00",
  "table": "12",
  "message": "We look forward to serving you!"
}
```

### suggested
Restaurant suggests an alternative time.

```json
{
  "status": "suggested",
  "iso_time": "2025-10-26T18:00:00-07:00",
  "message": "We're fully booked at 5pm, but 6pm is available."
}
```

### declined
Restaurant cannot accommodate the request.

```json
{
  "status": "declined",
  "message": "We're fully booked for that date. Please try another day."
}
```

### expired
A previously-held reservation has expired.

```json
{
  "status": "expired",
  "message": "Your soft hold has expired. Please request again."
}
```

### cancelled
Restaurant needs to cancel a confirmed reservation.

```json
{
  "status": "cancelled",
  "message": "We apologize, but we need to cancel due to unforeseen circumstances."
}
```

## Debugging

### If the customer doesn't see your response:

1. **Check the `e` tag**: Verify you're using the **gift wrap ID**, not the rumor ID
2. **Check encryption**: Ensure you're encrypting with the customer's public key
3. **Check relays**: Publish to the same relays the customer is subscribed to:
   - `wss://relay.damus.io`
   - `wss://nos.lol`
   - `wss://relay.nostr.band`

### Console Logs

The customer's console will show:
```
📤 Sent reservation request - Thread ID: <gift_wrap_id>
```

Your response should tag this exact ID. If thread matching fails, you'll see:
```
Received response for unknown thread: <your_thread_id>
Available threads: [<expected_thread_id>, ...]
```

Compare these IDs to ensure they match.

## Testing

Use the Nostr dev tools or your test app to:

1. Subscribe to the customer's requests
2. Extract the gift wrap ID from received events
3. Include it in the `e` tag of your response
4. Verify the response appears in the customer's UI

## Questions?

If responses still aren't matching:
- Check that the `e` tag format is exactly: `["e", "gift_wrap_id", "", "root"]`
- Verify the gift wrap ID matches what the customer sent
- Ensure the response is properly encrypted with NIP-44
- Confirm you're publishing to at least one common relay

