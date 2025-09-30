# AI Concierge

Modern AI concierge that helps people discover local businesses, products, and services powered by a pgvector database and OpenAI.

## Features
- FastAPI backend with OpenAI-powered conversational search and retrieval from PostgreSQL + pgvector.
- React + Chakra UI frontend delivering a modern, responsive chat experience.
- Configurable database connection (host, credentials, schema, table) via environment variables.
- Analytics collection for visitor, session, and query metrics persisted to Amazon S3 (or MinIO locally).
- Docker Compose stack for local development including Postgres, Redis, and MinIO.
- Automated AWS deployment via Terraform and GitHub Actions (see infra section).

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
infra/     Terraform + GitHub Actions (TBD)
internal/  Sample database export for local testing
docs/      Architecture and planning docs
scripts/   Utility scripts (database seeding)
```

## Deployment
Infrastructure as code and CI/CD automation live in [`infra/`](infra/README.md).
GitHub Actions builds containers, syncs the frontend to S3, and applies Terraform to keep AWS resources (ECS, ALB, S3 analytics bucket) in sync.
