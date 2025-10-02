# Infrastructure & Deployment

Terraform has been retired from this project. The AWS infrastructure (ECS cluster, service, load balancer, IAM roles, S3 buckets, ElastiCache, etc.) is now managed manually in the AWS console.

## Current Deployment Flow

1. **Container Build & Push** – GitHub Actions (`.github/workflows/deploy.yml`) builds the backend image, pushes it to ECR, and stores the resulting image URI as a job output (with an artifact fallback).
2. **Task Definition Rendering** – The deploy job renders a task definition JSON using `scripts/render_task_definition.py`, injecting the image URI, CloudWatch log configuration, and environment/secret maps supplied via GitHub secrets.
3. **ECS Service Update** – The workflow calls `aws ecs register-task-definition` followed by `aws ecs update-service --force-new-deployment` to roll the service to the new revision, then waits for the service to stabilise.
4. **Frontend Upload** – The Vite build artefacts are synchronised to the configured S3 website bucket.

## Manual Prerequisites

Because infrastructure is now managed outside of Terraform, ensure the following AWS resources already exist before running the pipeline:

- **ECR Repository**: `${PROJECT_NAME}-backend` containing any previous images.
- **ECS Cluster**: `${PROJECT_NAME}-cluster` with a service named `${PROJECT_NAME}-service` targeting the application load balancer.
- **IAM Roles**:
  - `${PROJECT_NAME}-ecs-execution` with the managed policy `AmazonECSTaskExecutionRolePolicy` _plus_ inline access to required Secrets Manager ARNs.
  - `${PROJECT_NAME}-ecs-task` granting the application permissions (for example, S3 analytics writes).
  - `${PROJECT_NAME}-deploy` (GitHub deploy role) allowed to register task definitions and update the service.
- **Application Load Balancer**: `${PROJECT_NAME}-alb` with listener and target group `${PROJECT_NAME}-tg`.
- **S3 Buckets**:
  - Frontend hosting bucket (public website hosting or CloudFront).
  - Analytics bucket for daily JSON payloads.
- **ElastiCache / Database / VPC** resources referenced by your environment variables.

Any changes to that infrastructure (for example, new subnets, security groups, or IAM policies) must now be performed manually via the AWS console or CLI.

## Updating Secrets & Environment Variables

The deploy workflow expects two GitHub secrets:

- `BACKEND_ENV_JSON` – JSON map of plaintext environment variables.
- `BACKEND_SECRET_JSON` – JSON map of env var name to Secrets Manager ARN.

Whenever you add or rename variables, update those secrets and ensure the ECS execution role can read the referenced Secrets Manager entries.

## Scripts

`scripts/render_task_definition.py` converts the environment/secret maps and image URI into a valid task definition JSON document. You can run it locally for troubleshooting:

```bash
python scripts/render_task_definition.py \
  --family ai-concierge-backend \
  --image 123456789012.dkr.ecr.us-east-1.amazonaws.com/ai-concierge-backend:latest \
  --execution-role arn:aws:iam::122610503853:role/ai-concierge-ecs-execution \
  --task-role arn:aws:iam::122610503853:role/ai-concierge-ecs-task \
  --log-group /ecs/ai-concierge-backend \
  --log-region us-east-1 \
  --environment-json '{"DB_HOST":"..."}' \
  --secret-json '{"OPENAI_API_KEY":"arn:aws:..."}'
```

The resulting `taskdef.json` can be registered manually with the AWS CLI if needed:

```bash
aws ecs register-task-definition --cli-input-json file://taskdef.json
aws ecs update-service --cluster ai-concierge-cluster --service ai-concierge-service --task-definition <new-arn> --force-new-deployment
```

## Troubleshooting

- If the deploy job fails with `ServiceNotFoundException`, confirm the ECS cluster and service still exist.
- If it times out waiting for the service to stabilise, inspect `aws ecs describe-services --cluster ... --services ... --query 'services[0].events[:10]'` for the root cause (missing secrets access, image pull errors, failing health checks, etc.).
- IAM errors usually mean the deploy role or execution role is missing a required action; adjust them through the AWS console.

With Terraform removed, there is no longer a state file or automated drift management—keep a record of any manual infrastructure changes and update this README as the architecture evolves.
