# Contact Information in Reservation Requests - Implementation Guide

**Date:** October 31, 2025  
**Applies to:** kind:9901 (Reservation Requests)  
**Audience:** Restaurant Reservation System Implementers

---

## 🎯 Overview

Reservation requests (kind:9901) now include **optional contact information** (guest name and phone number) to improve communication between restaurants and guests.

### What Changed

**NEW FIELDS:**
- `contact.name` - Guest's full name
- `contact.phone` - Guest's phone number  
- `contact.email` - Guest's email (optional, reserved for future use)

### Backward Compatibility

✅ **All contact fields are optional**  
✅ **Existing implementations continue to work**  
✅ **Your system must handle requests both WITH and WITHOUT contact information**

---

## 📋 Updated Request Format

### Complete Example with Contact Info

```json
{
  "party_size": 2,
  "iso_time": "2025-10-30T19:00:00-07:00",
  "notes": "Window seat if possible",
  "contact": {
    "name": "Alejandro Martinez",
    "phone": "+1-555-0100"
  },
  "constraints": {
    "earliest_iso_time": "2025-10-30T18:30:00-07:00",
    "latest_iso_time": "2025-10-30T20:00:00-07:00",
    "outdoor_ok": true,
    "accessibility_required": false
  }
}
```

### Minimal Example (No Contact Info)

```json
{
  "party_size": 4,
  "iso_time": "2025-11-15T18:00:00-08:00"
}
```

Both formats are valid and your system must accept both.

---

## 🔧 Implementation Requirements

### 1. Parse Contact Information (If Present)

```typescript
// After unwrapping and decrypting the kind:9901 event
const request = JSON.parse(decryptedContent);

// Check for contact information
if (request.contact) {
  const guestName = request.contact.name;    // e.g., "Alejandro Martinez"
  const guestPhone = request.contact.phone;  // e.g., "+1-555-0100"
  
  // Store for your records
  console.log(`Guest: ${guestName}, Phone: ${guestPhone}`);
}
```

### 2. Handle Missing Contact Information

```typescript
if (!request.contact || !request.contact.phone) {
  // No contact info provided
  // Still process the reservation normally
  // You can include a message in your response asking for contact details
}
```

### 3. Updated JSON Schema Validation

If you're using JSON schema validation, update your schema to include:

```json
{
  "contact": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "maxLength": 200
      },
      "phone": {
        "type": "string",
        "maxLength": 64
      },
      "email": {
        "type": "string",
        "format": "email"
      }
    }
  }
}
```

**Note:** All fields within `contact` are optional. The `contact` object itself is also optional.

---

## 💡 Use Cases for Contact Information

### ✅ Direct Communication

When you have contact information:

```typescript
// Example: Need to confirm special dietary restrictions
if (request.notes?.includes("allergies") && request.contact?.phone) {
  // Call the guest at request.contact.phone to clarify
  await callGuest(request.contact.phone, request.contact.name);
  
  // Then respond with confirmation
  const response = {
    status: "confirmed",
    iso_time: request.iso_time,
    message: `Thanks ${request.contact.name}! We've noted your dietary requirements.`,
    table: "A12"
  };
}
```

### ✅ Personalized Responses

```typescript
const response = {
  status: "confirmed",
  iso_time: request.iso_time,
  message: request.contact?.name 
    ? `Welcome ${request.contact.name}! Your table for ${request.party_size} is confirmed.`
    : `Your table for ${request.party_size} is confirmed.`,
  table: "B5"
};
```

### ✅ Last-Minute Changes

```typescript
// Emergency situation - need to contact guest
if (powerOutage && request.contact?.phone) {
  await notifyGuest(request.contact.phone, "We need to reschedule due to an emergency");
  
  const response = {
    status: "cancelled",
    message: "We apologize - unexpected closure. We called you to reschedule."
  };
}
```

### ✅ Missing Information Flow

```typescript
// No contact info provided
if (!request.contact?.phone) {
  const response = {
    status: "confirmed",
    iso_time: request.iso_time,
    message: "Reservation confirmed! Please provide a phone number when you arrive so we can text you when your table is ready.",
    table: "C8"
  };
}
```

---

## 🔒 Privacy & Security Requirements

### ⚠️ Important Guidelines

1. **Storage:**
   - Store contact information securely
   - Comply with GDPR, CCPA, and local privacy laws
   - Only keep contact info as long as needed for the reservation

2. **Encryption:**
   - Contact info arrives encrypted via NIP-44/NIP-59
   - Never log contact information in plain text
   - Use secure database encryption at rest

3. **Access Control:**
   - Limit access to contact information to authorized staff only
   - Don't share contact info with third parties without consent

4. **Data Retention:**
   - Delete guest contact info after reservation is complete (or after a reasonable period)
   - Implement automatic cleanup for old reservations

### Example: Secure Storage

```typescript
interface ReservationRecord {
  id: string;
  party_size: number;
  iso_time: string;
  notes?: string;
  contact?: {
    name: string;      // Encrypted at rest
    phone: string;     // Encrypted at rest
    email?: string;    // Encrypted at rest
  };
  status: string;
  created_at: number;
  expires_at: number;  // Auto-delete after this timestamp
}

// Auto-cleanup after 30 days
async function cleanupOldReservations() {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  await db.reservations.deleteMany({
    created_at: { $lt: thirtyDaysAgo }
  });
}
```

---

## ✅ Testing Your Implementation

### Test Case 1: Request WITH Contact Info

```json
{
  "kind": 9901,
  "content": "{encrypted: {party_size: 2, iso_time: '...', contact: {name: 'Test User', phone: '+1-555-1234'}}}",
  "tags": [["p", "your_restaurant_pubkey"]]
}
```

**Expected:**
- ✅ Parse contact information successfully
- ✅ Use contact info in your response message
- ✅ Store contact info securely

### Test Case 2: Request WITHOUT Contact Info

```json
{
  "kind": 9901,
  "content": "{encrypted: {party_size: 4, iso_time: '...'}}",
  "tags": [["p", "your_restaurant_pubkey"]]
}
```

**Expected:**
- ✅ Process reservation normally
- ✅ Don't fail due to missing contact field
- ✅ Can still send confirmation response

### Test Case 3: Partial Contact Info

```json
{
  "party_size": 3,
  "iso_time": "2025-11-01T19:00:00-07:00",
  "contact": {
    "name": "Jane Doe"
    // phone is missing
  }
}
```

**Expected:**
- ✅ Accept request with only name
- ✅ Handle missing phone gracefully

---

## 📚 Complete Integration Example

```typescript
import { unwrapEvent } from 'nostr-tools/nip59';
import { nip44 } from 'nostr-tools';

async function handleReservationRequest(giftWrapEvent, restaurantPrivateKey) {
  try {
    // Step 1: Unwrap the gift wrap (kind:1059 → kind:13 → kind:9901)
    const rumor = unwrapEvent(giftWrapEvent, restaurantPrivateKey);
    
    if (rumor.kind !== 9901) {
      console.error('Not a reservation request');
      return;
    }
    
    // Step 2: Decrypt the rumor content
    const decrypted = nip44.decrypt(
      rumor.content,
      restaurantPrivateKey,
      rumor.pubkey
    );
    
    // Step 3: Parse the reservation request
    const request = JSON.parse(decrypted);
    
    // Step 4: Extract contact information (if present)
    const guestName = request.contact?.name || 'Guest';
    const guestPhone = request.contact?.phone || null;
    
    console.log(`📋 Reservation Request:
      Party Size: ${request.party_size}
      Time: ${request.iso_time}
      Guest: ${guestName}
      Phone: ${guestPhone || 'Not provided'}
      Notes: ${request.notes || 'None'}
    `);
    
    // Step 5: Check availability
    const isAvailable = await checkAvailability(
      request.iso_time,
      request.party_size
    );
    
    // Step 6: Build response
    let response;
    if (isAvailable) {
      response = {
        status: "confirmed",
        iso_time: request.iso_time,
        message: `Thank you ${guestName}! Your reservation for ${request.party_size} is confirmed.${
          guestPhone ? ` We have your number on file: ${guestPhone}` : ''
        }`,
        table: await assignTable(request.party_size)
      };
    } else {
      // Suggest alternative time
      const altTime = await findNextAvailableTime(request.iso_time);
      response = {
        status: "suggested",
        iso_time: altTime,
        message: `Hi ${guestName}, we're fully booked at ${request.iso_time}, but ${altTime} is available. Please make a new request if that works.`
      };
    }
    
    // Step 7: Send response (kind:9902)
    await sendReservationResponse(
      response,
      restaurantPrivateKey,
      rumor.pubkey,  // Send back to the original requester
      giftWrapEvent.id  // Thread ID for the response
    );
    
    // Step 8: Store reservation securely
    if (response.status === "confirmed") {
      await storeReservation({
        request,
        response,
        guestContact: request.contact,
        threadId: giftWrapEvent.id
      });
    }
    
  } catch (error) {
    console.error('Failed to process reservation:', error);
  }
}
```

---

## 📞 Migration Checklist

- [ ] Update JSON schema validation to accept `contact` field
- [ ] Update database schema to store contact information (encrypted)
- [ ] Implement secure storage for contact data
- [ ] Add contact info to your reservation records
- [ ] Update response messages to personalize with guest name
- [ ] Implement data retention/cleanup for contact information
- [ ] Test with requests that HAVE contact info
- [ ] Test with requests that DON'T HAVE contact info
- [ ] Update privacy policy to cover contact information storage
- [ ] Train staff on using contact information appropriately

---

## 🆘 Support & Questions

**Full Documentation:**
- [RESERVATION_REQUEST_FORMAT.md](./RESERVATION_REQUEST_FORMAT.md) - Complete kind:9901 specification
- [RESTAURANT_RESPONSE_FORMAT.md](../RESTAURANT_RESPONSE_FORMAT.md) - kind:9902 response format

**JSON Schemas:**
- [reservation.request.schema.json](../schemas/reservation.request.schema.json)
- [reservation.response.schema.json](../schemas/reservation.response.schema.json)

**Protocol Specifications:**
- [NIP-59: Gift Wrap](https://github.com/nostr-protocol/nips/blob/master/59.md)
- [NIP-44: Encryption](https://github.com/nostr-protocol/nips/blob/master/44.md)
- [NIP-17: Private Direct Messages](https://github.com/nostr-protocol/nips/blob/master/17.md)

---

## 🎉 Summary

**What You Need to Do:**
1. ✅ Accept `contact` field in kind:9901 requests (optional)
2. ✅ Handle requests both WITH and WITHOUT contact info
3. ✅ Store contact info securely with encryption
4. ✅ Use contact info for direct communication when needed
5. ✅ Implement data retention policies
6. ✅ Test both scenarios thoroughly

**Benefits:**
- 🎯 Direct communication with guests for clarifications
- 📱 Ability to send SMS notifications (with consent)
- 🆘 Emergency contact for last-minute changes
- ✨ Personalized service experience

**Remember:** The contact information is **optional** - your system must work perfectly with or without it!
