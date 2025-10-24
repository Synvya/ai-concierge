# AI Concierge

Modern AI concierge that helps people discover local businesses, products, and services powered by a pgvector database and OpenAI.

Live site: https://snovalley.synvya.com

## Features
- FastAPI backend with OpenAI-powered conversational search and retrieval from PostgreSQL + pgvector.
- React + Chakra UI frontend delivering a modern, responsive chat experience.
- **Natural language reservation messaging** via Nostr protocol (NIP-59 gift wrap) for private, end-to-end encrypted communication with businesses.
- Configurable database connection (host, credentials, schema, table) via environment variables.
- Analytics collection for visitor, session, and query metrics persisted to Amazon S3 (or MinIO locally).
- Docker Compose stack for local development including Postgres and MinIO.
- Automated AWS deployment via GitHub Actions (container image + ECS service update). Infrastructure is managed manually in AWS (see `infra/`).

## Reservation Features (Phase I)

The AI Concierge supports natural language reservation requests using the Nostr protocol for secure, private messaging:

### How It Works
1. **Search for businesses**: "Find Italian restaurants near me"
2. **Natural language booking**: "Book a table for 4 at Mario's Pizza tonight at 7pm"
3. **Interactive follow-up**: If details are missing, the assistant prompts for party size, time, or restaurant name
4. **Encrypted messaging**: Reservation requests are encrypted using NIP-44 and wrapped with NIP-59 gift wrap
5. **Real-time updates**: View all reservations in the Reservations panel, with live status updates from restaurants

### Key Components
- **Browser-based Nostr identity**: Each browser generates and persists an npub/nsec keypair in localStorage
- **NIP-59 Gift Wrap**: End-to-end encrypted direct messages to restaurant public keys
- **Relay network**: Configurable Nostr relays for message delivery (default: Damus, nos.lol, relay.nostr.band)
- **Reservations panel**: Track all your reservation conversations with status badges (sent/confirmed/declined/suggested)

### Requirements
- Restaurants must have a valid Nostr public key (npub) in their business data
- Frontend connects to Nostr relays (configurable via `VITE_NOSTR_RELAYS`)
- Business client (e.g., [synvya-client-2](https://github.com/Synvya/synvya-client-2)) to receive and respond to reservations

See [`docs/manual-testing-reservations.md`](docs/manual-testing-reservations.md) for detailed manual testing procedures.

## Prerequisites
- Python 3.11+
- Node.js 20+
- Docker Desktop (optional but recommended)
- An OpenAI API key

## Quick Start

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 1. Run locally with Docker Compose
```bash
docker-compose up --build
```
- Backend: http://localhost:8000/docs
- Frontend: http://localhost:5173
- MinIO Console: http://localhost:9001 (user/pass: `minioadmin` / `minioadmin`)
- Create the `concierge-analytics-local` bucket in MinIO before issuing queries.

### 2. Seed the sample database
```bash
python scripts/load_sample_data.py
```
This imports `internal/sample_database.txt` into the configured schema/table.
To surface product listings in the UI, also load your kind `30402` (NIP-99 Classified Listing) events into the table referenced by `DB_LISTINGS_TABLE` (defaults to `nostr.classified_listings`).

### 3. Run services without Docker (optional)
```bash
# Backend
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd ../frontend
npm install
npm run dev
```

## Analytics Pipeline
- Each browser gets a persistent `visitor_id` and per-session `session_id`.
- Visitor and session counters are maintained in memory during a request window.
- Aggregated payloads (unique visitors, sessions, query count, and raw queries) are pushed to S3 as JSON (`analytics/daily/<date>/<session_id>.json`).
- In local mode the backend writes to MinIO using the same AWS SDK calls.

## Configuration

### Backend Environment Variables
| Variable | Description |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection details |
| `DB_SCHEMA`, `DB_TABLE`, `DB_LISTINGS_TABLE` | Schema/tables to query for business and product data |
| `LISTINGS_PER_SELLER` | Maximum number of listings to include in responses |
| `OPENAI_API_KEY` | Used for embeddings and chat completions |
| `OPENAI_ASSISTANT_MODEL`, `OPENAI_EMBEDDING_MODEL` | OpenAI model overrides |
| `S3_ANALYTICS_BUCKET`, `S3_REGION` | Target bucket and AWS region for analytics |
| `AWS_ENDPOINT_URL` | Optional S3-compatible endpoint (use MinIO locally) |
| `FRONTEND_BASE_URL` | Origin allowed by CORS (set to https://snovalley.synvya.com in production) |
| `NOSTR_RELAYS` | Comma-separated Nostr relay URLs for NIP-89 handler discovery (default: `wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band`) |
| `NIP89_CACHE_TTL` | NIP-89 handler discovery cache TTL in seconds (default: 300) |
| `NOSTR_CONNECTION_TIMEOUT` | WebSocket connection timeout in seconds (default: 5) |
| `NOSTR_QUERY_TIMEOUT` | Relay query timeout in seconds (default: 3) |

### Frontend Environment Variables
| Variable | Description | Default |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Backend API URL (leave empty for relative /api path in dev) | *(empty)* |
| `VITE_NOSTR_RELAYS` | Comma-separated Nostr relay URLs for reservation messaging | `wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band` |

## Testing
```bash
cd backend
python -m pytest
```

## Project Structure
```
backend/   FastAPI service, analytics, OpenAI integration
frontend/  Vite + React frontend
infra/     Deployment docs and scripts for the GitHub Actions pipeline
internal/  Sample database export for local testing
docs/      Architecture and planning docs
scripts/   Utility scripts (database seeding)
```

## Deployment
Deployment docs and helper scripts live in [`infra/`](infra/README.md).
GitHub Actions builds the backend image, registers a new ECS task definition, forces the service to deploy it, and syncs the frontend bundle to the S3 website bucket. Provisioning or modifying AWS infrastructure (ECS cluster, load balancer, IAM roles, etc.) is now a manual task performed outside the repository.

### Required GitHub Secrets

- `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, and either access keys or an OIDC trust so the workflow can call AWS.
- `BACKEND_ENV_JSON` and `BACKEND_SECRET_JSON` for backend configuration.
- `BACKEND_ENV_JSON` should include `FRONTEND_BASE_URL=https://snovalley.synvya.com` so CORS permits the production site.
- `BACKEND_API_URL` – public URL of the FastAPI service, injected into the frontend build as `VITE_API_BASE_URL`.
