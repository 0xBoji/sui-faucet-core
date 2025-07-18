# Production Environment Configuration
environment = "production"
aws_region  = "us-west-2"

# VPC Configuration
vpc_cidr = "10.1.0.0/16"
public_subnet_cidrs = ["10.1.1.0/24", "10.1.2.0/24"]
private_subnet_cidrs = ["10.1.10.0/24", "10.1.20.0/24"]

# ECS Configuration
ecs_task_cpu = 1024
ecs_task_memory = 2048
ecs_desired_count = 2
ecs_min_capacity = 2
ecs_max_capacity = 10

# RDS Configuration
db_instance_class = "db.t3.small"
db_allocated_storage = 50
db_max_allocated_storage = 200

# ElastiCache Configuration
redis_node_type = "cache.t3.small"
redis_num_cache_nodes = 2

# Monitoring
enable_monitoring = true
log_retention_days = 30

# Domain Configuration (update with your domain)
domain_name = "faucet.yourdomain.com"
certificate_arn = "arn:aws:acm:us-west-2:123456789012:certificate/your-certificate-id"
