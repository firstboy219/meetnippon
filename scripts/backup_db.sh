#!/usr/bin/env bash
# Nightly logical backup of the MeetNippon Postgres (isolated container).
# Keeps 7 days. Writes to /opt/meetnippon/backups (created if missing).
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=/opt/meetnippon/backups
mkdir -p "$DIR"
STAMP=$(date -u +%Y%m%d_%H%M%S)
OUT="$DIR/meetnippon_$STAMP.sql.gz"

# db credentials from .env
set -a; . ./.env; set +a

docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$OUT"
echo "backup written: $OUT ($(du -h "$OUT" | cut -f1))"

# prune older than 7 days
find "$DIR" -name 'meetnippon_*.sql.gz' -mtime +7 -delete
