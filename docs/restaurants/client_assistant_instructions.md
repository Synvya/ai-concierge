# Instructions for AI Coding Assistant — Synvya Business Client

## Purpose

You are helping build the **Synvya Client** — the application used by restaurants and other businesses to:
- receive reservation messages from AI agents,
- reply with confirmations or alternate times, and
- publish calendar events, all over Nostr with **NIP-59 Gift Wrap**.

---

## Event Types

| Action | Event Kind | Description |
|--------|-------------|--------------|
| Receive reservation request | `32101` | Reservation inquiry from AI Concierge |
| Send reservation response | `32102` | Confirmation or counter-offer |
| Send calendar event | `31923` | Time-based event (NIP-52) |
| Store confirmed reservation | `31924` | Business calendar (NIP-52) |
| Receive RSVP | `31925` | Confirmation from user (NIP-52) |

All communications use the **NIP-59 Gift Wrap** model (Rumor → Seal → Gift Wrap).

---

## How to Handle a Reservation Request

1. **Receive Gift Wrap (`kind:1059`)**
   - Addressed to the business pubkey.
   - Decrypt per NIP-59 → extract the `kind:13` seal → extract the rumor (`kind:32101`).

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

1. **Create Rumor**
   - Unsigned event `kind:32102` with encrypted payload:
     ```json
     {
       "status": "suggested",
       "iso_time": "2025-10-17T19:30:00-07:00",
       "message": "7pm full, 7:30 available"
     }
     ```

2. **Create Seal (`kind:13`)**
   - Include the rumor as content.

3. **Create Gift Wrap (`kind:1059`)**
   - Addressed to the AI Concierge (pubkey in `p` tag).
   - Publish to appropriate relay.

4. **Include Light Proof of Work (NIP-13)**
   - To prevent spam and ensure relay acceptance.

---

## Final Confirmation via Calendar Event

1. When agreement is reached:
   - Create a NIP-52 **Time-Based Calendar Event** (`kind:31923`).
   - Follow same Rumor → Seal → Gift Wrap structure.
   - Address to the AI Concierge.

2. Await RSVP (`kind:31925`) via NIP-59 gift wrap.

3. Store the confirmed booking in local calendar (`kind:31924`).

---

## Implementation Notes

- Always use **NIP-44 encryption** for rumor payloads.
- Always use **NIP-59 wrapping** for message transport.
- Thread conversations per **NIP-10**.
- Use **NIP-40 expiration** to expire old proposals.
- Use **Addressable Events (NIP-01)** with `a` tags, not deprecated `d` tags.

---

## Example Flow

```
Gift Wrap (1059) → Seal (13) → Rumor (32101)
                                  ↓
                              Decrypt (NIP-44)
                                  ↓
                      Display message + reply
                                  ↓
Gift Wrap (1059) → Seal (13) → Rumor (32102)
```

---

## Future Work

- Notifications for new messages (WebSocket or push).
- Support for `order.request` and `order.response` using same structure.
- Optional relay configuration (`kind:10050` Preferred DM Relays).

---
