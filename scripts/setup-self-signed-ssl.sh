#!/bin/bash

# Setup Self-Signed SSL for Sui Faucet (Development/Testing)
# Run this script on your EC2 instance

set -e

DOMAIN="ec2-13-211-123-118.ap-southeast-2.compute.amazonaws.com"
SSL_DIR="/etc/nginx/ssl"

echo "🔒 Setting up Self-Signed SSL for $DOMAIN"

# Detect OS and set package manager
if command -v dnf &> /dev/null; then
    PKG_MANAGER="dnf"
    INSTALL_CMD="sudo dnf install -y"
    UPDATE_CMD="sudo dnf update -y"
elif command -v yum &> /dev/null; then
    PKG_MANAGER="yum"
    INSTALL_CMD="sudo yum install -y"
    UPDATE_CMD="sudo yum update -y"
elif command -v apt &> /dev/null; then
    PKG_MANAGER="apt"
    INSTALL_CMD="sudo apt install -y"
    UPDATE_CMD="sudo apt update"
else
    echo "❌ Unsupported OS"
    exit 1
fi

echo "📦 Detected package manager: $PKG_MANAGER"

# Update system
echo "📦 Updating system packages..."
$UPDATE_CMD

# Install nginx and openssl if not already installed
if ! command -v nginx &> /dev/null; then
    echo "📦 Installing nginx..."
    $INSTALL_CMD nginx
fi

if ! command -v openssl &> /dev/null; then
    echo "📦 Installing openssl..."
    $INSTALL_CMD openssl
fi

# Stop nginx temporarily
echo "⏹️  Stopping nginx..."
sudo systemctl stop nginx

# Create SSL directory
echo "📁 Creating SSL directory..."
sudo mkdir -p $SSL_DIR

# Generate private key
echo "🔑 Generating private key..."
sudo openssl genrsa -out $SSL_DIR/privkey.pem 2048

# Generate certificate signing request
echo "📝 Generating certificate signing request..."
sudo openssl req -new -key $SSL_DIR/privkey.pem -out $SSL_DIR/cert.csr -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"

# Generate self-signed certificate
echo "📜 Generating self-signed certificate..."
sudo openssl x509 -req -days 365 -in $SSL_DIR/cert.csr -signkey $SSL_DIR/privkey.pem -out $SSL_DIR/fullchain.pem

# Set proper permissions
sudo chmod 600 $SSL_DIR/privkey.pem
sudo chmod 644 $SSL_DIR/fullchain.pem

# Create nginx config for self-signed SSL
echo "📝 Creating nginx configuration for self-signed SSL..."
sudo tee /etc/nginx/nginx.conf > /dev/null << 'EOF'
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log;

    # Basic settings
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 4096;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=faucet:10m rate=1r/m;

    # Upstream backend
    upstream backend {
        server 127.0.0.1:3001;
        keepalive 32;
    }

    # HTTP server (redirect to HTTPS)
    server {
        listen 80;
        server_name ec2-13-211-123-118.ap-southeast-2.compute.amazonaws.com;
        
        # Redirect all traffic to HTTPS
        location / {
            return 301 https://$server_name$request_uri;
        }
    }

    # HTTPS server with self-signed certificate
    server {
        listen 443 ssl;
        server_name ec2-13-211-123-118.ap-southeast-2.compute.amazonaws.com;

        # SSL configuration (self-signed)
        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        
        # SSL settings
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

        # Security headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options DENY always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # API routes with rate limiting
        location /api/v1/faucet/request {
            limit_req zone=faucet burst=2 nodelay;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Documentation routes
        location /docs {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Root and other routes
        location / {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
EOF

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
sudo nginx -t

# Start nginx
echo "▶️  Starting nginx..."
sudo systemctl start nginx
sudo systemctl enable nginx

# Test HTTPS endpoint
echo "🧪 Testing HTTPS endpoint..."
curl -k -s https://$DOMAIN/api/v1/health | head -n 5

echo ""
echo "🎉 Self-Signed SSL setup complete!"
echo "Your site is now available at: https://$DOMAIN"
echo ""
echo "⚠️  WARNING: This uses a self-signed certificate."
echo "Browsers will show a security warning. This is normal for development."
echo ""
echo "To test with curl, use: curl -k https://$DOMAIN/api/v1/health"
echo "To use in frontend, you may need to accept the certificate in browser first."
