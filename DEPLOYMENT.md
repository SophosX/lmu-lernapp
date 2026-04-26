# Deployment

## Option 1: Node.js direkt

```bash
cd apps/lmu-lernapp
npm install
npm run build
NODE_ENV=production PORT=8787 node server.js
```

Die App ist dann unter `http://localhost:8787` erreichbar.

## Option 2: Docker

```bash
cd apps/lmu-lernapp
docker build -t lmu-lernapp .
docker run -p 8787:8787 lmu-lernapp
```

## Option 3: Docker Compose

```yaml
version: "3.8"
services:
  lmu-lernapp:
    build: .
    ports:
      - "8787:8787"
    volumes:
      - ./data-store:/app/data-store
    environment:
      - NODE_ENV=production
      - PORT=8787
```

## Option 4: Hostinger VPS mit Docker Compose (Empfohlen)

### Voraussetzungen
- Hostinger VPS mit Docker & Docker Compose installiert
- Domain/Subdomain, die auf die VPS-IP zeigt
- SSH-Zugang zum Server

### Schritt 1: Code auf den Server bringen

```bash
# Option A: Git clone
git clone <dein-repo> /opt/lmu-lernapp
cd /opt/lmu-lernapp/apps/lmu-lernapp

# Option B: Oder lokal bauen und hochladen
# scp -r . root@deine-ip:/opt/lmu-lernapp/
```

### Schritt 2: Erstmalig starten

```bash
cd /opt/lmu-lernapp/apps/lmu-lernapp
chmod +x deploy.sh init-ssl.sh
./deploy.sh
```

Die App läuft jetzt auf Port 80 (HTTP).

### Schritt 3: SSL-Zertifikat erstellen

```bash
# Ersetze die Domain und E-Mail
./init-ssl.sh lernen.deinedomain.de admin@deinedomain.de
```

Danach die Nginx-Config auf SSL umstellen (siehe `nginx/nginx.conf` — auskommentierten SSL-Block aktivieren).

### Schritt 4: Hostinger Firewall

In Hostinger Panel → VPS → Firewall:
- Port 80 (HTTP) erlauben
- Port 443 (HTTPS) erlauben
- Port 22 (SSH) erlauben
- Alle anderen Ports blockieren

### Schritt 5: Domain einrichten

In Hostinger DNS:
- A-Record: `lernen.deinedomain.de` → `deine-vps-ip`
- Warte 5–15 Minuten auf DNS-Propagation

### Wichtige Hinweise

- Die API und das Frontend laufen auf demselben Port (SPA-Routing).
- Uploads und Tutor-Sessions werden in `data-store/` persistiert.
- Für Audio-Transkription muss das `scripts/journal_voice_note.sh`-Skript im Container verfügbar sein.
- Updates: `./deploy.sh` erneut ausführen — Daten bleiben erhalten.
- Logs einsehen: `docker compose logs -f app`
- App stoppen: `docker compose down`
# Deployment ready
