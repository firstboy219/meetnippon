#!/usr/bin/env bash
#
# The gate that must pass before anything is deployed: API TypeScript compile,
# the full API test suite, and a production build of each portal.
#
# There is no node_modules on this server — every build runs through Docker.
# Running `npx tsc` or `npx next build` over SSH instead downloads whatever
# major version npm feels like (it has pulled next@16 against a next@14 repo)
# and compiles nothing, while reporting success.
#
# Each image is tagged uniquely per run. A previous run's image must never be
# able to stand in for a build that just failed — that is exactly how a broken
# commit once passed this gate and the suite then exercised stale code.
#
# Usage: scripts/verify.sh [api|web-user|web-admin]...   (default: all)

set -uo pipefail
cd "$(dirname "$0")/.."

RUN="verify-$$-$(date +%s)"
NET=meetnippon_internal
DB_URL='postgresql://meetnippon:change_me_dev_only@db:5432/meetnippon?schema=public'
TARGETS=("$@")
[ ${#TARGETS[@]} -eq 0 ] && TARGETS=(api web-user web-admin)
FAILED=0

cleanup() { docker rmi -f "meetnippon-api:$RUN" >/dev/null 2>&1 || true; }
trap cleanup EXIT

has() { printf '%s\n' "${TARGETS[@]}" | grep -qx "$1"; }

if has api; then
  echo "==> api: TypeScript compile"
  if docker build --target build -t "meetnippon-api:$RUN" -f apps/api/Dockerfile . > /tmp/$RUN-api.log 2>&1; then
    echo "    ok"

    echo "==> api: test suite"
    # The suite needs the database. Its fixtures are namespaced to their own
    # test tenants, so this is safe to point at the live DB.
    BEFORE=$(docker exec meetnippon-db-1 psql -U meetnippon -d meetnippon -tAc 'select count(*) from "Booking";')
    docker run --rm --network "$NET" -e DATABASE_URL="$DB_URL" -e REDIS_URL='redis://redis:6379' \
      "meetnippon-api:$RUN" sh -c "cd /app/apps/api && npx jest --silent" 2>&1 | tail -6
    TESTS=${PIPESTATUS[0]}
    AFTER=$(docker exec meetnippon-db-1 psql -U meetnippon -d meetnippon -tAc 'select count(*) from "Booking";')
    echo "    bookings before/after: $BEFORE / $AFTER"
    [ "$BEFORE" = "$AFTER" ] || { echo "    !! the suite changed real data"; FAILED=1; }
    [ "$TESTS" -eq 0 ] || { echo "    !! tests failed"; FAILED=1; }
  else
    echo "    !! compile failed"
    grep -B6 'Found [0-9]* error' /tmp/$RUN-api.log | tail -25
    FAILED=1
  fi
fi

for portal in web-user web-admin; do
  has "$portal" || continue
  echo "==> $portal: production build (this is the portal's only typecheck gate)"
  if docker build --target prod -t "meetnippon-$portal:$RUN" -f "apps/$portal/Dockerfile" . > /tmp/$RUN-$portal.log 2>&1; then
    echo "    ok"
    docker rmi -f "meetnippon-$portal:$RUN" >/dev/null 2>&1 || true
  else
    echo "    !! build failed"
    grep -E 'Type error|error TS|Failed to compile' -A6 /tmp/$RUN-$portal.log | head -30
    FAILED=1
  fi
done

echo
if [ "$FAILED" -eq 0 ]; then echo "VERIFY OK"; else echo "VERIFY FAILED"; fi
exit "$FAILED"
