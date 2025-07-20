#!/bin/bash

# Setup SSL with Let's Encrypt for Sui Faucet
# Run this script on your EC2 instance

set -e

DOMAIN="ec2-13-211-123-118.ap-southeast-2.compute.amazonaws.com"
EMAIL="hoangpichgoodkid@gmail.com"

echo "🔒 Setting up SSL for $DOMAIN"

# Update system
echo "📦 Updating system packages..."
sudo apt update

# Install nginx if not already installed
if ! command -v nginx &> /dev/null; then
    echo "📦 Installing nginx..."
    sudo apt install -y nginx
fi

# Install certbot
if ! command -v certbot &> /dev/null; then
    echo "📦 Installing certbot..."
    sudo apt install -y certbot python3-certbot-nginx
fi

# Stop nginx temporarily
echo "⏹️  Stopping nginx..."
sudo systemctl stop nginx

# Create directory for Let's Encrypt challenges
sudo mkdir -p /var/www/certbot

# Copy nginx configuration
echo "📝 Copying nginx configuration..."
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
sudo nginx -t

# Start nginx
echo "▶️  Starting nginx..."
sudo systemctl start nginx
sudo systemctl enable nginx

# Get SSL certificate
echo "🔐 Obtaining SSL certificate..."
sudo certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

# Update nginx configuration to use SSL
echo "🔄 Reloading nginx with SSL configuration..."
sudo nginx -t && sudo systemctl reload nginx

# Setup auto-renewal
echo "🔄 Setting up auto-renewal..."
sudo crontab -l 2>/dev/null | { cat; echo "0 12 * * * /usr/bin/certbot renew --quiet && /usr/bin/systemctl reload nginx"; } | sudo crontab -

# Check SSL certificate
echo "✅ Checking SSL certificate..."
sudo certbot certificates

echo "🎉 SSL setup complete!"
echo "Your site should now be available at: https://$DOMAIN"
echo ""
echo "Next steps:"
echo "1. Update your frontend .env to use https://$DOMAIN"
echo "2. Test the API endpoints"
echo "3. Monitor nginx logs: sudo tail -f /var/log/nginx/access.log"
