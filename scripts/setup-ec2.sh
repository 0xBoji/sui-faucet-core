#!/bin/bash

# EC2 Initial Setup Script for Sui Faucet
# Run this script on your EC2 instance to prepare it for deployment

set -e

echo "🚀 Setting up EC2 instance for Sui Faucet deployment..."

# Update system
echo "📦 Updating system packages..."
sudo yum update -y

# Install required packages
echo "📦 Installing required packages..."
sudo yum install -y curl wget git htop

# Install Node.js 18
echo "📦 Installing Node.js 18..."
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Verify Node.js installation
echo "✅ Node.js version: $(node -v)"
echo "✅ NPM version: $(npm -v)"

# Install PM2 globally
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install Docker (optional, for Redis if needed)
echo "📦 Installing Docker..."
sudo yum install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Install Docker Compose
echo "📦 Installing Docker Compose..."
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Create application directory
echo "📁 Creating application directory..."
sudo mkdir -p /opt/sui-faucet
sudo chown -R ec2-user:ec2-user /opt/sui-faucet

# Create logs directory
sudo mkdir -p /var/log/sui-faucet
sudo chown -R ec2-user:ec2-user /var/log/sui-faucet

# Setup Redis (using Docker)
echo "🔧 Setting up Redis..."
cat > /tmp/docker-compose.yml << EOF
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    container_name: sui-faucet-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    
volumes:
  redis_data:
    driver: local
EOF

sudo mv /tmp/docker-compose.yml /opt/sui-faucet/
cd /opt/sui-faucet
sudo docker-compose up -d

# Setup firewall rules
echo "🔒 Configuring firewall..."
# Allow SSH (22), HTTP (80), HTTPS (443), and application port (3001)
sudo yum install -y firewalld
sudo systemctl start firewalld
sudo systemctl enable firewalld

sudo firewall-cmd --permanent --add-port=22/tcp
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload

# Setup log rotation
echo "📝 Setting up log rotation..."
sudo tee /etc/logrotate.d/sui-faucet > /dev/null << EOF
/var/log/sui-faucet/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 ec2-user ec2-user
    postrotate
        systemctl reload sui-faucet || true
    endscript
}
EOF

# Create health check script
echo "🏥 Creating health check script..."
cat > /opt/sui-faucet/health-check.sh << 'EOF'
#!/bin/bash

# Health check script for Sui Faucet
HEALTH_URL="http://localhost:3001/api/v1/health"
MAX_RETRIES=3
RETRY_DELAY=5

for i in $(seq 1 $MAX_RETRIES); do
    if curl -f -s $HEALTH_URL > /dev/null; then
        echo "✅ Health check passed"
        exit 0
    else
        echo "❌ Health check failed (attempt $i/$MAX_RETRIES)"
        if [ $i -lt $MAX_RETRIES ]; then
            sleep $RETRY_DELAY
        fi
    fi
done

echo "❌ Health check failed after $MAX_RETRIES attempts"
exit 1
EOF

chmod +x /opt/sui-faucet/health-check.sh

# Setup monitoring script
echo "📊 Creating monitoring script..."
cat > /opt/sui-faucet/monitor.sh << 'EOF'
#!/bin/bash

# Simple monitoring script
echo "=== Sui Faucet System Status ==="
echo "Date: $(date)"
echo ""

echo "=== Service Status ==="
systemctl status sui-faucet --no-pager -l

echo ""
echo "=== Resource Usage ==="
echo "CPU Usage:"
top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1

echo "Memory Usage:"
free -h

echo "Disk Usage:"
df -h /

echo ""
echo "=== Application Logs (last 10 lines) ==="
journalctl -u sui-faucet -n 10 --no-pager

echo ""
echo "=== Health Check ==="
/opt/sui-faucet/health-check.sh
EOF

chmod +x /opt/sui-faucet/monitor.sh

# Setup cron job for monitoring
echo "⏰ Setting up monitoring cron job..."
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/sui-faucet/health-check.sh >> /var/log/sui-faucet/health-check.log 2>&1") | crontab -

# Create backup script
echo "💾 Creating backup script..."
cat > /opt/sui-faucet/backup.sh << 'EOF'
#!/bin/bash

# Backup script for Sui Faucet
BACKUP_DIR="/opt/sui-faucet/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup application files
tar -czf $BACKUP_DIR/sui-faucet-$DATE.tar.gz \
    --exclude='backups' \
    --exclude='node_modules' \
    --exclude='*.log' \
    /opt/sui-faucet/

# Keep only last 7 backups
find $BACKUP_DIR -name "sui-faucet-*.tar.gz" -mtime +7 -delete

echo "✅ Backup created: sui-faucet-$DATE.tar.gz"
EOF

chmod +x /opt/sui-faucet/backup.sh

# Setup daily backup cron job
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/sui-faucet/backup.sh >> /var/log/sui-faucet/backup.log 2>&1") | crontab -

# Install Nginx (optional, for reverse proxy)
echo "🌐 Installing Nginx..."
sudo yum install -y nginx
sudo systemctl enable nginx

# Create Nginx configuration
sudo tee /etc/nginx/conf.d/sui-faucet.conf > /dev/null << EOF
server {
    listen 80;
    server_name _;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    
    location / {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Health check endpoint (bypass rate limiting)
    location /api/v1/health {
        proxy_pass http://localhost:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo nginx -t
sudo systemctl start nginx

echo ""
echo "🎉 EC2 setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Configure GitHub secrets with EC2 details"
echo "2. Push code to trigger deployment"
echo "3. Monitor deployment with: /opt/sui-faucet/monitor.sh"
echo ""
echo "🔧 Useful commands:"
echo "- Check service: sudo systemctl status sui-faucet"
echo "- View logs: journalctl -u sui-faucet -f"
echo "- Health check: /opt/sui-faucet/health-check.sh"
echo "- Monitor system: /opt/sui-faucet/monitor.sh"
echo "- Create backup: /opt/sui-faucet/backup.sh"
echo ""
echo "🌐 Access points:"
echo "- Direct: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3001"
echo "- Via Nginx: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)"
echo "- Health: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)/api/v1/health"
echo "- Docs: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)/docs"
