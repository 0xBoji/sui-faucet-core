# EC2 Module
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
}

variable "ami_id" {
  description = "AMI ID for the instance"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID for the instance"
  type        = string
}

variable "security_group_ids" {
  description = "Security group IDs"
  type        = list(string)
}

variable "key_name" {
  description = "Key pair name"
  type        = string
}

# User data script for instance initialization
locals {
  user_data = base64encode(templatefile("${path.module}/user-data.sh", {
    environment = var.environment
  }))
}

# Launch Template
resource "aws_launch_template" "faucet" {
  name_prefix   = "sui-faucet-${var.environment}-"
  image_id      = var.ami_id
  instance_type = var.instance_type
  key_name      = var.key_name
  
  vpc_security_group_ids = var.security_group_ids
  
  user_data = local.user_data
  
  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "sui-faucet-${var.environment}"
      Environment = var.environment
    }
  }
  
  lifecycle {
    create_before_destroy = true
  }
}

# Auto Scaling Group
resource "aws_autoscaling_group" "faucet" {
  name                = "sui-faucet-${var.environment}-asg"
  vpc_zone_identifier = [var.subnet_id]
  target_group_arns   = [aws_lb_target_group.faucet.arn]
  health_check_type   = "ELB"
  health_check_grace_period = 300
  
  min_size         = 1
  max_size         = 3
  desired_capacity = 1
  
  launch_template {
    id      = aws_launch_template.faucet.id
    version = "$Latest"
  }
  
  tag {
    key                 = "Name"
    value               = "sui-faucet-${var.environment}-asg"
    propagate_at_launch = false
  }
  
  tag {
    key                 = "Environment"
    value               = var.environment
    propagate_at_launch = true
  }
}

# Application Load Balancer
resource "aws_lb" "faucet" {
  name               = "sui-faucet-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = var.security_group_ids
  subnets            = [var.subnet_id]
  
  enable_deletion_protection = false
  
  tags = {
    Name        = "sui-faucet-${var.environment}-alb"
    Environment = var.environment
  }
}

# Target Group
resource "aws_lb_target_group" "faucet" {
  name     = "sui-faucet-${var.environment}-tg"
  port     = 3001
  protocol = "HTTP"
  vpc_id   = data.aws_subnet.selected.vpc_id
  
  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/api/v1/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }
  
  tags = {
    Name        = "sui-faucet-${var.environment}-tg"
    Environment = var.environment
  }
}

# Load Balancer Listener
resource "aws_lb_listener" "faucet" {
  load_balancer_arn = aws_lb.faucet.arn
  port              = "80"
  protocol          = "HTTP"
  
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.faucet.arn
  }
}

# Data source for subnet
data "aws_subnet" "selected" {
  id = var.subnet_id
}

# Outputs
output "public_ip" {
  description = "Public IP of the instance"
  value       = aws_lb.faucet.dns_name
}

output "public_dns" {
  description = "Public DNS of the instance"
  value       = aws_lb.faucet.dns_name
}

output "load_balancer_dns" {
  description = "DNS name of the load balancer"
  value       = aws_lb.faucet.dns_name
}
