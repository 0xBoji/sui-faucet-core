# Variables for Terraform State Management Bootstrap

variable "aws_region" {
  description = "AWS region for state management resources"
  type        = string
  default     = "us-west-2"
}

variable "state_bucket_name" {
  description = "Name of the S3 bucket for Terraform state"
  type        = string
  default     = "sui-faucet-terraform-state"
}

variable "lock_table_name" {
  description = "Name of the DynamoDB table for state locking"
  type        = string
  default     = "sui-faucet-terraform-locks"
}
