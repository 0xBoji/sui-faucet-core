# SSL Setup Guide

This guide explains how to set up HTTPS for your Sui Faucet API using Let's Encrypt and nginx.

## Prerequisites

- EC2 instance running Ubuntu
- Domain name pointing to your EC2 instance
- PM2 running your backend on port 3001
- Port 80 and 443 open in Security Group

## Quick Setup

### 1. Update Email in Setup Script

Edit `scripts/setup-ssl.sh` and change the email:
```bash
EMAIL="your-email@example.com"  # Change this to your email
```

### 2. Run Setup Script

```bash
# Make scripts executable
chmod +x scripts/setup-ssl.sh
chmod +x scripts/deploy-with-ssl.sh

# Run SSL setup
sudo ./scripts/setup-ssl.sh
```

### 3. Verify Setup

```bash
# Check SSL certificate
sudo certbot certificates

# Test HTTPS endpoint
curl -s https://ec2-13-211-123-118.ap-southeast-2.compute.amazonaws.com/api/v1/health
```

## Manual Setup Steps

If you prefer to set up manually:

### 1. Install nginx and certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Configure nginx (HTTP only first)

```bash
# Copy HTTP-only config
sudo cp nginx/nginx-http-only.conf /etc/nginx/nginx.conf

# Test and start nginx
sudo nginx -t
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 3. Get SSL certificate

```bash
# Create directory for Let's Encrypt
sudo mkdir -p /var/www/certbot

# Get certificate
sudo certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email your-email@example.com \
    --agree-tos \
    --no-eff-email \
    -d ec2-13-211-123-118.ap-southeast-2.compute.amazonaws.com
```

### 4. Update nginx for HTTPS

```bash
# Copy HTTPS config
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Setup auto-renewal

```bash
# Add cron job for certificate renewal
sudo crontab -l 2>/dev/null | { cat; echo "0 12 * * * /usr/bin/certbot renew --quiet && /usr/bin/systemctl reload nginx"; } | sudo crontab -
```

## Security Group Configuration

Make sure your EC2 Security Group allows:

- **Port 80 (HTTP)**: For Let's Encrypt challenges and redirects
- **Port 443 (HTTPS)**: For secure API access
- **Port 22 (SSH)**: For server management

## Testing

### Test HTTP redirect
```bash
curl -I http://ec2-13-211-123-118.ap-southeast-2.compute.amazonaws.com
# Should return 301 redirect to HTTPS
```

### Test HTTPS API
```bash
curl -s https://ec2-13-211-123-118.ap-southeast-2.compute.amazonaws.com/api/v1/health
```

### Test CORS
```bash
curl -v -H "Origin: http://localhost:3000" \
     -H "x-api-key: suisuisui" \
     https://ec2-13-211-123-118.ap-southeast-2.compute.amazonaws.com/api/v1/faucet/status
```

## Troubleshooting

### Certificate Issues
```bash
# Check certificate status
sudo certbot certificates

# Renew certificate manually
sudo certbot renew --dry-run
```

### nginx Issues
```bash
# Check nginx status
sudo systemctl status nginx

# Check nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### PM2 Issues
```bash
# Check PM2 status
pm2 status

# Check PM2 logs
pm2 logs
```

## Deployment

After SSL setup, use the deployment script:

```bash
./scripts/deploy-with-ssl.sh
```

This will:
- Pull latest code
- Build the project
- Restart PM2
- Update nginx config
- Test endpoints

## Certificate Renewal

Certificates auto-renew via cron job. To check:

```bash
# Check cron jobs
sudo crontab -l

# Test renewal
sudo certbot renew --dry-run
```
