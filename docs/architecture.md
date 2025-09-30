# AI Concierge Architecture

## Overview
The AI Concierge is a full-stack application that helps users discover local businesses using natural language. It consists of a FastAPI backend that orchestrates vector search and LLM responses, and a React (Vite) frontend delivering a modern conversational UI. The system runs locally with Docker Compose and deploys to AWS through automated GitHub Actions workflows.

## Components
- **Backend (`backend/`)**
  - FastAPI application exposing REST endpoints for chat, search results, and analytics beacons.
  - Integrates with a configurable PostgreSQL + pgvector database using SQLAlchemy.
  - Uses OpenAI Assistants API for response generation and structured tool calls.
  - Maintains session state and query history in Redis (local) / ElastiCache (AWS) to estimate unique visitors and sessions.
  - Emits analytics events to Amazon S3 via an asynchronous background task queue.

- **Frontend (`frontend/`)**
  - React (Vite + TypeScript) single-page app with a chat-style UI and search result cards.
  - Uses modern component library (Chakra UI) for styling and responsive layout.
  - Communicates with backend via REST and Server-Sent Events for streaming assistant responses.

- **Infrastructure (`infra/`)**
  - Dockerfiles for both backend and frontend, plus `docker-compose.yaml` for local development.
  - GitHub Actions workflow to build, test, and containerize both services.
  - Terraform stack provisioning AWS resources: ECS Fargate service (backend), S3 bucket (analytics), CloudFront + S3 static hosting (frontend), Secrets Manager (configuration), and optional ElastiCache.

## Data & Configuration
- Database connection parameters (username, password, host, database, schema, table) are injected through environment variables and surfaced via `settings.py`.
- OpenAI API key is required for inference, stored in `.env` locally and Secrets Manager in AWS.
- Analytics S3 bucket name and region configurable; events are uploaded as newline-delimited JSON.

## Analytics Flow
1. Frontend tags each visitor with UUID stored in localStorage and calls `/analytics/visit`.
2. Backend deduplicates visitors using Redis and writes a JSON record per visitor/day to S3.
3. Each chat session obtains a session UUID; queries within session are buffered and flushed to S3 on completion.
4. No assistant responses are persisted; only queries and aggregate counts are stored.

## Deployment Pipeline
1. GitHub Actions workflow triggers on pushes to `main`.
2. Lint & test jobs for backend and frontend.
3. Build and push Docker images to ECR.
4. Run Terraform plan & apply (with manual approval) to deploy infrastructure and update services.
5. Frontend build artifacts uploaded to S3 and CloudFront cache invalidated.

## Local Development
- `docker-compose up` starts backend, frontend, local Postgres (with pgvector extension), and MinIO (S3-compatible) for analytics testing.
- Seed script imports the sample database dump into Postgres.
- `.env.example` covers required environment variables for both frontend and backend.

## Security & Compliance
- Secrets are handled through environment variables; none are committed to source control.
- CORS configured to restrict origins in production.
- Rate limiting and request validation enforced on API endpoints.

## Future Enhancements
- Add RAG evaluation harness for ranking quality.
- Integrate Observability via AWS CloudWatch metrics and logs.
- Expand analytics schema for churn and retention analyses.
