#!/usr/bin/env bash
# Phase 1 verification — build, migrate, seed, isolation tests, live API.
# Isolated stack only (project 'meetnippon'); never touches other services.
set -euo pipefail
cd "$(dirname "$0")/.."

NET=meetnippon_internal

echo "==> [1/7] .env"
if [ ! -f .env ]; then
  cp .env.example .env
  # replace dev JWT secrets with strong random ones
  ACC=$(openssl rand -hex 32); REF=$(openssl rand -hex 32)
  sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=${ACC}|"  .env
  sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${REF}|" .env
  echo "    wrote .env (generated JWT secrets)"
else
  echo "    .env exists, keeping it"
fi

echo "==> [2/7] db + redis up"
docker compose up -d db redis
# wait for db healthy
for i in $(seq 1 30); do
  if docker compose ps db | grep -q healthy; then echo "    db healthy"; break; fi
  sleep 2
done

echo "==> [3/7] build image (target=build)"
docker build -f apps/api/Dockerfile --target build -t meetnippon-api:build .

echo "==> [4/7] prisma migrate"
mkdir -p apps/api/prisma/migrations
# First run: no migration files yet -> create + apply 'init'. Later runs -> deploy.
if ls apps/api/prisma/migrations/*/migration.sql >/dev/null 2>&1; then
  MIGRATE_CMD="npx prisma migrate deploy"
else
  MIGRATE_CMD="npx prisma migrate dev --name init --skip-seed"
fi
echo "    $MIGRATE_CMD"
docker run --rm --network "$NET" --env-file .env \
  -v "$PWD/apps/api/prisma/migrations:/app/apps/api/prisma/migrations" \
  -w /app/apps/api meetnippon-api:build \
  sh -c "$MIGRATE_CMD"

echo "==> [5/7] seed"
docker run --rm --network "$NET" --env-file .env \
  -w /app/apps/api meetnippon-api:build npm run seed

echo "==> [6/7] tests (cross-tenant isolation + unit)"
docker run --rm --network "$NET" --env-file .env \
  -w /app/apps/api meetnippon-api:build npm test

echo "==> [7/7] build prod image + run API"
docker build -f apps/api/Dockerfile --target prod -t meetnippon-api:prod .
docker rm -f meetnippon-api >/dev/null 2>&1 || true
docker run -d --name meetnippon-api --network "$NET" --env-file .env \
  -p 127.0.0.1:8081:8081 --restart unless-stopped meetnippon-api:prod
sleep 4
echo "    health:  $(curl -s http://127.0.0.1:8081/api/health)"
echo "    ready:   $(curl -s http://127.0.0.1:8081/api/ready)"
echo "==> DONE"
