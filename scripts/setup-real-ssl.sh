#!/bin/bash

# Setup Real SSL with Let's Encrypt for custom domain
# Run this script on your EC2 instance after setting up DNS

set -e

# CHANGE THIS TO YOUR DOMAIN
DOMAIN="api.suifaucet.xyz"  # Your actual domain
EMAIL="hoangpichgoodkid@gmail.com"

echo "🔒 Setting up Real SSL for $DOMAIN"

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

# Install nginx if not already installed
if ! command -v nginx &> /dev/null; then
    echo "📦 Installing nginx..."
    $INSTALL_CMD nginx
fi

# Install certbot
if ! command -v certbot &> /dev/null; then
    echo "📦 Installing certbot..."
    if [ "$PKG_MANAGER" = "dnf" ]; then
        $INSTALL_CMD python3-pip
        sudo pip3 install certbot certbot-nginx
    else
        $INSTALL_CMD certbot python3-certbot-nginx
    fi
fi

# Stop nginx temporarily
echo "⏹️  Stopping nginx..."
sudo systemctl stop nginx

# Create directory for Let's Encrypt challenges
sudo mkdir -p /var/www/certbot

# Create temporary nginx config for domain verification
echo "📝 Creating temporary nginx configuration..."
sudo tee /etc/nginx/nginx.conf > /dev/null << EOF
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    server {
        listen 80;
        server_name $DOMAIN;
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        location / {
            proxy_pass http://127.0.0.1:3001;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
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

# Get SSL certificate
echo "🔐 Obtaining SSL certificate for $DOMAIN..."
sudo certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

# Create final nginx config with SSL
echo "📝 Creating final nginx configuration with SSL..."
sudo tee /etc/nginx/nginx.conf > /dev/null << EOF
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Logging
    log_format main '\$remote_addr - \$remote_user [\$time_local] "\$request" '
                    '\$status \$body_bytes_sent "\$http_referer" '
                    '"\$http_user_agent" "\$http_x_forwarded_for"';

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
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \$binary_remote_addr zone=faucet:10m rate=1r/m;

    # Upstream backend
    upstream backend {
        server 127.0.0.1:3001;
        keepalive 32;
    }

    # HTTP server (redirect to HTTPS)
    server {
        listen 80;
        server_name $DOMAIN;
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        location / {
            return 301 https://\$server_name\$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl;
        server_name $DOMAIN;

        # SSL configuration (Let's Encrypt)
        ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
        
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
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }

        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }

        # Root and other routes
        location / {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }
    }
}
EOF

# Test and reload nginx
echo "🧪 Testing final nginx configuration..."
sudo nginx -t

echo "🔄 Reloading nginx with SSL configuration..."
sudo systemctl reload nginx

# Setup auto-renewal
echo "🔄 Setting up auto-renewal..."
echo "0 12 * * * /usr/local/bin/certbot renew --quiet && /usr/bin/systemctl reload nginx" | sudo crontab -

# Test SSL certificate
echo "✅ Testing SSL certificate..."
curl -s https://$DOMAIN/api/v1/health | head -n 5

echo ""
echo "🎉 Real SSL setup complete!"
echo "Your API is now available at: https://$DOMAIN"
echo "✅ Trusted certificate - no browser warnings!"
echo ""
echo "Update your frontend .env:"
echo "VITE_FAUCET_API_BASE_URL=https://$DOMAIN"
EOF
