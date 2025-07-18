# Sui Testnet Faucet - Complete CI/CD Implementation

A production-ready Sui testnet faucet with comprehensive Terraform infrastructure and GitHub Actions CI/CD pipeline.

## 🚀 Features

### Application Features
- **Sui Testnet Integration**: Direct integration with Sui blockchain testnet
- **Rate Limiting**: Multi-layer rate limiting (IP, wallet, global)
- **Admin Dashboard**: Complete admin interface with analytics
- **API Documentation**: Interactive Swagger UI documentation
- **Health Monitoring**: Comprehensive health checks and metrics
- **Security**: JWT authentication, API key management, input validation

### Infrastructure Features
- **AWS ECS Fargate**: Containerized deployment with auto-scaling
- **RDS PostgreSQL**: Managed database with automated backups
- **ElastiCache Redis**: High-performance caching and rate limiting
- **Application Load Balancer**: High availability with health checks
- **CloudWatch**: Comprehensive monitoring and alerting
- **Secrets Manager**: Secure secret management

### CI/CD Features
- **GitHub Actions**: Automated testing, building, and deployment
- **Terraform**: Infrastructure as Code with state management
- **Docker**: Multi-stage builds with security scanning
- **Environment Management**: Separate staging and production environments
- **Automated Rollbacks**: Failure detection and automatic rollbacks

## 📋 Quick Start

### Prerequisites
- AWS Account with appropriate permissions
- GitHub repository with Actions enabled
- Domain name (optional)
- Sui wallet private key for faucet operations

### 1. Clone Repository
```bash
git clone https://github.com/your-org/sui-faucet-core-node.git
cd sui-faucet-core-node
```

### 2. Bootstrap Infrastructure
```bash
# Configure AWS credentials
aws configure

# Bootstrap Terraform state management
./scripts/bootstrap-terraform.sh
```

### 3. Configure GitHub Secrets
Set up the following secrets in your GitHub repository:

**Required Secrets:**
- `AWS_ROLE_ARN`: IAM role for GitHub Actions
- `TF_STATE_BUCKET`: S3 bucket for Terraform state
- `TF_STATE_LOCK_TABLE`: DynamoDB table for state locking
- `SUI_FAUCET_PRIVATE_KEY`: Sui wallet private key
- `API_KEY`: API key for faucet requests
- `ADMIN_PASSWORD`: Admin panel password
- `JWT_SECRET`: JWT signing secret

See [GitHub Secrets Setup Guide](./docs/GITHUB_SECRETS_SETUP.md) for detailed instructions.

### 4. Deploy
```bash
# Push to main branch to trigger deployment
git push origin main

# Or manually trigger via GitHub Actions UI
```

## 🏗️ Architecture

### Application Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │────│   ECS Fargate   │────│   RDS PostgreSQL│
│                 │    │                 │    │                 │
│   - SSL/TLS     │    │   - Auto Scaling│    │   - Automated   │
│   - Health Check│    │   - Rolling     │    │     Backups     │
│   - WAF (opt)   │    │     Updates     │    │   - Multi-AZ    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐
                       │ ElastiCache     │
                       │ Redis           │
                       │                 │
                       │ - Rate Limiting │
                       │ - Session Store │
                       │ - Caching       │
                       └─────────────────┘
```

### CI/CD Pipeline
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Code      │    │   Build &   │    │ Infrastructure │    │   Deploy    │
│   Push      │───▶│   Test      │───▶│   Changes      │───▶│ Application │
│             │    │             │    │                │    │             │
│ - Lint      │    │ - Unit Test │    │ - Terraform    │    │ - ECS       │
│ - Security  │    │ - Build     │    │   Plan/Apply   │    │   Update    │
│ - Format    │    │ - Docker    │    │ - Security     │    │ - Health    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

## 📁 Project Structure

```
sui-faucet-core-node/
├── packages/backend/          # Node.js application
│   ├── src/
│   │   ├── routes/           # API routes
│   │   ├── services/         # Business logic
│   │   ├── middleware/       # Express middleware
│   │   └── config/           # Configuration
│   └── package.json
├── terraform/                # Infrastructure as Code
│   ├── main.tf              # Main Terraform configuration
│   ├── variables.tf         # Input variables
│   ├── outputs.tf           # Output values
│   ├── vpc.tf               # VPC and networking
│   ├── ecs.tf               # ECS cluster and service
│   ├── rds.tf               # PostgreSQL database
│   ├── elasticache.tf       # Redis cache
│   ├── load_balancer.tf     # Application Load Balancer
│   ├── iam.tf               # IAM roles and policies
│   ├── monitoring.tf        # CloudWatch monitoring
│   ├── security_groups.tf   # Security groups
│   ├── environments/        # Environment-specific configs
│   └── bootstrap/           # State management bootstrap
├── .github/workflows/        # GitHub Actions workflows
│   ├── ci.yml               # Continuous Integration
│   ├── terraform-plan.yml   # Infrastructure planning
│   ├── terraform-apply.yml  # Infrastructure deployment
│   └── deploy.yml           # Application deployment
├── docs/                    # Documentation
│   ├── DEPLOYMENT_GUIDE.md  # Deployment instructions
│   ├── GITHUB_SECRETS_SETUP.md # Secrets configuration
│   └── TROUBLESHOOTING.md   # Troubleshooting guide
├── monitoring/              # Monitoring configuration
│   ├── prometheus.yml       # Prometheus config
│   ├── alert_rules.yml      # Alert rules
│   └── grafana/             # Grafana dashboards
├── scripts/                 # Utility scripts
│   └── bootstrap-terraform.sh # Terraform bootstrap
├── Dockerfile               # Container definition
├── docker-compose.yml       # Local development
└── README.md               # This file
```

## 🔧 Configuration

### Environment Variables
The application supports the following environment variables:

**Database:**
- `DATABASE_URL`: PostgreSQL connection string
- `DB_POOL_SIZE`: Connection pool size (default: 10)

**Redis:**
- `REDIS_URL`: Redis connection string
- `REDIS_TTL`: Default TTL for cache entries

**Sui Network:**
- `SUI_NETWORK`: Network to connect to (testnet/devnet)
- `SUI_FAUCET_PRIVATE_KEY`: Private key for faucet wallet
- `SUI_RPC_URL`: Custom RPC URL (optional)

**Application:**
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment (development/production)
- `API_KEY`: API key for faucet requests
- `JWT_SECRET`: Secret for JWT token signing

**Rate Limiting:**
- `RATE_LIMIT_WINDOW_MS`: Rate limit window in milliseconds
- `RATE_LIMIT_MAX_PER_IP`: Max requests per IP per window
- `RATE_LIMIT_MAX_PER_WALLET`: Max requests per wallet per window

### Terraform Variables
Key Terraform variables for customization:

**Environment:**
- `environment`: Environment name (staging/production)
- `aws_region`: AWS region for deployment
- `project_name`: Project name for resource naming

**Compute:**
- `ecs_task_cpu`: CPU units for ECS tasks
- `ecs_task_memory`: Memory for ECS tasks
- `ecs_desired_count`: Number of running tasks

**Database:**
- `db_instance_class`: RDS instance type
- `db_allocated_storage`: Initial storage size
- `redis_node_type`: ElastiCache node type

## 🔍 Monitoring

### CloudWatch Dashboards
- **Application Metrics**: Request count, response time, error rate
- **Infrastructure Metrics**: CPU, memory, network usage
- **Database Metrics**: Connections, query performance
- **Custom Metrics**: Faucet requests, balance, rate limits

### Alerts
- High CPU/memory usage
- Application errors (5XX responses)
- Database connection issues
- Faucet balance low
- High request rate

### Log Analysis
```bash
# View application logs
aws logs tail /ecs/sui-faucet-staging --follow

# Search for errors
aws logs start-query \
  --log-group-name /ecs/sui-faucet-staging \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/'
```

## 🔒 Security

### Network Security
- All resources deployed in private subnets
- Security groups with minimal required access
- TLS encryption for all external communication
- Optional WAF protection

### Data Security
- Encryption at rest for RDS and ElastiCache
- Secrets stored in AWS Secrets Manager
- Regular security scanning in CI/CD pipeline
- Input validation and sanitization

### Access Control
- IAM roles with least privilege principle
- GitHub OIDC for secure CI/CD authentication
- API key authentication for faucet requests
- JWT tokens for admin authentication

## 🚀 Deployment

### Staging Environment
```bash
# Deploy to staging
git push origin develop

# Or manually trigger
gh workflow run "Deploy Application" --ref develop -f environment=staging
```

### Production Environment
```bash
# Deploy to production
git push origin main

# Or manually trigger with specific image
gh workflow run "Deploy Application" --ref main -f environment=production -f image_tag=v1.2.3
```

### Rollback
```bash
# Automatic rollback on deployment failure
# Or manual rollback via GitHub Actions UI
gh workflow run "Deploy Application" --ref main -f environment=production -f image_tag=previous-version
```

## 📚 Documentation

- [Deployment Guide](./docs/DEPLOYMENT_GUIDE.md) - Complete deployment instructions
- [GitHub Secrets Setup](./docs/GITHUB_SECRETS_SETUP.md) - Configure required secrets
- [Troubleshooting Guide](./docs/TROUBLESHOOTING.md) - Common issues and solutions
- [API Documentation](http://localhost:3001/docs) - Interactive Swagger UI (when running)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check the [docs](./docs/) directory
- **Issues**: Create a GitHub issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions
- **Security**: Report security issues privately to security@yourdomain.com
