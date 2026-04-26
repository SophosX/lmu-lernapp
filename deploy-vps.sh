#!/bin/bash
set -e

# LMU Lernapp - Direktes VPS Deployment (ohne GitHub/Registry)
# Ausführen auf dem VPS via SSH

echo "🚀 LMU Lernapp direktes Deployment"

APP_DIR="/opt/lmu-lernapp"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Code vom OpenClaw-Container herunterladen (temporärer Download-Link nötig)
# Alternative: Code manuell per SCP hochladen

if [ ! -f "Dockerfile" ]; then
  echo "❌ Bitte zuerst den App-Code in $APP_DIR entpacken:"
  echo "   tar -xzf lmu-lernapp-deploy.tar.gz -C $APP_DIR"
  exit 1
fi

# Docker Compose mit Traefik (lokaler Build)
cat > docker-compose.yml <<'EOF'
version: "3.8"

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: lmu-lernapp
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=8787
    volumes:
      - app-data:/app/data-store
    networks:
      - traefik
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.lmu-lernapp.rule=Host(`${LERNAPP_DOMAIN:-lernen.localhost}`)"
      - "traefik.http.routers.lmu-lernapp.entrypoints=websecure"
      - "traefik.http.routers.lmu-lernapp.tls.certresolver=letsencrypt"
      - "traefik.http.services.lmu-lernapp.loadbalancer.server.port=8787"

volumes:
  app-data:

networks:
  traefik:
    external: true
EOF

# Prüfen ob Traefik-Netzwerk existiert
if ! docker network ls | grep -q traefik; then
  echo "⚠️  Traefik-Netzwerk nicht gefunden. Erstelle es..."
  docker network create traefik
fi

# Build & Deploy
echo "🔨 Baue Docker-Image..."
docker compose down 2>/dev/null || true
docker compose build --no-cache

echo "🚀 Starte App..."
LERNAPP_DOMAIN="${LERNAPP_DOMAIN:-lernen.sustinerin.de}" docker compose up -d

echo "✅ Deployment abgeschlossen!"
echo "📍 App läuft auf Port 8787 (intern)"
echo "📍 Traefik routed von außen"
echo "📍 Domain: ${LERNAPP_DOMAIN:-lernen.sustinerin.de}"
echo ""
echo "Logs: docker compose logs -f app"
echo "Stop: docker compose down"
