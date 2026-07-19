#!/usr/bin/env bash
# Apply prod hardening to the running isolated stack (idempotent, additive).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> memory limits on app containers"
docker update --memory 512m --memory-swap 512m meetnippon-api        >/dev/null 2>&1 || true
docker update --memory 320m --memory-swap 320m meetnippon-web-user   >/dev/null 2>&1 || true
docker update --memory 320m --memory-swap 320m meetnippon-web-admin  >/dev/null 2>&1 || true

echo "==> apply db/redis mem_limit (recreate from compose)"
docker compose up -d db redis

echo "==> install nightly backup cron (02:30 UTC), idempotent"
CRON_LINE="30 2 * * * /opt/meetnippon/scripts/backup_db.sh >> /opt/meetnippon/backups/backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'meetnippon/scripts/backup_db.sh' ; echo "$CRON_LINE" ) | crontab -
echo "    cron installed"

echo "==> first backup run"
bash scripts/backup_db.sh

echo "==> current memory usage"
docker stats --no-stream --format '{{.Name}}  {{.MemUsage}}  {{.MemPerc}}' | grep meetnippon
echo "==> free -m"; free -m | awk 'NR<=2'
echo "==> DONE"
