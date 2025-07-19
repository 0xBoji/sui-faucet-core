#!/bin/bash

# Sui Faucet Deployment Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Configuration
APP_DIR="/opt/sui-faucet"
APP_NAME="sui-faucet"
BACKUP_DIR="/opt/sui-faucet/backups"
LOG_FILE="/opt/sui-faucet/logs/deploy.log"

# Create directories if they don't exist
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# Redirect all output to log file as well
exec > >(tee -a "$LOG_FILE")
exec 2>&1

log "Starting deployment of Sui Faucet..."

# Check if running as correct user
if [ "$USER" != "ubuntu" ]; then
    error "This script must be run as ubuntu user"
    exit 1
fi

# Check if application directory exists
if [ ! -d "$APP_DIR" ]; then
    error "Application directory $APP_DIR does not exist"
    exit 1
fi

cd "$APP_DIR"

# Create backup of current deployment
if [ -d "dist" ]; then
    log "Creating backup of current deployment..."
    BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME"
    cp -r dist/ "$BACKUP_DIR/$BACKUP_NAME/" || warning "Failed to create backup"
    
    # Keep only last 5 backups
    ls -t "$BACKUP_DIR" | tail -n +6 | xargs -r -I {} rm -rf "$BACKUP_DIR/{}"
fi

# Stop the application gracefully
log "Stopping application..."
if pm2 list | grep -q "$APP_NAME"; then
    pm2 stop "$APP_NAME" || warning "Failed to stop application with PM2"
fi

# Kill any remaining processes
pkill -f "node.*sui-faucet" || true

# Install/update dependencies
log "Installing dependencies..."
if [ -f "package.json" ]; then
    npm ci --production --silent || {
        error "Failed to install dependencies"
        exit 1
    }
else
    error "package.json not found"
    exit 1
fi

# Run database migrations if needed
log "Running database migrations..."
if [ -f "dist/scripts/migrate.js" ]; then
    node dist/scripts/migrate.js || warning "Database migration failed"
fi

# Update environment variables from AWS Systems Manager
log "Updating environment variables..."
if command -v aws &> /dev/null; then
    # Get environment variables from AWS Parameter Store
    aws ssm get-parameters-by-path \
        --path "/sui-faucet/prod/" \
        --recursive \
        --with-decryption \
        --query 'Parameters[*].[Name,Value]' \
        --output text | \
    while read -r name value; do
        # Remove the path prefix and convert to env var format
        env_name=$(echo "$name" | sed 's|/sui-faucet/prod/||' | tr '[:lower:]' '[:upper:]' | tr '-' '_')
        echo "$env_name=$value" >> .env.prod
    done 2>/dev/null || warning "Failed to fetch environment variables from AWS"
fi

# Validate configuration
log "Validating configuration..."
if [ -f ".env.prod" ]; then
    # Check required environment variables
    required_vars=("SUI_PRIVATE_KEY" "DATABASE_URL" "REDIS_URL" "API_KEY")
    for var in "${required_vars[@]}"; do
        if ! grep -q "^$var=" .env.prod; then
            error "Required environment variable $var is missing"
            exit 1
        fi
    done
else
    warning "Production environment file not found, using default .env"
fi

# Start the application
log "Starting application..."
if [ -f "ecosystem.config.js" ]; then
    # Use PM2 ecosystem file
    pm2 start ecosystem.config.js --env production || {
        error "Failed to start application with PM2"
        exit 1
    }
else
    # Fallback to direct PM2 start
    pm2 start dist/index.js \
        --name "$APP_NAME" \
        --instances 1 \
        --max-memory-restart 512M \
        --env production || {
        error "Failed to start application"
        exit 1
    }
fi

# Wait for application to start
log "Waiting for application to start..."
sleep 10

# Health check
log "Performing health check..."
max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
    if curl -f -s http://localhost:3001/api/v1/health > /dev/null; then
        success "Health check passed!"
        break
    fi
    
    if [ $attempt -eq $max_attempts ]; then
        error "Health check failed after $max_attempts attempts"
        
        # Show application logs for debugging
        log "Application logs:"
        pm2 logs "$APP_NAME" --lines 20 || true
        
        exit 1
    fi
    
    log "Health check attempt $attempt/$max_attempts failed, retrying in 5s..."
    sleep 5
    ((attempt++))
done

# Save PM2 configuration
pm2 save || warning "Failed to save PM2 configuration"

# Update system services
log "Updating system services..."
sudo systemctl daemon-reload || warning "Failed to reload systemd"

# Clean up old log files (keep last 7 days)
log "Cleaning up old log files..."
find /opt/sui-faucet/logs -name "*.log" -mtime +7 -delete 2>/dev/null || true

# Update file permissions
log "Updating file permissions..."
chown -R ubuntu:ubuntu "$APP_DIR" || warning "Failed to update file permissions"

# Show application status
log "Application status:"
pm2 status "$APP_NAME" || true

# Show final status
success "Deployment completed successfully!"
log "Application is running at: http://localhost:3001"
log "Health endpoint: http://localhost:3001/api/v1/health"
log "API documentation: http://localhost:3001/api/v1/docs"

# Send deployment notification (if configured)
if [ -n "$SLACK_WEBHOOK_URL" ]; then
    curl -X POST -H 'Content-type: application/json' \
        --data "{\"text\":\"🚀 Sui Faucet deployed successfully to production!\"}" \
        "$SLACK_WEBHOOK_URL" 2>/dev/null || warning "Failed to send Slack notification"
fi

log "Deployment script completed at $(date)"
