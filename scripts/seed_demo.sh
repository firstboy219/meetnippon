#!/usr/bin/env bash
# Seed rich demo data into the live DB. Mounts the seed file into the existing
# build image (no schema change → no rebuild). Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."
docker run --rm --network meetnippon_internal --env-file .env \
  -v "$PWD/apps/api/prisma/seed-demo.ts:/app/apps/api/prisma/seed-demo.ts:ro" \
  -w /app/apps/api meetnippon-api:build \
  npx ts-node --transpile-only prisma/seed-demo.ts
