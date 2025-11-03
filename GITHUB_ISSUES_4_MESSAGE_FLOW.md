# GitHub Issues for 4-Message Reservation Flow Implementation

This document contains 11 PR-sized issues for implementing the 4-message reservation flow on the AI Concierge (customer) side.

## Issue List

### 1. Add JSON schemas for reservation modification messages (kinds 9903 and 9904)

**Labels**: `enhancement`, `reservation-system`

**Overview**: Create JSON schemas for the two new reservation modification message types as part of the 4-message flow implementation.

**Tasks**:
- [ ] Create `docs/schemas/reservation.modification.request.schema.json` for kind 9903
  - Required fields: `iso_time`, `message`
  - Optional fields: `original_iso_time`
- [ ] Create `docs/schemas/reservation.modification.response.schema.json` for kind 9904
  - Required fields: `status` (enum: "accepted", "declined")
  - Required when accepted: `iso_time`
  - Optional: `message`
- [ ] Add schema validation examples in `docs/schemas/examples/`
  - `reservation.modification.request.example.json`
  - `reservation.modification.response.accepted.example.json`
  - `reservation.modification.response.declined.example.json`
- [ ] Update `docs/schemas/README.md` to document new schemas

**Acceptance Criteria**:
- [ ] Schemas validate correctly with AJV
- [ ] Examples match schema definitions
- [ ] Documentation updated

---

### 2. Add TypeScript types for reservation modification messages

**Labels**: `enhancement`, `reservation-system`, `frontend`

**Overview**: Add TypeScript type definitions for reservation modification request (9903) and response (9904) messages.

**Tasks**:
- [ ] Add `ReservationModificationRequest` interface to `frontend/src/types/reservation.ts`
  ```typescript
  interface ReservationModificationRequest {
    iso_time: string;
    message: string;
    original_iso_time?: string;
  }
  ```
- [ ] Add `ReservationModificationResponse` interface
  ```typescript
  interface ReservationModificationResponse {
    status: 'accepted' | 'declined';
    iso_time?: string; // required if status is 'accepted'
    message?: string;
  }
  ```
- [ ] Update `ReservationMessage` type to include modification types
- [ ] Export new types for use across frontend

**Acceptance Criteria**:
- [ ] Types match JSON schemas
- [ ] Types are exported and importable
- [ ] No breaking changes to existing types

---

### 3. Add parser and validator for reservation modification request (kind 9903)

**Labels**: `enhancement`, `reservation-system`, `frontend`

**Overview**: Add functions to parse and validate incoming reservation modification requests (kind 9903) in the frontend.

**Tasks**:
- [ ] Add `parseReservationModificationRequest()` function to `frontend/src/lib/nostr/reservationEvents.ts`
  - Decrypts NIP-44 encrypted content
  - Validates against JSON schema
  - Returns `ReservationModificationRequest`
- [ ] Add `validateReservationModificationRequest()` function
  - Uses AJV with the new schema
  - Returns `ValidationResult`
- [ ] Update `reservationMessenger.ts` to handle kind 9903
  - Add case in `handleEvent()` method
  - Parse modification request and call `onMessage` callback with type `"modification_request"`

**Files to Modify**:
- `frontend/src/lib/nostr/reservationEvents.ts`
- `frontend/src/services/reservationMessenger.ts`
- `frontend/src/types/reservation.ts` (update `ReservationMessage` type)

**Acceptance Criteria**:
- [ ] Parser decrypts and validates kind 9903 messages
- [ ] Valid messages are passed to subscription callback
- [ ] Invalid messages throw descriptive errors
- [ ] Unit tests added for parser and validator

---

### 4. Add builder function for reservation modification response (kind 9904)

**Labels**: `enhancement`, `reservation-system`, `frontend`

**Overview**: Add function to build and encrypt reservation modification response messages (kind 9904) when customer accepts or declines a modification suggestion.

**Tasks**:
- [ ] Add `buildReservationModificationResponse()` function to `frontend/src/lib/nostr/reservationEvents.ts`
  - Takes `ReservationModificationResponse` payload
  - Validates payload against JSON schema
  - Encrypts with NIP-44
  - Returns `EventTemplate` ready for wrapping
- [ ] Function signature:
  ```typescript
  buildReservationModificationResponse(
    response: ReservationModificationResponse,
    senderPrivateKey: string,
    recipientPublicKey: string,
    additionalTags: string[][] = []
  ): EventTemplate
  ```
- [ ] Include thread linking tags (NIP-10):
  - Reference original request (root)
  - Reference modification request (reply/reply-to-root)

**Files to Modify**:
- `frontend/src/lib/nostr/reservationEvents.ts`

**Acceptance Criteria**:
- [ ] Builder creates valid kind 9904 event templates
- [ ] Payload is properly encrypted
- [ ] Thread tags are correctly added
- [ ] Validation errors are thrown for invalid payloads
- [ ] Unit tests added

---

### 5. Update ReservationContext to handle modification requests and responses

**Labels**: `enhancement`, `reservation-system`, `frontend`

**Overview**: Update `ReservationContext` to properly track and manage modification requests (9903) and handle modification responses (9904) in the thread state.

**Tasks**:
- [ ] Update `ReservationThread` interface:
  - Change `status` to include `'modification_requested'`
  - Add `modificationRequest?: ReservationModificationRequest`
  - Remove `suggestedTime` (replaced by modification request)
- [ ] Update `updateThreadWithMessage()` function:
  - Handle `type: "modification_request"` messages
  - Set thread status to `'modification_requested'`
  - Store modification request details
- [ ] Update `ReservationMessage` type to include modification types
- [ ] Ensure thread linking works correctly:
  - Modification requests link to original request (root)
  - Modification responses link to modification request (reply)

**Files to Modify**:
- `frontend/src/contexts/ReservationContext.tsx`
- `frontend/src/types/reservation.ts`

**Acceptance Criteria**:
- [ ] Modification requests are stored in thread state
- [ ] Thread status updates correctly when modification received
- [ ] Thread history shows modification request messages
- [ ] No breaking changes to existing confirmed/declined flows

---

### 6. Update ChatPanel to send modification responses when user accepts suggestions

**Labels**: `enhancement`, `reservation-system`, `frontend`

**Overview**: Update `ChatPanel` component to detect when user accepts a modification suggestion and send a modification response (kind 9904) instead of a new reservation request.

**Tasks**:
- [ ] Update `buildActiveContextForSuggestionAcceptance()` function:
  - Rename to `buildActiveContextForModificationAcceptance()`
  - Update to work with modification requests instead of suggested responses
  - Check for threads with `status: 'modification_requested'`
- [ ] Update `handleChatResponse()` to detect modification acceptance:
  - When assistant calls `send_reservation_request` with `thread_id` pointing to modification request
  - Send modification response (9904) instead of new request (9901)
- [ ] Add `sendModificationResponse()` function:
  - Builds modification response event (9904)
  - Wraps with NIP-59 gift wrap
  - Publishes to relays
  - Updates thread state
- [ ] Update assistant prompt/context to use modification response terminology

**Files to Modify**:
- `frontend/src/components/ChatPanel.tsx`
- `frontend/src/services/reservationMessenger.ts` (if needed for sending)

**Acceptance Criteria**:
- [ ] User acceptance of modification sends kind 9904, not 9901
- [ ] Thread linking maintains conversation history
- [ ] UI shows modification acceptance in chat
- [ ] Reservation thread updates correctly

---

### 7. Remove suggested status handling from reservation response flow

**Labels**: `enhancement`, `reservation-system`, `frontend`, `breaking-change`

**Overview**: Remove the `suggested` status from reservation responses (kind 9902) since modifications now use kind 9903. Clean up code that handled suggested status.

**Tasks**:
- [ ] Update `reservation.response.schema.json`:
  - Remove `"suggested"` from status enum
  - Keep: `confirmed`, `declined`, `expired`, `cancelled`
- [ ] Remove `suggestedTime` field from `ReservationThread` interface
- [ ] Remove `suggested` status handling from `ReservationContext.tsx`
- [ ] Update `ReservationsPanel.tsx` to remove suggested status UI
- [ ] Update `ChatPanel.tsx` to remove suggested status detection logic
- [ ] Remove `buildActiveContextForSuggestionAcceptance()` function (replaced by modification handling)

**Files to Modify**:
- `docs/schemas/reservation.response.schema.json`
- `frontend/src/contexts/ReservationContext.tsx`
- `frontend/src/components/ChatPanel.tsx`
- `frontend/src/components/ReservationsPanel.tsx`
- `frontend/src/types/reservation.ts`

**Acceptance Criteria**:
- [ ] No code references `suggested` status
- [ ] Schema no longer includes `suggested` enum value
- [ ] All tests updated/removed for suggested status
- [ ] UI components updated to use modification request flow

---

### 8. Update backend assistant to handle modification acceptance flow

**Labels**: `enhancement`, `reservation-system`, `backend`

**Overview**: Update the backend assistant service to generate modification responses (kind 9904) when user accepts a modification suggestion, instead of sending a new reservation request.

**Tasks**:
- [ ] Update `assistant.py` system prompt:
  - Remove instructions for handling `suggested` status
  - Add instructions for handling `modification_requested` status
  - Add function calling for `send_modification_response` action
- [ ] Add `ModificationResponseAction` schema to `schemas.py`:
  ```python
  class ModificationResponseAction(BaseModel):
      action: str = "send_modification_response"
      restaurant_id: str
      restaurant_name: str
      npub: str
      status: str = Field(enum=["accepted", "declined"])
      iso_time: str  # required if accepted
      thread_id: str  # modification request thread ID
  ```
- [ ] Update `ActiveReservationContext`:
  - Change from `suggested_time` to `modification_request`
  - Include modification request details
- [ ] Update function calling logic to handle modification responses
- [ ] Update response generation to return modification response action

**Files to Modify**:
- `backend/app/services/assistant.py`
- `backend/app/schemas.py`
- `backend/app/api/chat.py` (if needed)

**Acceptance Criteria**:
- [ ] Assistant detects modification acceptance in user messages
- [ ] Assistant calls `send_modification_response` function
- [ ] Function returns proper action for frontend to handle
- [ ] No new reservation requests sent for modification acceptance

---

### 9. Add UI components for displaying modification requests

**Labels**: `enhancement`, `reservation-system`, `frontend`, `ui`

**Overview**: Add UI components to display modification requests (kind 9903) in the ReservationsPanel and ChatPanel, showing the restaurant's suggested alternative time.

**Tasks**:
- [ ] Update `ReservationsPanel.tsx`:
  - Add visual indicator for `modification_requested` status
  - Display modification request details (suggested time, message)
  - Show action buttons: "Accept" / "Decline"
- [ ] Add modification request message component:
  - Shows restaurant name
  - Displays original requested time vs. suggested time
  - Shows restaurant's message
  - Styled differently from regular responses
- [ ] Update chat message rendering:
  - Show modification requests as special message type
  - Format time comparison clearly
- [ ] Add "Accept Modification" quick action button in thread card

**Files to Modify**:
- `frontend/src/components/ReservationsPanel.tsx`
- `frontend/src/components/ChatPanel.tsx`
- `frontend/src/components/ThreadCard.tsx` (if exists)

**Acceptance Criteria**:
- [ ] Modification requests are visually distinct
- [ ] Original and suggested times are clearly displayed
- [ ] User can easily accept/decline from UI
- [ ] Chat shows modification request messages

---

### 10. Update NIP-89 discovery to support modification message kinds

**Labels**: `enhancement`, `reservation-system`, `documentation`

**Overview**: Update NIP-89 discovery logic to detect and advertise support for reservation modification messages (kinds 9903 and 9904).

**Tasks**:
- [ ] Update `nip89-integration.md` documentation:
  - Document kind 9903 handler recommendation
  - Document kind 9904 handler recommendation
  - Update restaurant setup instructions
- [ ] Update backend discovery query (if needed):
  - Query for kind 31989 events with `d:9903` and `d:9904`
  - Store modification support flags
- [ ] Update `SellerResult` schema if needed to include modification support flags
- [ ] Update frontend to check for modification support before sending modification responses

**Files to Modify**:
- `docs/nip89-integration.md`
- `docs/restaurants/nip89-integration.md`
- `backend/app/services/assistant.py` (if discovery logic needs updates)
- `backend/app/schemas.py` (if SellerResult needs updates)

**Acceptance Criteria**:
- [ ] Documentation updated with new kind numbers
- [ ] Discovery can detect restaurants supporting modifications
- [ ] Frontend checks modification support before sending responses

---

### 11. Add unit tests for reservation modification flow

**Labels**: `enhancement`, `reservation-system`, `testing`

**Overview**: Add comprehensive unit tests for the new modification request and response functionality. **Note**: Basic unit tests should be included in each implementation PR (Issues 1-10). This issue focuses on integration tests, edge cases, and comprehensive coverage.

**Tasks**:
- [ ] Add integration tests for full modification flow:
  - Customer receives modification request → accepts → sends response
  - Customer receives modification request → declines → sends response
  - End-to-end flow with relay interaction
- [ ] Add tests for `parseReservationModificationRequest()` edge cases:
  - Invalid payload handling
  - Decryption errors
  - Missing required fields
- [ ] Add tests for `buildReservationModificationResponse()` edge cases:
  - Missing iso_time when status is "accepted"
  - Invalid thread tag scenarios
- [ ] Add tests for `ReservationContext` modification handling edge cases:
  - Thread state updates on modification request
  - Modification response sending
  - Thread linking correctness
  - Concurrent modifications
- [ ] Add tests for `ChatPanel` modification acceptance edge cases:
  - Detection of user acceptance with various phrasings
  - Sending modification response with invalid data
  - Context building edge cases
- [ ] Update existing tests that reference `suggested` status:
  - Remove `suggested` status tests
  - Update tests to use modification flow
  - Fix broken tests from refactoring
- [ ] Run test coverage analysis:
  - Ensure all new code paths are covered
  - Fill any coverage gaps

**Files to Create/Modify**:
- `frontend/src/lib/nostr/reservationEvents.test.ts` (or similar)
- `frontend/src/contexts/ReservationContext.test.tsx`
- `frontend/src/components/ChatPanel.acceptance.test.ts`
- Update existing test files
- Integration test files (if separate)

**Acceptance Criteria**:
- [ ] All new functions have comprehensive test coverage
- [ ] Edge cases covered (missing fields, invalid data, error scenarios)
- [ ] Integration tests for full modification flow pass
- [ ] All existing tests updated and passing
- [ ] Test coverage meets project standards (e.g., >80%)
- [ ] Tests pass consistently across CI/CD

**Note**: This issue complements the unit tests written in Issues 1-10. Focus on integration scenarios and comprehensive edge case coverage.

---

### 12. Update reservation flow documentation for 4-message system

**Labels**: `enhancement`, `reservation-system`, `documentation`

**Overview**: Update all documentation to reflect the new 4-message reservation flow, removing references to the old 2-message flow with suggested status.

**Tasks**:
- [ ] Update `RESERVATION_REQUEST_FORMAT.md`:
  - Remove references to `suggested` status
  - Add note about modification flow
- [ ] Update `RESTAURANT_RESPONSE_FORMAT.md`:
  - Remove `suggested` status documentation
  - Update response status values
- [ ] Create `RESERVATION_MODIFICATION_FORMAT.md`:
  - Document kind 9903 (modification request)
  - Document kind 9904 (modification response)
  - Include examples and implementation guide
- [ ] Update `KIND_9901_FORMAT.md`:
  - Update to reflect 4-message flow
  - Remove suggested status references
- [ ] Update `TESTING_RESERVATIONS.md`:
  - Replace suggested status test scenarios with modification flow tests
  - Update manual testing steps
- [ ] Update `RESERVATION_FIXES_2025-10-31.md` if needed

**Files to Modify**:
- `docs/RESERVATION_REQUEST_FORMAT.md`
- `docs/RESTAURANT_RESPONSE_FORMAT.md`
- `docs/KIND_9901_FORMAT.md`
- `docs/TESTING_RESERVATIONS.md`
- Create `docs/RESERVATION_MODIFICATION_FORMAT.md`

**Acceptance Criteria**:
- [ ] All documentation reflects 4-message flow
- [ ] No references to `suggested` status remain
- [ ] Examples updated with new message types
- [ ] Implementation guides are clear

---

## Implementation Order

Recommended order for implementing these issues:

1. **Issue 1**: Schemas (foundation)
2. **Issue 2**: TypeScript types (depends on schemas)
3. **Issue 3**: Parser for 9903 (receiving modifications)
4. **Issue 4**: Builder for 9904 (sending modifications)
5. **Issue 5**: ReservationContext updates (state management)
6. **Issue 8**: Backend assistant updates (conversation logic)
7. **Issue 6**: ChatPanel updates (user interaction)
8. **Issue 7**: Remove suggested status (cleanup)
9. **Issue 9**: UI components (visual feedback)
10. **Issue 10**: NIP-89 discovery (restaurant detection)
11. **Issue 11**: Tests (validation)
12. **Issue 12**: Documentation (completion)

## Notes

- Issues can be implemented in parallel where dependencies allow (e.g., Issues 1 and 2 can be done together)
- Issue 7 (removing suggested status) should be done after Issues 3-6 are complete
- **Issue 11 (tests)**: Two approaches are possible:
  - **Option A (Recommended)**: Write tests as part of each implementation PR (Issues 1-10). Issue 11 then focuses on integration/E2E tests and test coverage gaps.
  - **Option B**: Write basic unit tests in each PR, but Issue 11 provides comprehensive test coverage for the entire modification flow including edge cases and integration scenarios.
- Issue 12 (documentation) should be updated incrementally as features are implemented

## Testing Strategy Clarification

**What "alongside implementation" means:**

Each implementation PR (Issues 1-10) should include:
- Unit tests for the specific functions/features added in that PR
- Basic validation that the feature works in isolation

**Issue 11 should focus on:**
- Integration tests for the full modification flow (end-to-end)
- Edge cases and error scenarios
- Updating/fixing tests that reference the old `suggested` status
- Test coverage analysis and filling gaps
- Integration with existing test suites

This ensures:
- ✅ Tests are written close to when code is written (better test quality)
- ✅ Each PR is testable and validated independently
- ✅ Comprehensive coverage is ensured through Issue 11
- ✅ No "big bang" testing at the end

