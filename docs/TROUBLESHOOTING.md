# Troubleshooting Guide

This guide helps you diagnose and fix common issues with the Sui Faucet deployment.

## Quick Diagnostics

### Health Check Commands
```bash
# Check application health
curl -f https://your-domain.com/api/v1/health

# Check ECS service status
aws ecs describe-services \
  --cluster sui-faucet-staging-cluster \
  --services sui-faucet-staging-service

# Check load balancer targets
aws elbv2 describe-target-health \
  --target-group-arn $(terraform output -raw target_group_arn)

# Check recent logs
aws logs tail /ecs/sui-faucet-staging --since 1h
```

## Common Issues

### 1. Application Won't Start

#### Symptoms
- ECS tasks keep stopping
- Health checks failing
- 503 errors from load balancer

#### Diagnosis
```bash
# Check ECS service events
aws ecs describe-services \
  --cluster sui-faucet-staging-cluster \
  --services sui-faucet-staging-service \
  --query 'services[0].events[0:5]'

# Check task definition
aws ecs describe-task-definition \
  --task-definition sui-faucet-staging-app \
  --query 'taskDefinition.containerDefinitions[0]'

# Check application logs
aws logs tail /ecs/sui-faucet-staging --follow
```

#### Common Causes & Solutions

**Missing Environment Variables**
```bash
# Check secrets in Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id $(terraform output -raw app_secrets_arn)

# Update missing secrets
aws secretsmanager update-secret \
  --secret-id $(terraform output -raw app_secrets_arn) \
  --secret-string '{"key": "value"}'
```

**Database Connection Issues**
```bash
# Check database status
aws rds describe-db-instances \
  --db-instance-identifier sui-faucet-staging-db

# Test connectivity from ECS task
aws ecs execute-command \
  --cluster sui-faucet-staging-cluster \
  --task TASK_ID \
  --container sui-faucet \
  --interactive \
  --command "/bin/bash"
```

**Insufficient Resources**
```bash
# Check task resource utilization
aws ecs describe-tasks \
  --cluster sui-faucet-staging-cluster \
  --tasks TASK_ARN

# Update task definition with more resources
# Edit terraform/ecs.tf and increase cpu/memory
```

### 2. Database Connection Failures

#### Symptoms
- "Connection timeout" errors
- "Connection refused" errors
- Application can't connect to database

#### Diagnosis
```bash
# Check RDS instance status
aws rds describe-db-instances \
  --db-instance-identifier sui-faucet-staging-db \
  --query 'DBInstances[0].DBInstanceStatus'

# Check security groups
aws ec2 describe-security-groups \
  --group-ids $(terraform output -raw rds_security_group_id)

# Check database logs
aws rds describe-db-log-files \
  --db-instance-identifier sui-faucet-staging-db
```

#### Solutions

**Security Group Issues**
```bash
# Verify ECS security group can access RDS
aws ec2 describe-security-groups \
  --group-ids $(terraform output -raw ecs_security_group_id) \
  --query 'SecurityGroups[0].GroupId'

# Check RDS security group rules
aws ec2 describe-security-groups \
  --group-ids $(terraform output -raw rds_security_group_id) \
  --query 'SecurityGroups[0].IpPermissions'
```

**Connection String Issues**
```bash
# Verify database connection details
aws secretsmanager get-secret-value \
  --secret-id $(terraform output -raw db_secret_arn) \
  --query 'SecretString' --output text | jq .
```

### 3. Redis Connection Issues

#### Symptoms
- Rate limiting not working
- Session data not persisting
- Cache-related errors

#### Diagnosis
```bash
# Check ElastiCache cluster status
aws elasticache describe-replication-groups \
  --replication-group-id sui-faucet-staging-redis

# Check Redis logs
aws logs tail /aws/elasticache/redis/sui-faucet-staging/slow-log
```

#### Solutions

**Network Connectivity**
```bash
# Test Redis connectivity from ECS
aws ecs execute-command \
  --cluster sui-faucet-staging-cluster \
  --task TASK_ID \
  --container sui-faucet \
  --interactive \
  --command "redis-cli -h REDIS_ENDPOINT ping"
```

**Authentication Issues**
```bash
# Check Redis auth token
aws secretsmanager get-secret-value \
  --secret-id $(terraform output -raw redis_secret_arn)
```

### 4. Load Balancer Issues

#### Symptoms
- 502/503 errors
- Intermittent connectivity
- Health checks failing

#### Diagnosis
```bash
# Check target group health
aws elbv2 describe-target-health \
  --target-group-arn $(terraform output -raw target_group_arn)

# Check load balancer attributes
aws elbv2 describe-load-balancers \
  --load-balancer-arns $(terraform output -raw load_balancer_arn)

# Check listener rules
aws elbv2 describe-listeners \
  --load-balancer-arn $(terraform output -raw load_balancer_arn)
```

#### Solutions

**Target Registration Issues**
```bash
# Force service update to re-register targets
aws ecs update-service \
  --cluster sui-faucet-staging-cluster \
  --service sui-faucet-staging-service \
  --force-new-deployment
```

**Health Check Configuration**
```bash
# Check health check settings
aws elbv2 describe-target-groups \
  --target-group-arns $(terraform output -raw target_group_arn) \
  --query 'TargetGroups[0].HealthCheckPath'
```

### 5. CI/CD Pipeline Issues

#### GitHub Actions Failures

**Authentication Issues**
```bash
# Check OIDC provider configuration
aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com

# Check GitHub Actions role
aws iam get-role --role-name sui-faucet-staging-github-actions-role
```

**Terraform State Lock**
```bash
# Check DynamoDB lock table
aws dynamodb scan --table-name sui-faucet-terraform-locks

# Force unlock if necessary (use with caution)
terraform force-unlock LOCK_ID
```

**Docker Build Issues**
```bash
# Check GitHub Container Registry permissions
# Go to GitHub → Settings → Developer settings → Personal access tokens
# Ensure token has write:packages permission
```

### 6. Performance Issues

#### High Response Times
```bash
# Check ECS service metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=sui-faucet-staging-service \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

#### Database Performance
```bash
# Check RDS performance insights
aws rds describe-db-instances \
  --db-instance-identifier sui-faucet-staging-db \
  --query 'DBInstances[0].PerformanceInsightsEnabled'

# Check slow query logs
aws rds describe-db-log-files \
  --db-instance-identifier sui-faucet-staging-db
```

## Monitoring and Alerting

### CloudWatch Dashboards
```bash
# View custom dashboard
aws cloudwatch get-dashboard \
  --dashboard-name sui-faucet-staging-dashboard
```

### Log Analysis
```bash
# Search for errors in logs
aws logs start-query \
  --log-group-name /ecs/sui-faucet-staging \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc'

# Get query results
aws logs get-query-results --query-id QUERY_ID
```

### Custom Metrics
```bash
# Check faucet-specific metrics
aws cloudwatch get-metric-statistics \
  --namespace SuiFaucet \
  --metric-name RequestCount \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

## Emergency Procedures

### Immediate Response
1. **Check application health**: `curl -f https://your-domain.com/api/v1/health`
2. **Check recent logs**: `aws logs tail /ecs/sui-faucet-staging --since 10m`
3. **Check service status**: ECS console or CLI commands
4. **Scale up if needed**: Increase desired count temporarily

### Rollback Procedures
```bash
# Quick rollback to previous task definition
PREVIOUS_TASK_DEF=$(aws ecs list-task-definitions \
  --family-prefix sui-faucet-staging \
  --status ACTIVE \
  --sort DESC \
  --query 'taskDefinitionArns[1]' \
  --output text)

aws ecs update-service \
  --cluster sui-faucet-staging-cluster \
  --service sui-faucet-staging-service \
  --task-definition $PREVIOUS_TASK_DEF
```

### Disaster Recovery
```bash
# Restore from RDS snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier sui-faucet-staging-db-restored \
  --db-snapshot-identifier sui-faucet-staging-db-snapshot-YYYYMMDD

# Restore ElastiCache from backup
aws elasticache create-replication-group \
  --replication-group-id sui-faucet-staging-redis-restored \
  --snapshot-name sui-faucet-staging-redis-backup-YYYYMMDD
```

## Getting Help

### Log Collection
```bash
# Collect all relevant logs
mkdir -p troubleshooting-logs
aws logs tail /ecs/sui-faucet-staging --since 1h > troubleshooting-logs/application.log
aws ecs describe-services --cluster sui-faucet-staging-cluster --services sui-faucet-staging-service > troubleshooting-logs/ecs-service.json
aws rds describe-db-instances --db-instance-identifier sui-faucet-staging-db > troubleshooting-logs/rds.json
```

### Support Channels
1. **Internal Documentation**: Check confluence/wiki
2. **Team Chat**: Post in #sui-faucet-support channel
3. **On-call Engineer**: Page if critical issue
4. **AWS Support**: For infrastructure issues (if support plan available)

### Escalation Procedures
1. **Level 1**: Application restart, basic troubleshooting
2. **Level 2**: Infrastructure investigation, scaling
3. **Level 3**: Code changes, architecture modifications
4. **Level 4**: Vendor support, major incident response
