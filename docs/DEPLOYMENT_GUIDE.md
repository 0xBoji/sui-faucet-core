# Sui Faucet Deployment Guide

This guide walks you through deploying the Sui Faucet application using Terraform and GitHub Actions CI/CD.

## Prerequisites

### Required Tools
- [AWS CLI](https://aws.amazon.com/cli/) v2.x
- [Terraform](https://www.terraform.io/) v1.6+
- [Docker](https://www.docker.com/) v20+
- [Node.js](https://nodejs.org/) v18+
- Git

### Required Accounts
- AWS Account with appropriate permissions
- GitHub Account with repository access
- Domain name (optional, for custom domain)

## Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/your-org/sui-faucet-core-node.git
cd sui-faucet-core-node
```

### 2. Bootstrap Terraform State Management
```bash
# Configure AWS credentials
aws configure

# Run bootstrap script
./scripts/bootstrap-terraform.sh
```

### 3. Configure GitHub Secrets
Follow the [GitHub Secrets Setup Guide](./GITHUB_SECRETS_SETUP.md) to configure all required secrets.

### 4. Deploy Infrastructure
```bash
# Push to main branch to trigger deployment
git push origin main

# Or manually trigger via GitHub Actions
# Go to Actions tab → Terraform Apply → Run workflow
```

### 5. Deploy Application
```bash
# Application deployment happens automatically after infrastructure
# Or manually trigger via GitHub Actions
# Go to Actions tab → Deploy Application → Run workflow
```

## Detailed Deployment Steps

### Step 1: AWS Setup

#### Create IAM User for Terraform
```bash
# Create IAM user
aws iam create-user --user-name terraform-user

# Attach PowerUser policy (or create custom policy)
aws iam attach-user-policy \
  --user-name terraform-user \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess

# Create access keys
aws iam create-access-key --user-name terraform-user
```

#### Setup OIDC Provider for GitHub Actions
```bash
# Create OIDC provider
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### Step 2: Terraform State Management

#### Bootstrap State Resources
```bash
cd terraform/bootstrap
terraform init
terraform plan
terraform apply
```

#### Configure Backend
Update `terraform/backend-staging.hcl` and `terraform/backend-production.hcl` with the created resources.

### Step 3: Environment Configuration

#### Staging Environment
```bash
# Initialize with staging backend
cd terraform
terraform init -backend-config=backend-staging.hcl

# Plan staging deployment
terraform plan -var-file=environments/staging.tfvars

# Apply staging deployment
terraform apply -var-file=environments/staging.tfvars
```

#### Production Environment
```bash
# Initialize with production backend
terraform init -backend-config=backend-production.hcl -reconfigure

# Plan production deployment
terraform plan -var-file=environments/production.tfvars

# Apply production deployment
terraform apply -var-file=environments/production.tfvars
```

### Step 4: Application Secrets

#### Update Application Secrets
```bash
# Get secret ARN from Terraform output
SECRET_ARN=$(terraform output -raw app_secrets_arn)

# Update secrets
aws secretsmanager update-secret \
  --secret-id $SECRET_ARN \
  --secret-string '{
    "sui_faucet_private_key": "your-actual-private-key",
    "api_key": "your-api-key",
    "jwt_secret": "your-jwt-secret",
    "admin_username": "admin",
    "admin_password": "your-secure-password"
  }'
```

### Step 5: DNS Configuration (Optional)

#### Route 53 Setup
```bash
# Create hosted zone
aws route53 create-hosted-zone \
  --name yourdomain.com \
  --caller-reference $(date +%s)

# Create A record pointing to ALB
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789 \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "faucet.yourdomain.com",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "your-alb-dns-name",
          "EvaluateTargetHealth": false,
          "HostedZoneId": "Z1D633PJN98FT9"
        }
      }
    }]
  }'
```

## CI/CD Pipeline

### Workflow Overview

1. **CI Pipeline** (`ci.yml`)
   - Runs on every push/PR
   - Tests, builds, and pushes Docker image
   - Security scanning

2. **Terraform Plan** (`terraform-plan.yml`)
   - Runs on PR to main
   - Plans infrastructure changes
   - Security scanning for Terraform

3. **Terraform Apply** (`terraform-apply.yml`)
   - Runs on push to main
   - Applies infrastructure changes
   - Can be manually triggered

4. **Deploy Application** (`deploy.yml`)
   - Runs after successful CI
   - Deploys application to ECS
   - Runs health checks

### Manual Deployment

#### Deploy Specific Environment
```bash
# Via GitHub Actions UI
# 1. Go to Actions tab
# 2. Select "Terraform Apply" workflow
# 3. Click "Run workflow"
# 4. Select environment (staging/production)
# 5. Click "Run workflow"
```

#### Deploy Specific Image Tag
```bash
# Via GitHub Actions UI
# 1. Go to Actions tab
# 2. Select "Deploy Application" workflow
# 3. Click "Run workflow"
# 4. Enter image tag (e.g., "v1.2.3")
# 5. Click "Run workflow"
```

## Monitoring and Logging

### CloudWatch Dashboards
- **Application Metrics**: ECS CPU, Memory, Request count
- **Infrastructure Metrics**: RDS, ElastiCache, Load Balancer
- **Custom Metrics**: Faucet requests, balance, errors

### Alerts
- High CPU/Memory usage
- Application errors (5XX)
- Database connection issues
- Faucet balance low
- High request rate

### Log Analysis
```bash
# View application logs
aws logs tail /ecs/sui-faucet-staging --follow

# Query error logs
aws logs start-query \
  --log-group-name /ecs/sui-faucet-staging \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/'
```

## Troubleshooting

### Common Issues

#### 1. Terraform State Lock
```bash
# Force unlock (use with caution)
terraform force-unlock LOCK_ID
```

#### 2. ECS Service Won't Start
```bash
# Check service events
aws ecs describe-services \
  --cluster sui-faucet-staging-cluster \
  --services sui-faucet-staging-service

# Check task logs
aws logs tail /ecs/sui-faucet-staging --follow
```

#### 3. Database Connection Issues
```bash
# Test database connectivity
aws rds describe-db-instances \
  --db-instance-identifier sui-faucet-staging-db

# Check security groups
aws ec2 describe-security-groups \
  --group-ids sg-xxxxxxxxx
```

#### 4. Load Balancer Health Checks Failing
```bash
# Check target group health
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:...

# Check application health endpoint
curl -f https://your-alb-dns/api/v1/health
```

### Rollback Procedures

#### Application Rollback
```bash
# Via GitHub Actions
# 1. Go to Actions tab
# 2. Find previous successful deployment
# 3. Re-run the deployment workflow

# Or manually update ECS service
aws ecs update-service \
  --cluster sui-faucet-staging-cluster \
  --service sui-faucet-staging-service \
  --task-definition sui-faucet-staging-app:PREVIOUS_REVISION
```

#### Infrastructure Rollback
```bash
# Revert Terraform changes
git revert <commit-hash>
git push origin main

# Or manually apply previous state
terraform plan -var-file=environments/staging.tfvars
terraform apply -var-file=environments/staging.tfvars
```

## Security Considerations

### Network Security
- All resources in private subnets
- Security groups with minimal required access
- WAF protection (optional)

### Data Security
- Encryption at rest for RDS and ElastiCache
- Secrets stored in AWS Secrets Manager
- TLS encryption in transit

### Access Control
- IAM roles with least privilege
- GitHub OIDC for secure CI/CD
- MFA required for AWS console access

## Cost Optimization

### Resource Sizing
- **Staging**: Minimal resources for testing
- **Production**: Right-sized for expected load

### Cost Monitoring
```bash
# Enable cost allocation tags
aws ce put-dimension-key \
  --key Project \
  --context COST_AND_USAGE

# Set up billing alerts
aws budgets create-budget \
  --account-id 123456789012 \
  --budget file://budget.json
```

### Cleanup
```bash
# Destroy staging environment
terraform destroy -var-file=environments/staging.tfvars

# Destroy production environment
terraform destroy -var-file=environments/production.tfvars

## Next Steps

After successful deployment:

1. **Configure Domain**: Set up custom domain and SSL certificate
2. **Setup Monitoring**: Configure alerts and dashboards
3. **Load Testing**: Test application under load
4. **Backup Strategy**: Implement database backup procedures
5. **Disaster Recovery**: Plan for disaster recovery scenarios

## Support

For issues and questions:
- Check the [Troubleshooting Guide](./TROUBLESHOOTING.md)
- Review CloudWatch logs and metrics
- Contact the development team
```
