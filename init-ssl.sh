#!/bin/bash
set -e

DOMAIN=${1:-example.com}
EMAIL=${2:-admin@example.com}

echo "🔐 Initializing SSL for $DOMAIN..."

# Create directories
mkdir -p nginx/ssl
mkdir -p certbot-data
mkdir -p certbot-www

# Start nginx first so certbot can reach it
docker compose up -d nginx

# Wait a moment for nginx to be ready
sleep 3

# Get initial certificate
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

echo "✅ SSL certificate obtained for $DOMAIN"

# Activate SSL in nginx config
sed -i "s/# server {/server {/g" nginx/nginx.conf
sed -i "s/#     listen 443 ssl http2;/    listen 443 ssl http2;/g" nginx/nginx.conf
sed -i "s/#     server_name .*/    server_name $DOMAIN;/g" nginx/nginx.conf
sed -i "s|#     ssl_certificate .*|    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;|g" nginx/nginx.conf
sed -i "s|#     ssl_certificate_key .*|    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;|g" nginx/nginx.conf
sed -i "s/#     location /{/    location \//{g" nginx/nginx.conf
sed -i "s/#         proxy_pass/        proxy_pass/g" nginx/nginx.conf
sed -i "s/#         proxy_http_version/        proxy_http_version/g" nginx/nginx.conf
sed -i "s/#         proxy_set_header/        proxy_set_header/g" nginx/nginx.conf
sed -i "s/#         proxy_cache_bypass/        proxy_cache_bypass/g" nginx/nginx.conf
sed -i "s/#     }/    }/g" nginx/nginx.conf
sed -i "s/# }/}/g" nginx/nginx.conf

echo "🔄 Restarting nginx with SSL..."
docker compose restart nginx

echo "✅ Done! Your app is now available at https://$DOMAIN"
