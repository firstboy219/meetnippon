# PROGRESS.md — MeetNippon Execution Log

> Source of truth for phase continuation. Autonomous mode (owner-approved): continue phase→phase after each QC gate; stop only for the 5 escalation conditions (roadmap ch.3).

**Repo:** `C:\Users\020159\Projects\MeetNippon\app` (monorepo)
**Deploy target:** meetnippon.cosger.online @ 13.212.182.48
**Docs:** BRD (authoritative) + Roadmap + 2 mockups + SERVER_AUDIT.md — all in `../KnowledgeBase`

---

## Active phase: Phase 5 — Identity & calendar integrations (starting)

## Phase status

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Server audit & safe deploy plan | ✅ DONE (2026-07-18) |
| 1 | Foundation: repo, Docker, multi-tenant DB, auth+domain routing, i18n, audit log | ✅ DONE (2026-07-19) |
| 2 | Booking core & rule engine | ✅ DONE (2026-07-19) |
| 3 | User Portal web | ✅ DONE (2026-07-19) |
| 4 | Admin Portal web | ✅ DONE (2026-07-19) |
| 5 | Identity & calendar integrations | ⬜ |
| 6 | Advanced modules (chat, approval hub, WFH, recording, WA) | ⬜ |
| 7 | Analytics, migration, hardening, prod deploy | ⬜ |
| 8 | Android native | ⬜ |
| 9 | iOS native | ⬜ |
| 10 | Billing & self-service onboarding | ⬜ |

---

## Phase 4 — DONE (2026-07-19)

Admin API + Admin Portal (Next.js standalone) live on `127.0.0.1:8083`. All 5 containers healthy.
QC gate:
- [x] **Admin API** (`src/admin/*`, all `@Roles('ADMIN')` + JWT, tenant-scoped, audited): location hierarchy CRUD (office/building/floor), resource CRUD (+status), user mgmt (create w/ temp-password handoff, role, activate/deactivate w/ self-guard, reset pw), branding update (subdomain validation + global-uniqueness), overview (`/admin/bookings`, `/admin/audit`, `/admin/stats`)
- [x] **401/403 fix**: global RolesGuard now returns 401 when unauthenticated, 403 when wrong role (was 403 for both)
- [x] Tests: 5 suites / **35 tests** green incl. admin CRUD, self-deactivation guard, email-uniqueness, subdomain validation, admin tenant isolation
- [x] HTTP smoke: admin endpoints 200/201, employee→403, unauth→401
- [x] **Admin Portal** (`apps/web-admin`, standalone, port 8083, admin-only login guard): dashboard (stats + recent bookings), resources (CRUD table + modal), users (create/role/activate + temp-pw reveal), policies (list + rule editor: approval/duration/buffer/advance/quota/check-in), branding (color pickers + live preview), bookings (status filter), audit log
- [x] Verified: `/login` renders admin console (5.9KB, markers), `/`→307, Next ready; reuses proven design system + api/auth/i18n/toast infra

DEFERRED (API ready, UI later): office/building/floor management screens (only resource+policy+user+branding UIs shipped this pass); resource create can set floorId directly.

## Phase 3 — DONE (2026-07-19)

User Portal (Next.js 14 app router) built as standalone image and running on `127.0.0.1:8082`.
QC gate:
- [x] Next.js 14 app, TS strict, standalone output (`outputFileTracingRoot` = repo root); Debian-slim Dockerfile (dev/build/prod), `NODE_OPTIONS=--max-old-space-size=1536` (3.7GB OOM guard)
- [x] Design system ported from binding mockup (`globals.css`): teal/coral tokens, Space Grotesk+Inter, sidebar/topbar/cards/swatch/toast/modal
- [x] **Runtime theming**: AuthProvider fetches `/api/tenant/branding` (by host) → sets `--teal`/`--coral` from primaryColor/accentColor
- [x] **i18n EN/ID** dictionary + toggle (persisted); **auth** context (login/refresh tokens in localStorage, `/auth/me` bootstrap, guarded `(app)` layout → redirect to /login)
- [x] Branded **login** (workspace field in shared-URL mode), **dashboard** (stats + upcoming from `/bookings`), **book** (resource grid + booking modal → `/bookings`), **my bookings** (table + cancel), **approvals** inbox (list + approve/reject)
- [x] New API: user-facing `GET /api/resources` (+ `:id`), tenant-scoped, JWT-guarded — verified 200 (rooms/desks) / 401 unauth
- [x] Verified: `/login` renders full app (5.9KB, markers present), `/` → 307→/dashboard, Next ready; API still 29/29 tests green after adding resources module
- [x] All 4 containers healthy (web-user, api, db, redis); isolated stack, other server projects untouched

NOTE: portal is client-rendered; browser calls API at `NEXT_PUBLIC_API_URL` (default `/api`, nginx same-origin in Phase 7). Full click-through browser test deferred to Phase 7 (nginx) — SSR render + each dependent API endpoint verified independently. Chat/Denah/Kalender/WFH/presence are later phases (nav not yet shown for those).

## Phase 2 — DONE (2026-07-19)

Booking core + rule engine, verified on server (29/29 tests) and end-to-end via HTTP.
QC gate:
- [x] **Rule engine (BRD 7.3):** `PolicyRules` schema + defaults; pure 3-level resolver TENANT←CATEGORY←ROOM (`mergeRules`); policy CRUD service + admin `/api/policies` (GET/PUT/DELETE + effective preview)
- [x] **Booking core (BRD 7.4):** create with full policy validation (duration/advance/business-hours/external/recurring/daily-quota), conflict detection with buffer, delegate booking (admin-on-behalf), cancel, check-in token, `list mine`, availability
- [x] Recurrence expansion (DAILY/WEEKLY, all-or-nothing conflict pre-check)
- [x] **Approval flow:** approval steps created when policy requires; approver `/api/approvals` list + decide; booking status recomputed (REJECTED if any / APPROVED if all)
- [x] All booking/policy/approval endpoints under tenant-isolation guard + JWT; roles enforced (ADMIN policies, APPROVER/ADMIN decide)
- [x] Tests green (4 suites, 29 tests): rule-merge precedence, slot validation, business hours, occurrences, conflict, approval end-to-end, policy rejection, **cross-tenant booking isolation**
- [x] HTTP smoke: booking 201/APPROVED, overlap 409, availability, ONLINE no-resource, policy upsert 200, unauth 401
- [x] No schema change (all models existed from Phase 1) → migrate deploy no-op

Modules: `apps/api/src/booking/{booking,approval}.*` + `booking/policy/*`; pure helpers in `booking.rules.ts` + `policy/policy.types.ts`. Time model = UTC wall-clock (per-tenant tz = later hardening).

## Phase 1 — DONE (2026-07-19)

Foundation built & verified end-to-end on the server (isolated `meetnippon` stack).
QC gate:
- [x] Monorepo + Docker Compose (own postgres/redis, internal-only; host ports 8081–8085)
- [x] Full multi-tenant Prisma schema (all BRD models) + initial migration `20260719004927_init` (applied)
- [x] Tenant isolation: AsyncLocalStorage context + Prisma `$extends` guard (read scope / create stamp / write pre-check / fail-closed)
- [x] **Cross-tenant leakage tests green** (9/9 tests pass) — the non-negotiable
- [x] Auth: login/refresh/me, argon2, JWT access+refresh, role guards; verified 200/401/400 paths
- [x] Domain routing: Host→tenant resolver (custom domain / subdomain+redirect / shared-URL slug) + public `/api/tenant/branding`
- [x] i18n foundation (EN default/ID) in `packages/shared`; audit log writer on auth events
- [x] Live API on `127.0.0.1:8081`: `/api/health` ok, `/api/health/ready` db up
- [x] Seed: PT Nipsea tenant + branding + ADMIN (`admin@nipsea.co.id`) + sample room/desk

**Build/verify workflow (reusable):** `scripts/phase1_verify.sh` — build image, migrate, seed, test, prod image, run. Migrations authored on server (local has no Node), pulled back into repo.

## Phase 0 — DONE

Evidence in `../KnowledgeBase/SERVER_AUDIT.md`. QC gate:
- [x] SERVER_AUDIT.md complete with evidence (items 1–10)
- [x] DO NOT TOUCH list enumerates every existing vhost & service
- [x] Free ports chosen & double-verified (reserved block **8081–8085**)
- [x] DNS A-record `meetnippon.cosger.online` → 13.212.182.48 resolves ✓

## Escalations / pending decisions

- **ESC-1 (wildcard DNS):** `*.meetnippon.cosger.online` does not resolve. Needed for tenant-subdomain mode only. Shipping shared-URL mode meanwhile. → request 1 wildcard A/CNAME record from owner before Phase 7 subdomain enablement.
- **RISK R1 (server RAM 3.7 GB):** at Phase 7, build Next.js images locally, not on server; set mem_limits; watch OOM vs other projects.
- **Housekeeping:** stale root cron `/opt/geoscan/scripts/backup_db.sh` (geoscan deleted) — clean separately, non-blocking.
- **Third-party creds (anticipated, Phase 5–6):** Azure AD, Google OAuth, WhatsApp, Speech-to-Text, production SMTP — will proceed with mocks/flags and request when reached.

## Key technical decisions

- (Phase 0) Reserved host ports 8081–8085. Own postgres/redis stay internal to compose network (no host bind, no reuse of shared 5432).
- (Phase 0) Autonomous execution mode confirmed by owner; repo at `Projects\MeetNippon\app`.
- **(Phase 1) ENV DECISION — build fully on server:** local machine has no Node/git/Docker; owner chose to run all dev/build/runtime ON the AWS server. Workflow: author files in local mirror `Projects\MeetNippon\app`, `scp` to `/opt/meetnippon`, execute (npm/docker/git/tests) via SSH on server. Server toolchain: node v22.22, npm 10.9, git 2.43, docker 29.5, compose v5.1 (no-sudo). Shared-server safety rules (roadmap 2.1) still strictly enforced; stack fully isolated (own network, internal DB/redis, ports 8081–8085). RAM 3.7 GB → build web apps one at a time, watch OOM.
- (Phase 1) Package manager: **npm workspaces** (pnpm not installed). Stack: NestJS 10 + Prisma 5 + PG16 + Redis7 (BullMQ) + Next.js 14 (app router) ×2.
- **(Phase 1) Build gotchas locked in** (so later phases don't repeat): api `tsconfig` uses `rootDir:./src`, `include:["src/**/*"]` only (prisma/seed via `ts-node --transpile-only`); do NOT add a `paths` alias to `@meetnippon/shared` **source** — it must resolve as a built dep (node_modules symlink → `dist`), else nest build hits TS6059. Dockerfile is Debian slim (clean Prisma+argon2 binaries), builds `@meetnippon/shared` before `prisma generate`. Prisma one-off tasks run via `docker run` on network `meetnippon_internal` (NOT `docker compose run`, whose dev bind-mount shadows node_modules).
- (Phase 1) Health routes: `/api/health` (live) and `/api/health/ready` (db check). Global prefix `api`.
