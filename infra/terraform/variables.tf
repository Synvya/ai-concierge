variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix applied to all provisioned resources"
  type        = string
  default     = "ai-concierge"
}

variable "backend_image" {
  description = "ECR image URI for the backend service (leave blank to use the default repository)"
  type        = string
  default     = ""
}

variable "backend_cpu" {
  description = "Fargate CPU units"
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "Fargate memory (MiB)"
  type        = number
  default     = 1024
}

variable "environment_variables" {
  description = "JSON map of plaintext environment variables injected into the backend container"
  type        = string
  default     = "{}"
}

variable "secret_variables" {
  description = "JSON map of environment variable names to Secrets Manager ARNs"
  type        = string
  default     = "{}"
}

variable "analytics_bucket_name" {
  description = "Name of the S3 bucket storing analytics exports"
  type        = string
}

variable "frontend_bucket_name" {
  description = "Name of the S3 bucket hosting the static frontend"
  type        = string
}

variable "desired_count" {
  description = "Number of Fargate tasks to run"
  type        = number
  default     = 1
}
