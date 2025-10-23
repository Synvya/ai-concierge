# Frontend Configuration

## Environment Variables

The frontend uses Vite's environment variable system. Create a `frontend/.env` file for local development:

```bash
# Backend API URL
# Leave empty for development (will use relative /api path)
# Set to full URL in production (e.g., https://api.snovalley.synvya.com)
VITE_API_BASE_URL=

# Nostr Relay URLs (comma-separated)
# Used for reservation messaging via NIP-59 gift wrap
# Default relays are used if not specified
VITE_NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band
```

## Configuration Details

### `VITE_API_BASE_URL`
- **Purpose**: Base URL for backend API requests
- **Development**: Leave empty (uses relative `/api` paths via Vite proxy)
- **Production**: Set to your backend URL (e.g., `https://api.snovalley.synvya.com`)
- **Default**: Empty string (relative paths)

### `VITE_NOSTR_RELAYS`
- **Purpose**: Comma-separated list of Nostr relay WebSocket URLs for reservation messaging
- **Format**: `wss://relay1.com,wss://relay2.com,wss://relay3.com`
- **Default**: `wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band`
- **Notes**:
  - Must be valid WebSocket URLs starting with `wss://` or `ws://`
  - Multiple relays provide redundancy and faster message propagation
  - Public relays recommended: Damus, nos.lol, relay.nostr.band, eden.nostr.land

## Build-Time vs Runtime

All `VITE_*` variables are **build-time** variables that are:
- Read during `npm run build`
- Inlined into the JavaScript bundle
- Cannot be changed without rebuilding

For runtime configuration, consider using backend-provided configuration endpoints.

## Production Deployment

When deploying to production:

1. Set environment variables in GitHub Actions secrets or deployment config
2. Example GitHub Actions usage:
   ```yaml
   - name: Build frontend
     env:
       VITE_API_BASE_URL: ${{ secrets.BACKEND_API_URL }}
       VITE_NOSTR_RELAYS: wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band
     run: |
       cd frontend
       npm ci
       npm run build
   ```

## Verifying Configuration

### Check Build Output
After building, you can verify environment variables were applied:
```bash
cd frontend
npm run build
grep -r "VITE_" dist/  # Should be replaced with actual values
```

### Check Runtime (Browser Console)
```javascript
// Variables are inlined, so you can inspect the compiled code
// But for debugging, you might add:
console.log('API Base URL:', import.meta.env.VITE_API_BASE_URL)
console.log('Nostr Relays:', import.meta.env.VITE_NOSTR_RELAYS)
```

## Relay Selection Best Practices

### Recommended Public Relays
- **wss://relay.damus.io** - Popular, reliable, good uptime
- **wss://nos.lol** - Community-run, open relay
- **wss://relay.nostr.band** - High-performance aggregator
- **wss://eden.nostr.land** - EU-based relay
- **wss://relay.snort.social** - Large user base

### Custom Relay Setup
If running your own relay:
1. Add your relay URL to the comma-separated list
2. Ensure WebSocket connections are allowed (CORS/firewall)
3. Test connectivity: `websocat wss://your-relay.com`

### Testing Relay Connectivity
```bash
# Test WebSocket connection
websocat wss://relay.damus.io

# Or use browser console
const ws = new WebSocket('wss://relay.damus.io')
ws.onopen = () => console.log('Connected')
ws.onerror = (e) => console.error('Error', e)
```

## Troubleshooting

### Issue: Reservations Not Sending
**Check**:
1. Browser console for WebSocket errors
2. Verify relay URLs are valid and accessible
3. Check network tab for failed WebSocket connections
4. Ensure restaurants have valid `npub` in database

### Issue: Messages Not Received
**Check**:
1. Business client is subscribed to correct relays
2. Same relays configured on both sides
3. No firewall blocking WebSocket connections
4. Relay is online and accepting connections

### Issue: Build Fails with Environment Variables
**Check**:
1. Variable names start with `VITE_` prefix
2. No spaces around `=` in `.env` file
3. Values are properly quoted if they contain special characters
4. `.env` file is in `frontend/` directory (not project root)

