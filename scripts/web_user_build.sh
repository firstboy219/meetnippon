#!/usr/bin/env bash
# Build + run the user portal (standalone Next.js). Isolated stack only.
set -euo pipefail
cd "$(dirname "$0")/.."
NET=meetnippon_internal

echo "==> build web-user image (standalone)"
docker build -f apps/web-user/Dockerfile --target prod -t meetnippon-web-user:prod .

docker rm -f meetnippon-web-user >/dev/null 2>&1 || true
docker run -d --name meetnippon-web-user --network "$NET" \
  -e NEXT_PUBLIC_API_URL=/api --memory 320m --memory-swap 320m \
  -p 127.0.0.1:8082:3000 --restart unless-stopped meetnippon-web-user:prod

sleep 5
echo "-- /login status"; curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8082/login
echo "-- /login bytes";  curl -s http://127.0.0.1:8082/login | wc -c
echo "-- / (root, expect redirect 200/307)"; curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8082/
echo "==> web-user DONE"
