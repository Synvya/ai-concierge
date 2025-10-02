# AI Concierge

Modern AI concierge that helps people discover local businesses, products, and services powered by a pgvector database and OpenAI.

## Features
- FastAPI backend with OpenAI-powered conversational search and retrieval from PostgreSQL + pgvector.
- React + Chakra UI frontend delivering a modern, responsive chat experience.
- Configurable database connection (host, credentials, schema, table) via environment variables.
- Analytics collection for visitor, session, and query metrics persisted to Amazon S3 (or MinIO locally).
- Docker Compose stack for local development including Postgres, Redis, and MinIO.
- Automated AWS deployment via GitHub Actions (container image + ECS service update). Infrastructure is managed manually in AWS (see `infra/`).

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
- Every chat query increments counters in Redis for daily visitor/session counts and per-session queries.
- Aggregated payloads (unique visitors, sessions, query count, and raw queries) are pushed to S3 as JSON (`analytics/daily/<date>/<session_id>.json`).
- In local mode the backend writes to MinIO using the same AWS SDK calls.

## Configuration
| Variable | Description |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection details |
| `DB_SCHEMA`, `DB_TABLE` | Schema/table to query for business data |
| `OPENAI_API_KEY` | Used for embeddings and chat completions |
| `OPENAI_ASSISTANT_MODEL`, `OPENAI_EMBEDDING_MODEL` | OpenAI model overrides |
| `S3_ANALYTICS_BUCKET`, `S3_REGION` | Target bucket and AWS region for analytics |
| `AWS_ENDPOINT_URL` | Optional S3-compatible endpoint (use MinIO locally) |
| `REDIS_URL` | Redis instance for tracking analytics state |

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
- `BACKEND_API_URL` – public URL of the FastAPI service, injected into the frontend build as `VITE_API_BASE_URL`.
