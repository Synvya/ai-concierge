### Manual test plan: Share my location

Prereqs: Frontend running locally, backend reachable. Clear sessionStorage for a clean run.

Scenarios

1) Idle state
- Load the chat page. The Share location button shows.
- If Geolocation API unsupported, the button is disabled with tooltip.

2) Permission grant
- Click Share location.
- While waiting, the button shows “Sharing…” with spinner.
- On success, a toast appears with coordinates label (e.g., Lat 47.6062°, Lon -122.3321°).
- A “Location on” chip appears next to Send with a close icon.
- Refresh the page in the same tab: the chip persists (sessionStorage cached).

3) Permission denied
- Block permission. Click Share location again.
- Button remains available for retry. A toast appears explaining permission denied.

4) Timeout / error
- Throttle or simulate timeout. Toast shows warning and state returns to idle.

5) Clear location
- Click the close icon on the “Location on” chip.
- Chip disappears, sessionStorage entry is removed, and an info toast appears.

6) Payload attachment
- With location granted, send a message. Inspect network request to `/api/chat`.
- Body includes `user_location` label and `user_coordinates` with latitude/longitude.
- With location cleared, these fields are absent unless provided explicitly.

7) Search helper (optional)
- If using search flows via the shared `search()` helper, confirm it also includes the same fields when cached.

Accessibility & UX
- Tooltip explains sharing and unsupported browsers.
- Button remains available for retries after denied/timeouts.


