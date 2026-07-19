#!/usr/bin/env bash
# Additive prod vhost for admin.meetnippon.cosger.online + TLS. Same shared-server
# safety as the user vhost: writes only its own file, validates, rolls back on failure.
set -euo pipefail

DOMAIN=admin.meetnippon.cosger.online
EMAIL=muhilhamps@gmail.com
VHOST=/etc/nginx/sites-available/$DOMAIN
LINK=/etc/nginx/sites-enabled/$DOMAIN

echo "==> DNS check for $DOMAIN"
IP=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)
echo "    resolves to: ${IP:-<none>}"
if [ "$IP" != "13.212.182.48" ]; then
  echo "!! $DOMAIN does not resolve to 13.212.182.48 yet (DNS still propagating). Aborting before certbot."
  exit 2
fi

echo "==> writing vhost $VHOST"
sudo tee "$VHOST" > /dev/null <<'NGINX'
server {
    listen 80;
    server_name admin.meetnippon.cosger.online;
    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Admin portal (Next.js) on 8083
    location / {
        proxy_pass http://127.0.0.1:8083;
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

echo "==> certbot TLS (only this vhost)"
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

echo "==> verify"
sleep 2
curl -s -o /dev/null -w 'https /login -> %{http_code}\n' https://$DOMAIN/login
curl -s -w 'https /api/health -> %{http_code}\n' -o /dev/null https://$DOMAIN/api/health
sudo nginx -t 2>&1 | tail -1
echo "==> DONE"
