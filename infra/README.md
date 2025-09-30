# Infrastructure & Deployment

This directory contains Terraform definitions and GitHub Actions automation for deploying the AI Concierge to AWS.

## Terraform Stack (`infra/terraform`)
### Resources
- **Amazon ECS on Fargate**: Runs the FastAPI backend in a managed, autoscaled container environment.
- **Application Load Balancer**: Provides HTTPS-ready ingress (listener configured for HTTP by default; add ACM cert for HTTPS).
- **Amazon ECR**: Container registry for backend images.
- **Amazon S3 (Analytics)**: Stores anonymised usage analytics (`analytics/daily/<date>/<session_id>.json`).
- **Amazon S3 (Frontend)**: Hosts the static React build (public website hosting enabled).
- **CloudWatch Logs**: Captures backend logs from ECS.
- **IAM Roles & Policies**: Grant the task permission to push analytics to S3 and pull secrets.

### Variables
Set via `terraform.tfvars`, CLI flags, or environment variables (`TF_VAR_*`):
- `project_name`: Resource name prefix (default `ai-concierge`).
- `backend_image`: Full ECR image URI, e.g. `123456789012.dkr.ecr.us-east-1.amazonaws.com/ai-concierge-backend:abcd1234`.
- `analytics_bucket_name`: Target bucket for analytics JSON payloads.
- `frontend_bucket_name`: Static site bucket name.
- `environment_variables`: JSON map of plaintext env vars (example below).
- `secret_variables`: JSON map of env var names to AWS Secrets Manager ARNs (for sensitive values).

Example `terraform.tfvars`:
```hcl
project_name = "ai-concierge"
backend_image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/ai-concierge-backend:latest"
analytics_bucket_name = "ai-concierge-analytics-prod"
frontend_bucket_name  = "ai-concierge-frontend-prod"
environment_variables = jsonencode({
  DB_HOST             = "your-rds-endpoint"
  DB_PORT             = "5432"
  DB_USER             = "concierge_user"
  DB_NAME             = "concierge"
  DB_SCHEMA           = "nostr"
  DB_TABLE            = "sellers"
  S3_ANALYTICS_BUCKET = "ai-concierge-analytics-prod"
  S3_REGION           = "us-east-1"
  REDIS_URL           = "rediss://your-elasticache:6379/0"
})
secret_variables = jsonencode({
  OPENAI_API_KEY = "arn:aws:secretsmanager:us-east-1:123456789012:secret:openai-key"
  DB_PASSWORD    = "arn:aws:secretsmanager:us-east-1:123456789012:secret:concierge-db-password"
})
```

### Usage
```bash
cd infra/terraform
terraform init -backend-config="bucket=<state-bucket>" \
               -backend-config="key=ai-concierge/terraform.tfstate" \
               -backend-config="region=<aws-region>"
terraform plan
terraform apply
```

## GitHub Actions (`.github/workflows/deploy.yml`)
### Pipeline Overview
1. **test** – Installs dependencies, runs backend pytest suite, and TypeScript type checks the frontend.
2. **build** – Assumes the AWS deploy role, builds & tags the backend image, and pushes to ECR.
3. **deploy** – Builds the frontend bundle, syncs to the S3 website bucket, and applies Terraform to update infrastructure.

### Required GitHub Secrets / Variables
Create these at the repository level:
- `AWS_DEPLOY_ROLE_ARN` – IAM role ARN GitHub Actions should assume.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` – Needed for `configure-aws-credentials` (leave blank if role assumption covers access keys).
- `TF_STATE_BUCKET` – S3 bucket for Terraform state (create separately).
- `ANALYTICS_BUCKET` – Matches `analytics_bucket_name` variable.
- `FRONTEND_BUCKET` – Matches `frontend_bucket_name` variable.
- `BACKEND_ENV_JSON` – JSON map of plaintext env vars (see example above).
- `BACKEND_SECRET_JSON` – JSON map of env var name to Secrets Manager ARN.

Optional per-environment overrides can use GitHub environments for manual approvals.

### Frontend Deployment
The workflow runs `npm run build` and performs `aws s3 sync frontend/dist s3://$FRONTEND_BUCKET`. Configure CloudFront on top of the bucket for HTTPS if required.

### Backend Deployment
Terraform wires the ECS task definition to the latest image URI emitted by the build job. Ensure your database/security groups allow inbound traffic from the ECS task subnets.
