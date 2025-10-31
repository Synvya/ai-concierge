# Manual Testing Guide: Reservation Features

This guide covers end-to-end manual testing of the natural language reservation messaging system using Nostr protocol.

## Prerequisites

### Required Services
1. **AI Concierge** (this repository)
   - Backend running on http://localhost:8000
   - Frontend running on http://localhost:5173
   - Database populated with sample data including restaurants with Nostr public keys

2. **Business Client Test Harness** ([synvya-client-2](https://github.com/Synvya/synvya-client-2))
   - Separate repository for testing restaurant message handling
   - Must be running to receive and respond to reservations

### Setup Steps

```bash
# 1. Start AI Concierge
cd ai-concierge
docker-compose up --build

# 2. Verify services
# - Backend: http://localhost:8000/docs
# - Frontend: http://localhost:5173
# - Database has restaurants with valid npub keys

# 3. Start Business Client (in separate terminal)
cd synvya-client-2
npm install
npm run dev
# Follow repo instructions for configuration
```

### Pre-Test Checklist
- [ ] AI Concierge frontend loads without errors
- [ ] Browser console shows no critical errors
- [ ] Check browser localStorage for `nostr-identity` key (should auto-generate on first visit)
- [ ] Business client test harness is running and connected to relays
- [ ] At least one restaurant in database has a valid `npub` in `normalized_pubkeys`

## Test Scenarios

### Scenario 1: Complete Natural Language Flow (Happy Path)

**Objective**: Test end-to-end reservation with all details provided upfront.

**Steps**:
1. Open AI Concierge in browser (http://localhost:5173)
2. Type: "Find Italian restaurants"
3. Verify: Search results display with restaurant cards
4. Confirm: At least one restaurant (e.g., "Mario's Pizza") appears
5. Type: "Book a table for 4 at Mario's Pizza tonight at 7pm"
6. Verify assistant response:
   - Should say something like: "I've sent your reservation request to Mario's Pizza for 4 people at [datetime]"
   - Message indicates successful send
7. Switch to "Reservations" tab
8. Verify:
   - New reservation thread appears
   - Shows: Mario's Pizza, 4 people, datetime, status badge "Sent"
   - Timestamp shows "Just now" or recent time

**Business Client Verification**:
9. Switch to Business Client test harness
10. Verify: New gift wrap event received (kind 1059)
11. Unwrap and decrypt the message
12. Confirm: Decrypted payload shows kind 9901 (reservation request) with:
    - `party_size`: 4
    - `iso_time`: (appropriate datetime)
    - Correct NIP-10 threading tags

**Response Flow**:
13. In Business Client, send a confirmation response (kind 9902)
14. Back in AI Concierge, check Reservations tab
15. Verify:
    - Thread status updates to "Confirmed" (may take a few seconds for relay propagation)
    - New message appears in thread with confirmation details

**Expected Results**:
- ✅ Reservation request successfully created from natural language
- ✅ Message encrypted and sent to relay
- ✅ Business client receives and decrypts message
- ✅ Response appears in Reservations panel
- ✅ Status badge updates correctly

---

### Scenario 2: Interactive Follow-Up (Missing Details)

**Objective**: Test multi-turn conversation when user doesn't provide all details.

**Steps**:
1. Type: "Make a reservation at La Terraza"
2. Verify assistant asks: "How many people?"
3. Type: "4 people"
4. Verify assistant asks: "What time would you like to dine?"
5. Type: "tomorrow at 7pm"
6. Verify:
   - Assistant confirms sending reservation
   - Details include: La Terraza, 4 people, tomorrow 7pm
7. Check Reservations tab:
   - New thread appears with correct details
   - Status: "Sent"

**Expected Results**:
- ✅ Assistant prompts for missing details in order
- ✅ Collects party size, time sequentially
- ✅ Sends complete reservation once all details gathered

---

### Scenario 3: Multiple Missing Details

**Objective**: Test when user provides only restaurant name or no details.

**Steps**:
1. Type: "I want to make a reservation"
2. Verify assistant asks: "Which restaurant would you like to book?"
3. Type: "Mario's Pizza"
4. Verify assistant asks: "How many people?"
5. Type: "2"
6. Verify assistant asks: "What time would you like to dine?"
7. Type: "tonight at 8pm"
8. Verify reservation sent with all details

**Expected Results**:
- ✅ Assistant guides user through all required fields
- ✅ Maintains context across multiple turns
- ✅ Final reservation includes all details

---

### Scenario 4: Notes and Special Requests

**Objective**: Test optional notes field in reservations.

**Steps**:
1. Type: "Book for 2 at La Terraza tonight at 6:30pm, window seat please"
2. Verify:
   - Reservation sent successfully
   - Notes field contains "window seat please"
3. Check Reservations panel:
   - Thread card displays notes in italics/quotes

**Expected Results**:
- ✅ Notes extracted from natural language
- ✅ Notes included in reservation request payload
- ✅ Notes visible in UI

---

### Scenario 5: Restaurant Without Nostr Key

**Objective**: Test error handling when restaurant doesn't support reservations.

**Steps**:
1. Find a restaurant in search that doesn't have an `npub`
2. Type: "Book a table at [RestaurantName] for 4 tonight at 7pm"
3. Verify assistant response:
   - Error message: "I couldn't find that restaurant in the current search results" or
   - "This restaurant does not support Nostr reservations"
4. Check Reservations tab:
   - No new thread created

**Expected Results**:
- ✅ Graceful error message
- ✅ No incomplete reservation created
- ✅ User can search for another restaurant

---

### Scenario 6: Status Badges and Updates

**Objective**: Test all status transitions and badge display.

**Steps**:
1. Create a reservation (any restaurant)
2. Verify initial status: "Sent" (blue badge)
3. From Business Client, send responses for each status:
   - **Confirmed**: Response with `status: "confirmed"`
   - **Declined**: Response with `status: "declined"`
   - **Suggested**: Response with `status: "suggested"` and alternative times
4. After each response, check Reservations panel:
   - Status badge updates
   - Badge colors:
     - Sent: Blue
     - Confirmed: Green
     - Declined: Red
     - Suggested: Orange

**Expected Results**:
- ✅ All status types display correctly
- ✅ Badge colors match status
- ✅ Real-time updates (within ~5 seconds of relay propagation)

---

### Scenario 7: Thread Grouping and Sorting

**Objective**: Test conversation threading and chronological ordering.

**Steps**:
1. Create multiple reservations at different restaurants
2. In Business Client, send multiple responses for the same reservation
3. Check Reservations panel:
   - Each restaurant conversation is a separate thread
   - Within a thread, messages appear chronologically
   - Threads sorted by most recent activity (newest first)
4. Refresh page:
   - All threads persist
   - Order and grouping maintained

**Expected Results**:
- ✅ NIP-10 threading groups messages correctly
- ✅ Multiple reservations don't interfere
- ✅ Most active conversations appear at top

---

### Scenario 8: Browser Identity Persistence

**Objective**: Test Nostr keypair generation and localStorage persistence.

**Steps**:
1. Open browser DevTools → Application → Local Storage
2. Find `nostr-identity` key
3. Verify value is valid JSON with:
   - `publicKey`: hex string (64 chars)
   - `privateKey`: hex string (64 chars)
   - `npub`: bech32 string starting with "npub1"
   - `nsec`: bech32 string starting with "nsec1"
4. Copy the `npub` value
5. Send a reservation
6. In Business Client, check the sender's public key matches your `npub`
7. Refresh the AI Concierge page
8. Verify:
   - Same `npub` in localStorage
   - Previous reservations still visible
   - Can send new reservations from same identity

**Expected Results**:
- ✅ Identity auto-generates on first visit
- ✅ Persists across page refreshes
- ✅ All messages signed with consistent keypair

---

### Scenario 9: Time Parsing Edge Cases

**Objective**: Test various natural language time formats.

**Test Inputs**:
| Input | Expected Interpretation |
|-------|------------------------|
| "tonight at 7pm" | Today at 19:00 local time |
| "tomorrow at 7:30pm" | Tomorrow at 19:30 |
| "at 19:00" | Today at 19:00 (24-hour) |
| "at 7pm" | If currently past 7pm, should assume tomorrow |
| "today at 2pm" | Today at 14:00 |

**Steps**:
1. For each input, create a reservation with that time
2. In Reservations panel, verify datetime display
3. In Business Client, inspect the `iso_time` field in request payload
4. Confirm ISO 8601 format and correct datetime

**Expected Results**:
- ✅ All common time formats parse correctly
- ✅ ISO 8601 timestamps are accurate
- ✅ Timezone handled correctly

---

### Scenario 10: Concurrent Reservations

**Objective**: Test handling multiple simultaneous reservations.

**Steps**:
1. Open AI Concierge in two different browser windows (or incognito)
2. In Window 1: Start reservation for Restaurant A
3. In Window 2: Start reservation for Restaurant B
4. Complete both reservations
5. Send responses from Business Client for both
6. Verify in each window:
   - Both reservations appear in their respective Reservations panels
   - No cross-contamination of messages
   - Each browser has unique `npub` in localStorage

**Expected Results**:
- ✅ Each browser maintains separate identity
- ✅ Messages routed to correct recipients
- ✅ No interference between clients

---

## Verification Checklist

### Message Encryption
- [ ] Messages sent to relay are encrypted (inspect with Nostr client like Snort or Amethyst)
- [ ] Only recipient with correct private key can decrypt
- [ ] Gift wrap uses ephemeral random public key for sender anonymity

### Relay Communication
- [ ] Default relays: `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.nostr.band`
- [ ] Messages published to all configured relays
- [ ] Can override relays with `VITE_NOSTR_RELAYS` env var
- [ ] Subscription persists across page refreshes (unsubscribes on unmount)

### Error Handling
- [ ] Network failures show toast notification
- [ ] Invalid npub handled gracefully
- [ ] Missing restaurant data doesn't crash app
- [ ] Relay connection issues retry automatically

### UI/UX
- [ ] Loading states during message send
- [ ] Toast notifications for success/error
- [ ] Tab navigation between Chat and Reservations
- [ ] Responsive design on mobile
- [ ] Empty state message when no reservations

---

## Debugging Tips

### Check Browser Console
```javascript
// View current Nostr identity
localStorage.getItem('nostr-identity')

// Clear identity to generate new one
localStorage.removeItem('nostr-identity')
// Refresh page
```

### Inspect Relay Messages
Use a Nostr client (e.g., [Snort.social](https://snort.social)) to:
1. Search for your `npub`
2. View kind 1059 events (gift wraps)
3. Confirm encrypted content format

### Business Client Logs
Check console for:
- "New gift wrap received"
- Decryption success/failure
- JSON parse errors

### Common Issues

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| "Restaurant not available" | Missing `npub` in DB | Verify `normalized_pubkeys` contains valid npub |
| Messages not sending | Relay connection failed | Check browser console for WebSocket errors |
| Status not updating | Business client not responding | Verify test harness is running and subscribed |
| Duplicate threads | NIP-10 threading incorrect | Check `root` and `reply` tags in events |

---

## Test Data Setup

### Sample Restaurant Data

Ensure your database includes at least one restaurant with all required fields:

```json
{
  "name": "Mario's Pizza",
  "normalized_pubkeys": [
    "npub1testkey1234567890abcdefghijklmnopqrstuvwxyz123456789abc"
  ],
  "meta_data": {
    "display_name": "Mario's Pizza",
    "address": "123 Main St, Seattle, WA",
    "phone": "(206) 555-1234"
  }
}
```

The `npub` in `normalized_pubkeys` must match the Business Client's public key for testing.

---

## Automated Testing Reference

For automated test coverage, see:
- `frontend/src/components/ReservationsPanel.test.tsx` (13 tests)
- `frontend/src/lib/parseReservationIntent.test.ts` (48 tests)
- `frontend/src/services/reservationMessenger.test.ts` (12 tests)
- `frontend/src/lib/nostr/` (NIP-44, NIP-59, NIP-10 tests)

Total: 187 frontend tests covering all reservation features.

