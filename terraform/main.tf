# Sui Faucet Infrastructure
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.1"
    }
  }

  # Remote state backend - configured via backend config files
  backend "s3" {
    # Configuration provided via:
    # terraform init -backend-config=backend-{environment}.hcl
  }
}

# Configure AWS Provider
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "sui-faucet"
      Environment = var.environment
      ManagedBy   = "terraform"
      Owner       = "sui-faucet-team"
    }
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# Local values
locals {
  name_prefix = "${var.project_name}-${var.environment}"
  
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  # AZ selection
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

# Random password for RDS
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# Store DB password in AWS Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${local.name_prefix}-db-password"
  description             = "Database password for Sui Faucet"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}
