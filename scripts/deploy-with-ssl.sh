#!/bin/bash

# Deploy Sui Faucet with SSL support
# Run this script on your EC2 instance

set -e

PROJECT_DIR="/opt/sui-faucet"
DOMAIN="ec2-13-211-123-118.ap-southeast-2.compute.amazonaws.com"

echo "🚀 Deploying Sui Faucet with SSL support..."

# Navigate to project directory
cd $PROJECT_DIR

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# Install dependencies and build
echo "📦 Installing dependencies..."
npm ci --production

echo "🔨 Building project..."
npm run build

# Restart PM2 processes
echo "🔄 Restarting PM2 processes..."
pm2 restart ecosystem.config.js --env production

# Update nginx configuration if needed
if [ -f "nginx/nginx.conf" ]; then
    echo "📝 Updating nginx configuration..."
    sudo cp nginx/nginx.conf /etc/nginx/nginx.conf
    sudo nginx -t && sudo systemctl reload nginx
fi

# Check PM2 status
echo "📊 PM2 Status:"
pm2 status

# Check nginx status
echo "🌐 Nginx Status:"
sudo systemctl status nginx --no-pager

# Test endpoints
echo "🧪 Testing endpoints..."
echo "HTTP Health Check:"
curl -s http://localhost:3001/api/v1/health | jq .

echo ""
echo "HTTPS Health Check:"
curl -s https://$DOMAIN/api/v1/health | jq .

echo ""
echo "🎉 Deployment complete!"
echo "API available at: https://$DOMAIN"
echo "Documentation: https://$DOMAIN/docs"
