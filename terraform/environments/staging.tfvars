# Staging Environment Configuration
environment = "staging"
aws_region  = "us-west-2"

# VPC Configuration
vpc_cidr = "10.0.0.0/16"
public_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.10.0/24", "10.0.20.0/24"]

# ECS Configuration
ecs_task_cpu = 512
ecs_task_memory = 1024
ecs_desired_count = 1
ecs_min_capacity = 1
ecs_max_capacity = 3

# RDS Configuration
db_instance_class = "db.t3.micro"
db_allocated_storage = 20
db_max_allocated_storage = 50

# ElastiCache Configuration
redis_node_type = "cache.t3.micro"
redis_num_cache_nodes = 1

# Monitoring
enable_monitoring = true
log_retention_days = 7

# Domain (optional for staging)
domain_name = ""
certificate_arn = ""
