#!/bin/bash

# Bootstrap Terraform State Management
# This script creates the S3 bucket and DynamoDB table for Terraform state management

set -e

# Configuration
AWS_REGION=${AWS_REGION:-"us-west-2"}
STATE_BUCKET=${STATE_BUCKET:-"sui-faucet-terraform-state"}
LOCK_TABLE=${LOCK_TABLE:-"sui-faucet-terraform-locks"}

echo "🚀 Bootstrapping Terraform State Management"
echo "Region: $AWS_REGION"
echo "State Bucket: $STATE_BUCKET"
echo "Lock Table: $LOCK_TABLE"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if Terraform is installed
if ! command -v terraform &> /dev/null; then
    echo "❌ Terraform is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
echo "🔍 Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "✅ AWS credentials configured for account: $ACCOUNT_ID"

# Check if S3 bucket already exists
echo "🔍 Checking if S3 bucket exists..."
if aws s3api head-bucket --bucket "$STATE_BUCKET" 2>/dev/null; then
    echo "⚠️  S3 bucket $STATE_BUCKET already exists"
else
    echo "📦 S3 bucket $STATE_BUCKET does not exist, will be created"
fi

# Check if DynamoDB table already exists
echo "🔍 Checking if DynamoDB table exists..."
if aws dynamodb describe-table --table-name "$LOCK_TABLE" &> /dev/null; then
    echo "⚠️  DynamoDB table $LOCK_TABLE already exists"
else
    echo "🗃️  DynamoDB table $LOCK_TABLE does not exist, will be created"
fi

# Navigate to bootstrap directory
cd "$(dirname "$0")/../terraform/bootstrap"

# Initialize Terraform
echo "🔧 Initializing Terraform..."
terraform init

# Plan the bootstrap
echo "📋 Planning Terraform bootstrap..."
terraform plan \
    -var="aws_region=$AWS_REGION" \
    -var="state_bucket_name=$STATE_BUCKET" \
    -var="lock_table_name=$LOCK_TABLE" \
    -out=bootstrap.tfplan

# Ask for confirmation
echo ""
read -p "Do you want to apply the Terraform plan? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Apply the bootstrap
    echo "🚀 Applying Terraform bootstrap..."
    terraform apply bootstrap.tfplan
    
    # Get outputs
    echo "📤 Getting Terraform outputs..."
    STATE_BUCKET_CREATED=$(terraform output -raw state_bucket_name)
    LOCK_TABLE_CREATED=$(terraform output -raw lock_table_name)
    
    echo ""
    echo "✅ Bootstrap completed successfully!"
    echo "📦 S3 Bucket: $STATE_BUCKET_CREATED"
    echo "🗃️  DynamoDB Table: $LOCK_TABLE_CREATED"
    echo ""
    echo "🔧 Next steps:"
    echo "1. Update backend configuration files with the created resources"
    echo "2. Initialize main Terraform configuration with remote backend"
    echo "3. Configure GitHub secrets with the resource names"
    echo ""
    echo "Backend configuration:"
    echo "bucket         = \"$STATE_BUCKET_CREATED\""
    echo "dynamodb_table = \"$LOCK_TABLE_CREATED\""
    echo "region         = \"$AWS_REGION\""
    
    # Clean up
    rm -f bootstrap.tfplan
    
else
    echo "❌ Bootstrap cancelled"
    rm -f bootstrap.tfplan
    exit 1
fi
