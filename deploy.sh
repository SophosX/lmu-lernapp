#!/bin/bash
set -e

echo "🚀 Deploying LMU Lernapp..."

# Build and start all services
docker compose down
docker compose build --no-cache
docker compose up -d

echo "✅ App deployed!"
echo "📍 HTTP: http://$(curl -s ifconfig.me || echo 'your-server-ip')"
echo "📍 Check status: docker compose ps"
echo "📍 Logs: docker compose logs -f app"
echo ""
echo "💡 Next step: Run ./init-ssl.sh yourdomain.de your@email.de for HTTPS"
