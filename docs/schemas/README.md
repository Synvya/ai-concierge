# Synvya Nostr Schema and Example Reference

This directory defines the **Synvya reservation and calendar message schemas**, plus example payloads that conform to the Nostr-based commerce protocol.

The schemas formalize the JSON structure of each payload, enabling validation, linting, and auto-generation of SDK models.

---

## 📚 Directory Structure

```
schemas/
├── examples/
│   ├── reservation.request.example.json
│   ├── reservation.response.suggested.example.json
│   ├── reservation.response.confirmed.example.json
│   ├── reservation.response.declined.example.json
│   ├── calendar.31923.example.json
│   ├── calendar.31924.example.json
│   ├── calendar.31925.rsvp.example.json
│   ├── nostr.rumor.9901.example.json
│   ├── nostr.rumor.9902.example.json
│   ├── nostr.seal.kind13.example.json
│   └── nostr.giftwrap.kind1059.example.json
├── reservation.request.schema.json
├── reservation.response.schema.json
├── calendar.31923.schema.json
├── calendar.31924.schema.json
├── calendar.31925.schema.json
├── nostr.rumor.schema.json
├── nostr.seal.kind13.schema.json
└── nostr.giftwrap.kind1059.schema.json
```

---

## 🧩 Schema Overview

| Schema File | Purpose |
|--------------|----------|
| `reservation.request.schema.json` | Defines user → restaurant booking request |
| `reservation.response.schema.json` | Defines restaurant → user negotiation replies |
| `calendar.31923.schema.json` | NIP-52 Time-Based Calendar Event |
| `calendar.31924.schema.json` | Restaurant or user calendar definition |
| `calendar.31925.schema.json` | RSVP confirmation payload |
| `nostr.rumor.schema.json` | Unsigned Nostr event with encrypted payload |
| `nostr.seal.kind13.schema.json` | NIP-59 Seal wrapper for rumors |
| `nostr.giftwrap.kind1059.schema.json` | NIP-59 Gift Wrap event (final encrypted envelope) |

---

## 🔒 Validation Stack

All inter-party communications follow this wrapping sequence:

```
Rumor (unsigned event)
   ↓
Seal (kind 13)
   ↓
Gift Wrap (kind 1059)
```

Each level can be validated independently using the schemas above.

---

## ✅ How to Validate

### CLI Validation

You can validate any example against its schema using a JSON Schema validator (e.g. `ajv-cli` or `python-jsonschema`):

#### Using `ajv-cli` (Node.js)
```bash
npx ajv validate -s reservation.request.schema.json -d examples/reservation.request.example.json
```

#### Using Python
```bash
python -m jsonschema -i examples/reservation.response.suggested.example.json reservation.response.schema.json
```

All provided examples should pass validation successfully.

### Programmatic Validation (TypeScript)

The business client implements validation using `ajv` and `ajv-formats`:

```typescript
import Ajv from "ajv";
import addFormats from "ajv-formats";
import requestSchema from "./reservation.request.schema.json";
import responseSchema from "./reservation.response.schema.json";

// Initialize AJV with format support (for date-time validation)
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Compile schemas
const validateRequest = ajv.compile(requestSchema);
const validateResponse = ajv.compile(responseSchema);

// Validate a request
const requestPayload = {
  party_size: 2,
  iso_time: "2025-10-20T19:00:00-07:00",
  notes: "Window seat please"
};

const isValid = validateRequest(requestPayload);
if (!isValid) {
  console.error("Validation errors:", validateRequest.errors);
  // Errors include: field path, message, and failing value
}

// Validate a response
const responsePayload = {
  status: "confirmed",
  iso_time: "2025-10-20T19:00:00-07:00",
  message: "See you then!"
};

if (validateResponse(responsePayload)) {
  console.log("Valid response!");
}
```

**Full Implementation:**  
See `client/src/lib/reservationEvents.ts` for complete validation, encryption, and parsing logic.

**Key Features:**
- Type-safe validation with detailed error messages
- Date-time format validation via `ajv-formats`
- Automatic schema compilation at module load
- Integration with NIP-44 encryption for payload security

---

## 🧠 Design Notes

- All payloads are **NIP-44 encrypted** before embedding in `content`.
- All inter-party messages **must** use **NIP-59 Gift Wrap** for privacy.
- **Replaceable events** follow **NIP-01** and use `a` tags, not deprecated `d` tags.
- **Threading** (root/reply) follows **NIP-10**.
- Light **Proof of Work (NIP-13)** is recommended for anti-spam.

---

## 🪴 Extending the Model

To introduce new message types (e.g., `order.request`, `order.response`):

1. Assign a kind in the 32200–32299 range.
2. Create a new JSON Schema in `/schemas/`.
3. Include a valid example in `/schemas/examples/`.
4. Update `README.md` and your SDK registry.

---

## 🧾 License

© 2025 Synvya, Inc. — Schemas released under the MIT License.
