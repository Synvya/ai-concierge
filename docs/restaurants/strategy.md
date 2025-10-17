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
     - `kind:32101` — `reservation.request`
     - `kind:32102` — `reservation.response`
   - Calendar messages (NIP-52) are also exchanged via NIP-59 wrapping.

4. **NIP References**
   - **NIP-01:** Core protocol + Addressable Events
   - **NIP-10:** Threaded conversations (`root` and `reply` markers)
   - **NIP-13:** Proof of Work (light anti-spam)
   - **NIP-40:** Expiration timestamps
   - **NIP-44:** Versioned encryption (for rumor payloads)
   - **NIP-52:** Calendar events
   - **NIP-59:** Gift Wrap (mandatory for all inter-party messages)

---

## Message Construction (NIP-59 Protocol)

### Reservation Request

1. **Create a rumor**
   - Unsigned event of `kind:32101` containing the reservation request payload.
   - Payload encrypted with **NIP-44**.

2. **Seal the rumor**
   - Create a `kind:13` **seal event** that wraps the rumor.

3. **Gift wrap**
   - Create a `kind:1059` **gift wrap event** that contains the seal and is addressed to the restaurant (`p` tag = restaurant pubkey).

### Reservation Response

1. **Create a rumor**
   - Unsigned event of `kind:32102` containing the reservation response payload.

2. **Seal the rumor**
   - Create a `kind:13` seal event containing the rumor.

3. **Gift wrap**
   - Create a `kind:1059` gift wrap event addressed to the **AI Concierge**.

### Calendar Event Exchange

- The same **Rumor → Seal → Gift Wrap** structure is used for:
  - Reservation confirmation (`kind:31923`, NIP-52)
  - RSVP (`kind:31925`)
  - Calendar updates (`kind:31924`)

All are encrypted and exchanged as NIP-59 gift-wrapped payloads.

---

## Replaceable Events

Addressable (replaceable) events now use the **`a` tag** per NIP-01:

```
["a", "<kind integer>:<32-bytes lowercase hex of a pubkey>:", <optional relay URL>]
```

Do **not** use the deprecated `d` tag for addressable identification.

---

## End-to-End Flow Summary

1. **AI Concierge → Restaurant**
   - Sends `reservation.request` (`kind:32101`) wrapped via NIP-59.

2. **Restaurant ↔ Concierge**
   - Exchanges `reservation.response` (`kind:32102`) via NIP-59, threaded with NIP-10.

3. **Restaurant → Concierge**
   - Sends confirmed **NIP-52 calendar event** (`kind:31923`), wrapped via NIP-59.

4. **Concierge → Restaurant**
   - Sends RSVP (`kind:31925`), wrapped via NIP-59.

5. **Restaurant**
   - Stores the confirmed reservation in its calendar (`kind:31924`).

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

## Vision

This protocol creates a **message-based commerce fabric** — every booking, order, or payment begins as a secure message over Nostr.  
The restaurant reservation loop is the first end-to-end proof of AI-driven commerce.

---
