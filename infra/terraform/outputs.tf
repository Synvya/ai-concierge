output "analytics_bucket_name" {
  value       = aws_s3_bucket.analytics.id
  description = "S3 bucket receiving analytics events"
}

output "frontend_bucket_name" {
  value       = aws_s3_bucket.frontend.id
  description = "S3 bucket hosting the static frontend"
}

output "backend_repository_url" {
  value       = aws_ecr_repository.backend.repository_url
  description = "ECR repository URL for backend images"
}

output "load_balancer_dns" {
  value       = aws_lb.api.dns_name
  description = "Public DNS name for the backend load balancer"
}
