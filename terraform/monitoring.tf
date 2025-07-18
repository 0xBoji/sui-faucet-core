# Monitoring and Alerting for Sui Faucet

# SNS Topic for Alerts
resource "aws_sns_topic" "alerts" {
  count = var.enable_monitoring ? 1 : 0
  name  = "${local.name_prefix}-alerts"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-alerts"
  })
}

# SNS Topic Subscription (Email)
resource "aws_sns_topic_subscription" "email_alerts" {
  count     = var.enable_monitoring ? 1 : 0
  topic_arn = aws_sns_topic.alerts[0].arn
  protocol  = "email"
  endpoint  = "alerts@yourdomain.com" # Update with your email
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  count          = var.enable_monitoring ? 1 : 0
  dashboard_name = "${local.name_prefix}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ServiceName", aws_ecs_service.app.name, "ClusterName", aws_ecs_cluster.main.name],
            [".", "MemoryUtilization", ".", ".", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "ECS Service Metrics"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.main.arn_suffix],
            [".", "TargetResponseTime", ".", "."],
            [".", "HTTPCode_Target_2XX_Count", ".", "."],
            [".", "HTTPCode_Target_4XX_Count", ".", "."],
            [".", "HTTPCode_Target_5XX_Count", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "Load Balancer Metrics"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 6
        height = 6

        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.main.id],
            [".", "DatabaseConnections", ".", "."],
            [".", "FreeableMemory", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "RDS Metrics"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 6
        y      = 12
        width  = 6
        height = 6

        properties = {
          metrics = [
            ["AWS/ElastiCache", "CPUUtilization", "CacheClusterId", "${aws_elasticache_replication_group.main.replication_group_id}-001"],
            [".", "DatabaseMemoryUsagePercentage", ".", "."],
            [".", "NetworkBytesIn", ".", "."],
            [".", "NetworkBytesOut", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "ElastiCache Metrics"
          period  = 300
        }
      }
    ]
  })
}

# CloudWatch Alarms for ECS
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${local.name_prefix}-ecs-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors ECS CPU utilization"
  alarm_actions       = [aws_sns_topic.alerts[0].arn]

  dimensions = {
    ServiceName = aws_ecs_service.app.name
    ClusterName = aws_ecs_cluster.main.name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory_high" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${local.name_prefix}-ecs-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "85"
  alarm_description   = "This metric monitors ECS memory utilization"
  alarm_actions       = [aws_sns_topic.alerts[0].arn]

  dimensions = {
    ServiceName = aws_ecs_service.app.name
    ClusterName = aws_ecs_cluster.main.name
  }

  tags = local.common_tags
}

# CloudWatch Alarms for RDS
resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${local.name_prefix}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors RDS CPU utilization"
  alarm_actions       = [aws_sns_topic.alerts[0].arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "rds_connections_high" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${local.name_prefix}-rds-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors RDS connection count"
  alarm_actions       = [aws_sns_topic.alerts[0].arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = local.common_tags
}

# CloudWatch Alarms for Application Load Balancer
resource "aws_cloudwatch_metric_alarm" "alb_5xx_errors" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${local.name_prefix}-alb-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "This metric monitors ALB 5XX errors"
  alarm_actions       = [aws_sns_topic.alerts[0].arn]

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = local.common_tags
}

# Custom CloudWatch Log Insights Queries
resource "aws_cloudwatch_query_definition" "error_logs" {
  count = var.enable_monitoring ? 1 : 0

  name = "${local.name_prefix}-error-logs"

  log_group_names = [
    aws_cloudwatch_log_group.ecs.name
  ]

  query_string = <<EOF
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100
EOF
}

resource "aws_cloudwatch_query_definition" "faucet_requests" {
  count = var.enable_monitoring ? 1 : 0

  name = "${local.name_prefix}-faucet-requests"

  log_group_names = [
    aws_cloudwatch_log_group.ecs.name
  ]

  query_string = <<EOF
fields @timestamp, @message
| filter @message like /faucet request/
| stats count() by bin(5m)
| sort @timestamp desc
EOF
}

# CloudWatch Composite Alarm for Application Health
resource "aws_cloudwatch_composite_alarm" "application_health" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name        = "${local.name_prefix}-application-health"
  alarm_description = "Composite alarm for overall application health"

  alarm_rule = join(" OR ", [
    "ALARM(${aws_cloudwatch_metric_alarm.ecs_cpu_high[0].alarm_name})",
    "ALARM(${aws_cloudwatch_metric_alarm.ecs_memory_high[0].alarm_name})",
    "ALARM(${aws_cloudwatch_metric_alarm.rds_cpu_high[0].alarm_name})",
    "ALARM(${aws_cloudwatch_metric_alarm.alb_5xx_errors[0].alarm_name})"
  ])

  alarm_actions = [aws_sns_topic.alerts[0].arn]
  ok_actions    = [aws_sns_topic.alerts[0].arn]

  tags = local.common_tags
}
