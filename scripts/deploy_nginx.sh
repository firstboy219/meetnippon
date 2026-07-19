#!/usr/bin/env bash
# Additive prod vhost for meetnippon.cosger.online + TLS. Shared-server safe:
# writes ONLY its own vhost, validates config, and rolls back its symlink if the
# test fails so the co-hosted sites (apitoko/viewtoko/xtracker) are never at risk.
set -euo pipefail

DOMAIN=meetnippon.cosger.online
EMAIL=muhilhamps@gmail.com
VHOST=/etc/nginx/sites-available/$DOMAIN
LINK=/etc/nginx/sites-enabled/$DOMAIN

echo "==> writing vhost $VHOST"
sudo tee "$VHOST" > /dev/null <<'NGINX'
server {
    listen 80;
    server_name meetnippon.cosger.online;
    client_max_body_size 20m;

    # API (NestJS, global prefix /api)
    location /api/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Chat websocket
    location /socket.io/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # User portal (Next.js)
    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

echo "==> enabling + validating"
sudo ln -sf "$VHOST" "$LINK"
if ! sudo nginx -t; then
  echo "!! nginx -t FAILED — rolling back symlink, other sites untouched"
  sudo rm -f "$LINK"
  exit 1
fi
sudo systemctl reload nginx
echo "    http vhost live"

echo "==> certbot TLS (only this vhost)"
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

echo "==> verify"
sleep 2
curl -s -o /dev/null -w 'https / -> %{http_code}\n' https://$DOMAIN/
curl -s -w 'https /api/health -> %{http_code}\n' https://$DOMAIN/api/health
echo "==> other sites still OK:"
sudo nginx -t 2>&1 | tail -1
echo "==> DONE"
