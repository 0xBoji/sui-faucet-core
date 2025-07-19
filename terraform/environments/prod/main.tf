terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  backend "s3" {
    bucket = "sui-faucet-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "ap-southeast-2"
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Environment = "production"
      Project     = "sui-faucet"
      ManagedBy   = "terraform"
    }
  }
}

# Variables
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-2"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"
}

variable "domain_name" {
  description = "Domain name for the faucet"
  type        = string
  default     = "suifaucet.io"
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-22.04-amd64-server-*"]
  }
  
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Modules
module "networking" {
  source = "../../modules/networking"
  
  environment = var.environment
  aws_region  = var.aws_region
}

module "security" {
  source = "../../modules/security"
  
  environment = var.environment
  vpc_id      = module.networking.vpc_id
}

module "ec2" {
  source = "../../modules/ec2"
  
  environment         = var.environment
  instance_type      = var.instance_type
  ami_id             = data.aws_ami.ubuntu.id
  subnet_id          = module.networking.public_subnet_ids[0]
  security_group_ids = [module.security.web_security_group_id]
  key_name           = "sui-faucet-${var.environment}"
}

# Outputs
output "instance_public_ip" {
  description = "Public IP of the EC2 instance"
  value       = module.ec2.public_ip
}

output "instance_public_dns" {
  description = "Public DNS of the EC2 instance"
  value       = module.ec2.public_dns
}

output "load_balancer_dns" {
  description = "DNS name of the load balancer"
  value       = module.ec2.load_balancer_dns
}
