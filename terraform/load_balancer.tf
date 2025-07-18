# Application Load Balancer for Sui Faucet

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = var.environment == "production"

  # Access logs (optional)
  dynamic "access_logs" {
    for_each = var.enable_monitoring ? [1] : []
    content {
      bucket  = aws_s3_bucket.alb_logs[0].bucket
      prefix  = "alb-logs"
      enabled = true
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-alb"
  })
}

# S3 Bucket for ALB Access Logs (optional)
resource "aws_s3_bucket" "alb_logs" {
  count  = var.enable_monitoring ? 1 : 0
  bucket = "${local.name_prefix}-alb-logs"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-alb-logs"
  })
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  count  = var.enable_monitoring ? 1 : 0
  bucket = aws_s3_bucket.alb_logs[0].id

  rule {
    id     = "alb_logs_lifecycle"
    status = "Enabled"

    # Apply to all objects
    filter {}

    expiration {
      days = 30
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  count  = var.enable_monitoring ? 1 : 0
  bucket = aws_s3_bucket.alb_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::797873946194:root" # ELB service account for us-west-2
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.alb_logs[0].arn}/alb-logs/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
      },
      {
        Effect = "Allow"
        Principal = {
          Service = "delivery.logs.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.alb_logs[0].arn}/alb-logs/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      },
      {
        Effect = "Allow"
        Principal = {
          Service = "delivery.logs.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.alb_logs[0].arn
      }
    ]
  })
}

# Target Group
resource "aws_lb_target_group" "app" {
  name        = "${local.name_prefix}-tg"
  port        = var.app_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = var.health_check_path
    matcher             = "200"
    port                = "traffic-port"
    protocol            = "HTTP"
  }

  # Deregistration delay
  deregistration_delay = 30

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-tg"
  })
}

# HTTP Listener (redirect to HTTPS if certificate is provided)
resource "aws_lb_listener" "app_http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.certificate_arn != "" ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = var.certificate_arn == "" ? [1] : []
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.app.arn
    }
  }

  tags = local.common_tags
}

# HTTPS Listener (if certificate is provided)
resource "aws_lb_listener" "app_https" {
  count             = var.certificate_arn != "" ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }

  tags = local.common_tags
}

# Alias for the main listener (used in ECS service)
resource "aws_lb_listener" "app" {
  load_balancer_arn = aws_lb.main.arn
  port              = var.certificate_arn != "" ? "443" : "80"
  protocol          = var.certificate_arn != "" ? "HTTPS" : "HTTP"
  
  dynamic "ssl_policy" {
    for_each = var.certificate_arn != "" ? [1] : []
    content {
      ssl_policy = "ELBSecurityPolicy-TLS-1-2-2017-01"
    }
  }
  
  dynamic "certificate_arn" {
    for_each = var.certificate_arn != "" ? [1] : []
    content {
      certificate_arn = var.certificate_arn
    }
  }

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }

  tags = local.common_tags
}

# CloudWatch Alarms for ALB
resource "aws_cloudwatch_metric_alarm" "alb_target_response_time" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${local.name_prefix}-alb-target-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Average"
  threshold           = "1"
  alarm_description   = "This metric monitors ALB target response time"
  alarm_actions       = [] # Add SNS topic ARN for notifications

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${local.name_prefix}-alb-unhealthy-hosts"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Average"
  threshold           = "0"
  alarm_description   = "This metric monitors ALB unhealthy hosts"
  alarm_actions       = [] # Add SNS topic ARN for notifications

  dimensions = {
    TargetGroup  = aws_lb_target_group.app.arn_suffix
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = local.common_tags
}
