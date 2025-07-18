# Outputs for Terraform State Management Bootstrap

output "state_bucket_name" {
  description = "Name of the S3 bucket for Terraform state"
  value       = aws_s3_bucket.terraform_state.bucket
}

output "state_bucket_arn" {
  description = "ARN of the S3 bucket for Terraform state"
  value       = aws_s3_bucket.terraform_state.arn
}

output "lock_table_name" {
  description = "Name of the DynamoDB table for state locking"
  value       = aws_dynamodb_table.terraform_locks.name
}

output "lock_table_arn" {
  description = "ARN of the DynamoDB table for state locking"
  value       = aws_dynamodb_table.terraform_locks.arn
}

output "terraform_state_policy_arn" {
  description = "ARN of the IAM policy for Terraform state access"
  value       = aws_iam_policy.terraform_state_access.arn
}

output "backend_config_staging" {
  description = "Backend configuration for staging environment"
  value = {
    bucket         = aws_s3_bucket.terraform_state.bucket
    key            = "sui-faucet/staging/terraform.tfstate"
    region         = var.aws_region
    dynamodb_table = aws_dynamodb_table.terraform_locks.name
    encrypt        = true
  }
}

output "backend_config_production" {
  description = "Backend configuration for production environment"
  value = {
    bucket         = aws_s3_bucket.terraform_state.bucket
    key            = "sui-faucet/production/terraform.tfstate"
    region         = var.aws_region
    dynamodb_table = aws_dynamodb_table.terraform_locks.name
    encrypt        = true
  }
}
