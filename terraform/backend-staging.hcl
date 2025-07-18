# Terraform Backend Configuration for Staging Environment
bucket         = "sui-faucet-terraform-state"
key            = "sui-faucet/staging/terraform.tfstate"
region         = "us-west-2"
dynamodb_table = "sui-faucet-terraform-locks"
encrypt        = true

# Optional: Enable versioning and lifecycle policies
versioning = true
