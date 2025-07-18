# GitHub Secrets Setup Guide

This document explains how to configure GitHub secrets for the Sui Faucet CI/CD pipeline.

## Required GitHub Secrets

### AWS Configuration

#### `AWS_ROLE_ARN`
AWS IAM role ARN for GitHub Actions OIDC authentication.

**Example:**
```
arn:aws:iam::123456789012:role/GitHubActionsRole
```

**Setup:**
1. Create IAM role with trust policy for GitHub OIDC
2. Attach necessary policies (see IAM Policies section)
3. Add role ARN to GitHub secrets

#### `TF_STATE_BUCKET`
S3 bucket name for Terraform state storage.

**Example:**
```
sui-faucet-terraform-state-bucket
```

#### `TF_STATE_LOCK_TABLE`
DynamoDB table name for Terraform state locking.

**Example:**
```
sui-faucet-terraform-locks
```

### ECS Configuration

#### `ECS_CLUSTER_NAME`
ECS cluster name for application deployment.

**Format:** `{project}-{environment}-cluster`

**Examples:**
- Staging: `sui-faucet-staging-cluster`
- Production: `sui-faucet-production-cluster`

#### `ECS_SERVICE_NAME`
ECS service name for application deployment.

**Format:** `{project}-{environment}-service`

**Examples:**
- Staging: `sui-faucet-staging-service`
- Production: `sui-faucet-production-service`

#### `LOAD_BALANCER_NAME`
Application Load Balancer name.

**Format:** `{project}-{environment}-alb`

**Examples:**
- Staging: `sui-faucet-staging-alb`
- Production: `sui-faucet-production-alb`

### Application Secrets

#### `SUI_FAUCET_PRIVATE_KEY`
Private key for the Sui faucet wallet (hex format without 0x prefix).

**Example:**
```
abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
```

**⚠️ Security Note:** This is a sensitive secret. Use a dedicated wallet for the faucet.

#### `API_KEY`
API key for faucet requests authentication.

**Example:**
```
suisuisui
```

#### `ADMIN_USERNAME`
Admin username for the admin panel.

**Example:**
```
admin
```

#### `ADMIN_PASSWORD`
Admin password for the admin panel.

**Example:**
```
your-secure-admin-password
```

#### `JWT_SECRET`
Secret key for JWT token signing.

**Example:**
```
your-super-secret-jwt-key-with-at-least-32-characters
```

### Optional Secrets

#### `SNYK_TOKEN`
Snyk token for security scanning (optional).

#### `SLACK_WEBHOOK_URL`
Slack webhook URL for deployment notifications (optional).

**Example:**
```
https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
```

## Environment-Specific Secrets

Some secrets need to be configured per environment. Use GitHub Environments to manage these:

### Staging Environment Secrets
- All secrets listed above with staging-specific values
- Lower security requirements for testing

### Production Environment Secrets
- All secrets listed above with production-specific values
- Higher security requirements
- Enable environment protection rules

## IAM Policies Required

### GitHub Actions Role Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:*",
        "ec2:*",
        "rds:*",
        "elasticache:*",
        "elbv2:*",
        "logs:*",
        "iam:PassRole",
        "secretsmanager:*",
        "s3:*",
        "dynamodb:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### Trust Policy for OIDC

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:your-org/sui-faucet-core-node:*"
        }
      }
    }
  ]
}
```

## Setup Steps

### 1. Create AWS Resources

```bash
# Create S3 bucket for Terraform state
aws s3 mb s3://sui-faucet-terraform-state-bucket

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name sui-faucet-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

### 2. Configure GitHub OIDC

```bash
# Create OIDC provider (if not exists)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### 3. Create IAM Role

```bash
# Create role with trust policy
aws iam create-role \
  --role-name GitHubActionsRole \
  --assume-role-policy-document file://trust-policy.json

# Attach policies
aws iam attach-role-policy \
  --role-name GitHubActionsRole \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess
```

### 4. Add Secrets to GitHub

1. Go to your repository settings
2. Navigate to "Secrets and variables" → "Actions"
3. Add each secret listed above
4. Configure environment-specific secrets in "Environments"

## Security Best Practices

1. **Use least privilege principle** for IAM roles
2. **Rotate secrets regularly**, especially API keys and passwords
3. **Use environment protection rules** for production
4. **Enable secret scanning** in your repository
5. **Monitor secret usage** through GitHub audit logs
6. **Use dedicated wallets** for faucet operations
7. **Enable MFA** for AWS accounts with deployment access

## Troubleshooting

### Common Issues

1. **OIDC Authentication Failed**
   - Check trust policy configuration
   - Verify repository name in condition

2. **Terraform State Access Denied**
   - Check S3 bucket permissions
   - Verify DynamoDB table access

3. **ECS Deployment Failed**
   - Check ECS service and cluster names
   - Verify task definition permissions

4. **Secret Not Found**
   - Check secret name spelling
   - Verify environment configuration
