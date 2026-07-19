#!/usr/bin/env bash
# Build + run the admin portal (standalone Next.js). Isolated stack only.
set -euo pipefail
cd "$(dirname "$0")/.."
NET=meetnippon_internal

echo "==> build web-admin image (standalone)"
docker build -f apps/web-admin/Dockerfile --target prod -t meetnippon-web-admin:prod .

docker rm -f meetnippon-web-admin >/dev/null 2>&1 || true
docker run -d --name meetnippon-web-admin --network "$NET" \
  -e NEXT_PUBLIC_API_URL=/api --memory 320m --memory-swap 320m \
  -p 127.0.0.1:8083:3000 --restart unless-stopped meetnippon-web-admin:prod

sleep 5
echo "-- /login status"; curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8083/login
echo "-- /login bytes";  curl -s http://127.0.0.1:8083/login | wc -c
echo "-- / (root)"; curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8083/
echo "==> web-admin DONE"
