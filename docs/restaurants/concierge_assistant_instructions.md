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
| Send reservation request | `32101` | Request to restaurant |
| Receive reservation response | `32102` | Restaurant reply |
| Receive confirmed calendar | `31923` | NIP-52 event from restaurant |
| Send RSVP | `31925` | Confirmation of booking |
| Store confirmed events | `31924` | User calendar |

All messages are exchanged using **NIP-59 Gift Wrap (mandatory)**.

---

## Sending a Reservation Request

1. **Create Rumor**
   - Unsigned event `kind:32101` containing encrypted payload (NIP-44):
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
   - Unwrap → decrypt → extract rumor (`kind:32102`).

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
       └─ Rumor(32101)

2. Restaurant replies Gift Wrap(1059)
   └─ Seal(13)
       └─ Rumor(32102)

3. Repeat until agreement.

4. Restaurant sends Gift Wrap(1059)
   └─ Seal(13)
       └─ Calendar Event (31923)

5. Concierge sends Gift Wrap(1059)
   └─ Seal(13)
       └─ RSVP (31925)
```

---

## Error Handling

- Retry if Gift Wrap fails to propagate (relay errors).
- If message expires (NIP-40), mark thread as closed.
- Deduplicate using Addressable Event `a` tag identity.

---

## Future Enhancements

- Parallel negotiation (multiple restaurants).
- Multi-agent brokerage for busy times.
- Integration with OpenAI Commerce Protocol.
- Payment events (`order.request`, `payment.proposal`) following same NIP-59 structure.

---
