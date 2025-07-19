# Security Module
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to access the application"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# Web Security Group (for Load Balancer)
resource "aws_security_group" "web" {
  name_prefix = "sui-faucet-${var.environment}-web-"
  vpc_id      = var.vpc_id
  description = "Security group for web traffic"
  
  # HTTP access
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }
  
  # HTTPS access
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }
  
  # All outbound traffic
  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name        = "sui-faucet-${var.environment}-web-sg"
    Environment = var.environment
  }
  
  lifecycle {
    create_before_destroy = true
  }
}

# Application Security Group (for EC2 instances)
resource "aws_security_group" "app" {
  name_prefix = "sui-faucet-${var.environment}-app-"
  vpc_id      = var.vpc_id
  description = "Security group for application servers"
  
  # Application port from load balancer
  ingress {
    description     = "Application port from load balancer"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.web.id]
  }
  
  # SSH access (restricted)
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"] # Only from VPC
  }
  
  # Health check from load balancer
  ingress {
    description     = "Health check"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.web.id]
  }
  
  # All outbound traffic
  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name        = "sui-faucet-${var.environment}-app-sg"
    Environment = var.environment
  }
  
  lifecycle {
    create_before_destroy = true
  }
}

# Database Security Group
resource "aws_security_group" "database" {
  name_prefix = "sui-faucet-${var.environment}-db-"
  vpc_id      = var.vpc_id
  description = "Security group for database"
  
  # PostgreSQL access from application
  ingress {
    description     = "PostgreSQL from application"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
  
  # Redis access from application
  ingress {
    description     = "Redis from application"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
  
  # All outbound traffic
  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name        = "sui-faucet-${var.environment}-db-sg"
    Environment = var.environment
  }
  
  lifecycle {
    create_before_destroy = true
  }
}

# Bastion Host Security Group (optional)
resource "aws_security_group" "bastion" {
  name_prefix = "sui-faucet-${var.environment}-bastion-"
  vpc_id      = var.vpc_id
  description = "Security group for bastion host"
  
  # SSH access from specific IPs
  ingress {
    description = "SSH from admin IPs"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }
  
  # All outbound traffic
  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name        = "sui-faucet-${var.environment}-bastion-sg"
    Environment = var.environment
  }
  
  lifecycle {
    create_before_destroy = true
  }
}

# WAF Web ACL (optional)
resource "aws_wafv2_web_acl" "main" {
  name  = "sui-faucet-${var.environment}-waf"
  scope = "REGIONAL"
  
  default_action {
    allow {}
  }
  
  # Rate limiting rule
  rule {
    name     = "RateLimitRule"
    priority = 1
    
    action {
      block {}
    }
    
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRule"
      sampled_requests_enabled   = true
    }
  }
  
  # AWS Managed Rules
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 2
    
    override_action {
      none {}
    }
    
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }
  
  tags = {
    Name        = "sui-faucet-${var.environment}-waf"
    Environment = var.environment
  }
  
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "sui-faucet-${var.environment}-waf"
    sampled_requests_enabled   = true
  }
}

# Outputs
output "web_security_group_id" {
  description = "ID of the web security group"
  value       = aws_security_group.web.id
}

output "app_security_group_id" {
  description = "ID of the application security group"
  value       = aws_security_group.app.id
}

output "database_security_group_id" {
  description = "ID of the database security group"
  value       = aws_security_group.database.id
}

output "bastion_security_group_id" {
  description = "ID of the bastion security group"
  value       = aws_security_group.bastion.id
}

output "waf_web_acl_arn" {
  description = "ARN of the WAF Web ACL"
  value       = aws_wafv2_web_acl.main.arn
}
