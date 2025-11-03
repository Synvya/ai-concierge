# Instructions for AI Coding Assistant — Synvya Business Client

## Purpose

You are helping build the **Synvya Client** — the application used by restaurants and other businesses to:
- receive reservation messages from AI agents, and
- reply with confirmations or alternate times, all over Nostr with **NIP-59 Gift Wrap**.

---

## Event Types

| Action | Event Kind | Description |
|--------|-------------|--------------|
| Receive reservation request | `9901` | Reservation inquiry from AI Concierge |
| Send reservation response | `9902` | Confirmation or decline |
| Send modification request | `9903` | Suggest alternative time |
| Receive modification response | `9904` | Customer accepts or declines modification |

All communications use the **NIP-59 Gift Wrap** model (Rumor → Seal → Gift Wrap).

---

## How to Handle a Reservation Request

1. **Receive Gift Wrap (`kind:1059`)**
   - Addressed to the business pubkey.
   - Decrypt per NIP-59 → extract the `kind:13` seal → extract the rumor (`kind:9901`).

2. **Decrypt Rumor Payload (NIP-44)**
   ```json
   {
     "party_size": 2,
     "iso_time": "2025-10-17T19:00:00-07:00",
     "notes": "window seat"
   }
   ```

3. **Display in Merchant Inbox**
   - Thread messages using **NIP-10** markers (`root` and `reply`).
   - Show quick actions: ✅ Confirm / ⏰ Suggest / ❌ Decline.

---

## How to Send a Reservation Response

### To Confirm or Decline

1. **Create Rumor**
   - Unsigned event `kind:9902` with encrypted payload:
     ```json
     {
       "status": "confirmed",
       "iso_time": "2025-10-17T19:00:00-07:00",
       "message": "Your reservation is confirmed!",
       "table": "A4"
     }
     ```
   - Or for declined:
     ```json
     {
       "status": "declined",
       "iso_time": null,
       "message": "Fully booked tonight, sorry!"
     }
     ```

2. **Create Seal (`kind:13`)**
   - Include the rumor as content.

3. **Create Gift Wrap (`kind:1059`)**
   - Addressed to the AI Concierge (pubkey in `p` tag).
   - Include NIP-10 threading tags: `[["e", "<original_request_giftwrap_id>", "", "root"]]`
     - Use the gift wrap event ID (`id` field) from the original request (kind:9901) as the thread root
   - **Create TWO gift wraps**: one for customer, one for self (Self CC)
   - Publish both to relays.

4. **Include Light Proof of Work (NIP-13)**
   - To prevent spam and ensure relay acceptance.

### To Suggest Alternative Time

1. **Create Modification Request Rumor**
   - Unsigned event `kind:9903` with encrypted payload:
     ```json
     {
       "iso_time": "2025-10-17T19:30:00-07:00",
       "message": "7pm full, 7:30 available. Would that work?",
       "original_iso_time": "2025-10-17T19:00:00-07:00"
     }
     ```

2. **Create Seal (`kind:13`)**
   - Include the rumor as content.

3. **Create Gift Wrap (`kind:1059`)**
   - Addressed to the AI Concierge (pubkey in `p` tag).
   - Include NIP-10 threading tags: `[["e", "<original_request_giftwrap_id>", "", "root"]]`
     - Use the gift wrap event ID (`id` field) from the original request (kind:9901) as the thread root
   - **Create TWO gift wraps**: one for customer, one for self (Self CC)
   - Publish both to relays.

4. **After Customer Responds**
   - If customer accepts (kind:9904 with `status: "accepted"`), send kind:9902 with `status: "confirmed"`.
   - If customer declines (kind:9904 with `status: "declined"`), send kind:9902 with `status: "declined"` or another modification request.

---

## Implementation Notes

- Always use **NIP-44 encryption** for rumor payloads.
- Always use **NIP-59 wrapping** for message transport.
- Thread conversations per **NIP-10** (see [Threading](#threading-nip-10) section).
- Use **Self CC** for all outgoing messages (see [Self CC](#self-cc-copy-to-self) section).
- Use **NIP-40 expiration** to expire old proposals.
- Use **Addressable Events (NIP-01)** with `a` tags, not deprecated `d` tags.

---

## Threading (NIP-10)

All reservation messages must be linked using NIP-10 threading tags to maintain conversation context.

### Thread ID Specification

**The thread ID is the gift wrap event ID (`id` field) of the original reservation request (kind:9901).**

This gift wrap event ID becomes the root identifier for the entire conversation thread. All subsequent messages in the thread must reference this root event ID.

### Threading Rules by Message Type

#### 1. Reservation Request (kind:9901)
- **Thread ID**: This is the root message, so no threading tags needed initially
- **Gift Wrap ID**: The gift wrap event ID (`giftWrap.id`) becomes the thread ID for all future messages
- Store this ID for use in responses and modifications

#### 2. Reservation Response (kind:9902)
- **Root tag**: `["e", "<original_request_giftwrap_id>", "", "root"]`
- Reference the gift wrap event ID from the original request

#### 3. Modification Request (kind:9903)
- **Root tag**: `["e", "<original_request_giftwrap_id>", "", "root"]`
- Reference the gift wrap event ID from the original request

#### 4. Modification Response (kind:9904)
- **Root tag**: `["e", "<original_request_giftwrap_id>", "", "root"]`
- **Reply tag**: `["e", "<modification_request_giftwrap_id>", "", "reply"]`
- Reference both the original request and the modification request being replied to

### Example Threading Tags

```typescript
// Reservation Request (kind:9901) - No threading tags (this is the root)
const requestGiftWrap = wrapEvent(requestRumor, privateKey, restaurantPubkey);
const threadId = requestGiftWrap.id; // Store this as thread ID

// Reservation Response (kind:9902)
const responseTags = [
  ["e", threadId, "", "root"]  // Link to original request
];

// Modification Request (kind:9903)
const modificationTags = [
  ["e", threadId, "", "root"]  // Link to original request
];

// Modification Response (kind:9904)
const modificationResponseTags = [
  ["e", threadId, "", "root"],                    // Link to original request
  ["e", modificationRequestGiftWrap.id, "", "reply"]  // Reply to modification request
];
```

### Thread Detection

When receiving messages, extract the thread ID from NIP-10 tags:
- Look for `e` tag with `"root"` marker → this is the thread ID
- If no root tag exists, use the rumor's `id` field as the thread ID (for root messages)

---

## Self CC (Copy to Self)

The Self CC pattern ensures that all sent messages are stored on relays for remote access and multi-device synchronization.

### Why Self CC?

With Self CC, you can:
- **Retrieve sent messages** from relays (not just received messages)
- **Sync across devices** by querying relays for your own messages
- **Backup conversation history** remotely, not just locally
- **Recover from local storage loss** by re-fetching from relays

### How It Works

When sending any message, create **TWO gift wrap events**:

1. **Gift Wrap to Recipient**: Encrypted for the recipient's public key
   - Addressed to recipient: `["p", "<recipient_pubkey_hex>"]`
   - Recipient can decrypt and read

2. **Gift Wrap to Self**: Encrypted for your own public key
   - Addressed to self: `["p", "<your_pubkey_hex>"]`
   - You can decrypt and read (for storage/sync)

### Implementation Pattern

```typescript
// Build the rumor (same for both)
const rumor = buildReservationResponse(
  payload,
  privateKey,
  recipientPublicKey,
  threadTags
);

// Create TWO gift wraps
const giftWrapToRecipient = wrapEvent(
  rumor,
  privateKey,
  recipientPublicKey  // Encrypted for recipient
);

const giftWrapToSelf = wrapEvent(
  rumor,
  privateKey,
  yourPublicKey  // Encrypted for self
);

// Publish BOTH to relays
await Promise.all([
  publishToRelays(giftWrapToRecipient, relays),
  publishToRelays(giftWrapToSelf, relays)
]);
```

### Receiving Self CC Messages

When subscribing to relays:

1. Subscribe to gift wraps addressed to your pubkey: `["#p", [yourPubkey]]`
2. You'll receive **both** gift wraps:
   - Gift wrap to recipient (encrypted for recipient) → **Cannot decrypt** → Silently ignore "invalid MAC" errors
   - Gift wrap to self (encrypted for you) → **Can decrypt** → Process normally

3. Handle decryption failures gracefully:
   ```typescript
   try {
     const rumor = unwrapEvent(giftWrap, yourPrivateKey);
     // Process message
   } catch (error) {
     if (error.message.includes('invalid MAC')) {
       // This is a gift wrap encrypted for someone else (expected with Self CC)
       // Silently ignore - it's the recipient's copy
       return;
     }
     throw error; // Real error
   }
   ```

### Important Notes

- **Both gift wraps use identical rumors** (same kind, content, tags, timestamp)
- **Only difference is the recipient** (different `p` tag and encryption key)
- **Both should be published** to ensure reliable delivery
- **Thread ID is the same** for both gift wraps (use the recipient's gift wrap ID)

---

## Example Flow

```
Gift Wrap (1059) → Seal (13) → Rumor (9901)
                                  ↓
                              Decrypt (NIP-44)
                                  ↓
                      Display message + reply
                                  ↓
Gift Wrap (1059) → Seal (13) → Rumor (9902)
```

---

## Testing During Development

### Test Harness
The business client includes a built-in test harness (dev mode only) at `/app/test-harness`.

**Features:**
- Simulates AI agent sending reservation requests
- Uses ephemeral keypair for testing
- Allows testing all negotiation flows (accept/decline/suggest)
- Quick example buttons for common scenarios
- Visible only in development (`import.meta.env.DEV`)

**Usage:**
1. Start the dev server: `cd client && npm run dev -- --host 127.0.0.1 --port 3000`
2. Navigate to Test Harness page in the navigation menu
3. Fill in reservation details (party size, date/time, notes, contact)
4. Click "Send Reservation Request"
5. View the request in the Reservations inbox
6. Test accept/decline/suggest flows with action dialogs
7. Verify threading and conversation grouping

**Important Notes:**
- Test messages are **real Nostr events** published to configured relays
- The test harness creates a new agent identity each session
- Responses you send will be visible in the conversation thread
- Use this to verify the full message exchange cycle before building the AI agent

### Running Tests
```bash
cd client
npm test              # Run all unit tests
npm run lint          # Check for linting errors
npm run build         # Build for production
```

### CI/CD
- GitHub Actions automatically runs tests on every PR
- Tests must pass before merging
- Located: `.github/workflows/test.yml`

---

## ⚠️ Current Implementation Notes

### Proof of Work (NIP-13)
- Library implemented but **not currently enforced on outgoing messages**
- Library can mine events with target difficulty
- Future versions will require minimum difficulty for relay acceptance
- Relays may reject events without adequate PoW
- **Phase 2 will enable PoW enforcement**

### Expiration (NIP-40)
- **Not yet implemented** in Phase 1
- Future versions will automatically expire old requests using `expiration` tag
- Manually track expiration in application logic for now
- Consider implementing client-side expiration checks

### Relay Configuration
- Currently configured in Settings page
- Default relays used if none configured
- Multiple relay support for redundancy
- Future: NIP-65 relay list discovery

---

## Implementation Reference

### File Structure
```
client/src/
├── lib/
│   ├── nip44.ts              # NIP-44 encryption/decryption
│   ├── nip59.ts              # NIP-59 gift wrap utilities
│   ├── nip10.ts              # NIP-10 threading
│   ├── nip13.ts              # NIP-13 proof of work (library only)
│   ├── reservationEvents.ts  # Build/parse 9901/9902
│   └── relayPool.ts          # Relay connection management
├── services/
│   └── reservationService.ts # Subscription and message handling
├── state/
│   └── useReservations.ts    # Zustand store for reservations
├── pages/
│   ├── Reservations.tsx      # Inbox UI
│   └── TestHarness.tsx       # Dev testing tool
└── types/
    └── reservation.ts        # TypeScript types
```

### Key Functions
- `buildReservationRequest()`: Create encrypted 9901 rumor
- `buildReservationResponse()`: Create encrypted 9902 rumor
- `wrapEvent()`: Wrap rumor in NIP-59 gift wrap
- `unwrapEvent()`: Unwrap and decrypt gift wrap
- `parseReservationRequest()`: Parse and validate 9901
- `parseReservationResponse()`: Parse and validate 9902

---

## Future Work

- **Phase 2**: NIP-13 Proof of Work enforcement
- **Phase 2**: NIP-40 Expiration timestamps
- **Phase 3**: Notifications for new messages (WebSocket or push)
- **Phase 3**: Support for `order.request` and `order.response`
- **Phase 3**: NIP-65 relay list discovery and preference
- **Phase 3**: Integration with POS systems for availability

---
