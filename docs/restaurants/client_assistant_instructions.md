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
