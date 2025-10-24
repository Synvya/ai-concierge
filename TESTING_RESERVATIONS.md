# Testing Reservation Notifications - Manual Test Guide

## Prerequisites

1. **Backend running**: `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000`
2. **Frontend running**: `cd frontend && npm run dev`
3. **Browser**: Open `http://localhost:5173`

## Test Scenario 1: Send a Reservation Request

### Steps:
1. Open the chat interface at `http://localhost:5173`
2. Type: `"Book a table for 2 at Smoothies & Muffins tomorrow at 3pm"`
3. Press Send

### Expected Results:
- ✅ Backend detects restaurant supports reservations (NIP-89 discovery)
- ✅ OpenAI calls `send_reservation_request` function
- ✅ Frontend shows: "Reservation request sent to Smoothies & Muffins"
- ✅ Green success toast appears
- ✅ No errors in console

### Check Backend Logs:
```bash
tail -f /tmp/backend-new.log | grep -i "reservation\|nip89"
```

You should see:
- NIP-89 handler discovery for the restaurant's public key
- `supports_reservations: True` in the business context
- OpenAI function call to `send_reservation_request`
- Nostr gift wrap event published to relays

### Check Frontend Console:
- "Reservation request sent successfully"
- No "Buffer is not defined" errors
- No CORS errors
- No authentication errors

---

## Test Scenario 2: Receive a Reservation Response (Simulated)

### Background:
When a restaurant responds to your reservation via Nostr (kind 32102 event), the frontend subscription automatically detects it and shows notifications.

### Notification Types You Should See:

#### 1. **Confirmed Reservation** ✅
- **Toast**: Green success toast at top
- **Title**: "✅ Reservation Confirmed!"
- **Description**: "Your reservation at [Restaurant] has been confirmed for [time]. Table: [number]"
- **Chat**: Automatic message appears in chat with same info

#### 2. **Alternative Time Suggested** 💡
- **Toast**: Blue info toast
- **Title**: "💡 Alternative Time Suggested"
- **Description**: "[Restaurant] suggested [alternative time] instead"
- **Chat**: Shows the suggested time

#### 3. **Declined Reservation** ❌
- **Toast**: Yellow warning toast
- **Title**: "❌ Reservation Declined"
- **Description**: "[Restaurant] could not accommodate your request. [reason]"
- **Chat**: Shows decline reason if provided

#### 4. **Expired Hold** ⏰
- **Toast**: Yellow warning toast
- **Title**: "⏰ Reservation Expired"
- **Description**: "Your hold at [Restaurant] has expired"

#### 5. **Cancelled Reservation** 🚫
- **Toast**: Red error toast
- **Title**: "🚫 Reservation Cancelled"
- **Description**: "Your reservation at [Restaurant] was cancelled"

### How to Test with Real Restaurant:
1. The restaurant needs to publish a kind 32102 Nostr event (reservation response)
2. The event must be a NIP-59 gift wrap addressed to your public key
3. The frontend subscription will automatically detect and display it

---

## Test Scenario 3: Multiple Reservations

### Steps:
1. Send reservation to **Smoothies & Muffins**: `"Book table for 2 at Smoothies tomorrow at 3pm"`
2. Send another to different restaurant (if available): `"Reserve table for 4 at [Other Restaurant] tonight at 7pm"`

### Expected Results:
- ✅ Each reservation gets its own thread
- ✅ Threads are sorted by most recent first
- ✅ Each response shows in correct thread
- ✅ No duplicate notifications

---

## Debugging Tips

### If reservation request doesn't send:
1. **Check OpenAI API Key**: `cat backend/.env | grep OPENAI_API_KEY`
2. **Check Nostr keys**: Console should show "Nostr identity initialized"
3. **Check CORS**: No CORS errors in console
4. **Check restaurant supports reservations**: Backend should log "supports_reservations: True"

### If notifications don't appear:
1. **Check ReservationContext**: Console should show "Reservation messenger ready"
2. **Check subscription**: Look for WebSocket connections to Nostr relays in Network tab
3. **Check gift wrap**: Response must be properly encrypted and addressed to you

### Console Commands for Debugging:
```javascript
// Check if Nostr keys are loaded
localStorage.getItem('nostr-keys')

// Check reservation threads (in React DevTools)
// Look for ReservationContext state

// Check processed responses
// (internal ref, not visible but prevents duplicates)
```

### Backend Debugging:
```bash
# Watch for NIP-89 discovery
tail -f /tmp/backend-new.log | grep "NIP89"

# Watch for OpenAI function calls
tail -f /tmp/backend-new.log | grep "function_call"

# Watch for reservation actions
tail -f /tmp/backend-new.log | grep "reservation_action"
```

---

## Known Limitations

1. **No Reservation History UI**: Threads are tracked in memory but not displayed in a dedicated UI yet
2. **No Manual Restaurant Response Tool**: You'll need a separate app to simulate restaurant responses
3. **Test Environment**: Currently using production Nostr relays (relay.damus.io, nos.lol, relay.nostr.band)

---

## Success Criteria

✅ User can send reservation requests via natural language chat  
✅ Backend correctly identifies restaurants that support reservations  
✅ Frontend sends encrypted Nostr messages (NIP-59 gift wraps)  
✅ Frontend subscription receives and decrypts responses  
✅ Toast notifications appear for all response types  
✅ Chat messages show reservation status  
✅ No duplicate notifications  
✅ No console errors  

---

## Next Steps

After manual testing:
1. Deploy to AWS staging environment
2. Set up GitHub Actions for automated deployment
3. Add reservation history/management UI
4. Add integration tests with mock Nostr relays
5. Monitor production Nostr relay performance

---

## Questions or Issues?

Check:
- Console errors (F12 → Console)
- Network tab (F12 → Network) for failed API calls
- Backend logs: `tail -f /tmp/backend-new.log`
- This summary for flow overview

