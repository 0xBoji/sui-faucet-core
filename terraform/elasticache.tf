# ElastiCache Redis for Sui Faucet

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name_prefix}-cache-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-cache-subnet-group"
  })
}

# ElastiCache Parameter Group
resource "aws_elasticache_parameter_group" "main" {
  family = "redis7.x"
  name   = "${local.name_prefix}-cache-params"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  tags = local.common_tags
}

# ElastiCache Redis Cluster
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${local.name_prefix}-redis"
  description                = "Redis cluster for Sui Faucet"

  # Node configuration
  node_type               = var.redis_node_type
  port                    = 6379
  parameter_group_name    = aws_elasticache_parameter_group.main.name

  # Cluster configuration
  num_cache_clusters      = var.redis_num_cache_nodes
  
  # Network configuration
  subnet_group_name       = aws_elasticache_subnet_group.main.name
  security_group_ids      = [aws_security_group.elasticache.id]

  # Redis configuration
  engine_version          = "7.0"
  
  # Backup configuration
  snapshot_retention_limit = var.environment == "production" ? 5 : 1
  snapshot_window         = "03:00-05:00"
  maintenance_window      = "sun:05:00-sun:07:00"

  # Security
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth_token.result

  # Automatic failover (only for multi-node clusters)
  automatic_failover_enabled = var.redis_num_cache_nodes > 1
  multi_az_enabled          = var.redis_num_cache_nodes > 1

  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis"
  })

  depends_on = [
    aws_elasticache_subnet_group.main,
    aws_security_group.elasticache
  ]
}

# Random auth token for Redis
resource "random_password" "redis_auth_token" {
  length  = 32
  special = false # Redis auth token cannot contain special characters
}

# CloudWatch Log Group for Redis slow logs
resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/aws/elasticache/redis/${local.name_prefix}/slow-log"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis-slow-log"
  })
}

# Store Redis connection details in Secrets Manager
resource "aws_secretsmanager_secret" "redis_connection" {
  name                    = "${local.name_prefix}-redis-connection"
  description             = "Redis connection details for Sui Faucet"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "redis_connection" {
  secret_id = aws_secretsmanager_secret.redis_connection.id
  secret_string = jsonencode({
    host      = aws_elasticache_replication_group.main.primary_endpoint_address
    port      = aws_elasticache_replication_group.main.port
    auth_token = random_password.redis_auth_token.result
    url       = "redis://:${random_password.redis_auth_token.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:${aws_elasticache_replication_group.main.port}"
    tls_url   = "rediss://:${random_password.redis_auth_token.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:${aws_elasticache_replication_group.main.port}"
  })
}

# CloudWatch Alarms for Redis
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${local.name_prefix}-redis-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors redis cpu utilization"
  alarm_actions       = [] # Add SNS topic ARN for notifications

  dimensions = {
    CacheClusterId = "${aws_elasticache_replication_group.main.replication_group_id}-001"
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${local.name_prefix}-redis-memory-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors redis memory utilization"
  alarm_actions       = [] # Add SNS topic ARN for notifications

  dimensions = {
    CacheClusterId = "${aws_elasticache_replication_group.main.replication_group_id}-001"
  }

  tags = local.common_tags
}
