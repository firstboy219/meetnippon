# PROGRESS.md — MeetNippon Execution Log

> Source of truth for phase continuation. Autonomous mode (owner-approved): continue phase→phase after each QC gate; stop only for the 5 escalation conditions (roadmap ch.3).

**Repo:** `C:\Users\020159\Projects\MeetNippon\app` (monorepo)
**Deploy target:** meetnippon.cosger.online @ 13.212.182.48
**Docs:** BRD (authoritative) + Roadmap + 2 mockups + SERVER_AUDIT.md — all in `../KnowledgeBase`

---

## Active phase: Phases 8–9 (Android/iOS native) — **pended by owner**; separate mobile track, needs mobile toolchain (not this server). All WEB phases (0–7, 10) DONE, plus UI-1 (hardening), TZ-1 (per-tenant timezone), CAL-1 (Kalender & Riwayat), LOC-1 (Lokasi & Denah admin).

**🟢 LIVE IN PRODUCTION:** https://meetnippon.cosger.online (user portal) + https://admin.meetnippon.cosger.online (admin portal) — API + chat WS, Let's Encrypt TLS on both.

**DEMO-READY (2026-07-19):** pilot tenant `nipsea` fully populated via `scripts/seed_demo.sh` (`prisma/seed-demo.ts`, idempotent) — 5+ users, 7 rooms/desks across floors, policies (VIP needs approval), bookings (past/upcoming/pending), approval-hub tasks, chat + messages, notifications, WFH logs. **All feature flags ON** (chat, calendar_sync, recording, whatsapp, sso_microsoft — mock; plan PRO). First-login **welcome wizard** on both portals (localStorage `mn_tour_v1`/`mn_admin_tour_v1`, replay via "?" in topbar). Demo logins: `admin@nipsea.co.id`/`ChangeMe123!`; `dina|budi|siti|eko@nipsea.co.id`/`Password123!`.

## Phase status

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Server audit & safe deploy plan | ✅ DONE (2026-07-18) |
| 1 | Foundation: repo, Docker, multi-tenant DB, auth+domain routing, i18n, audit log | ✅ DONE (2026-07-19) |
| 2 | Booking core & rule engine | ✅ DONE (2026-07-19) |
| 3 | User Portal web | ✅ DONE (2026-07-19) |
| 4 | Admin Portal web | ✅ DONE (2026-07-19) |
| 5 | Identity & calendar integrations | ✅ DONE — scaffold w/ mocks+flags (2026-07-19) |
| 6 | Advanced modules (chat, approval hub, WFH, recording, WA) | ✅ DONE — chat/hub/WFH real; recording/WA mock+flags (2026-07-19) |
| 7 | Analytics, migration, hardening, **prod deploy** | ✅ DONE — live w/ TLS; migration bulk-import deferred (2026-07-19) |
| 8 | Android native | ⬜ separate mobile track |
| 9 | iOS native | ⬜ separate mobile track |
| 10 | Billing & self-service onboarding | ✅ DONE — onboarding real; billing plans/limits real, payment mock (2026-07-19) |
| UI-1 | QA UI audit + hardening pass (both portals) | ✅ DONE (2026-07-20) |
| TZ-1 | Per-tenant timezone (retires the UTC wall-clock model) | ✅ DONE (2026-07-20) |
| CAL-1 | Calendar (Kalender) + History (Riwayat) views, booking list filters | ✅ DONE (2026-07-20) |
| LOC-1 | Admin Locations & floor plans (Denah) + geofence UI | ✅ DONE (2026-07-20) |
| UP-1 | Image upload (floor plans), verify gate, stray-data cleanup | ✅ DONE (2026-07-20) |

---

## UP-1 — Image upload + build gate — DONE (2026-07-20)

Owner asked for the three items left open at the end of LOC-1. **91/91 tests pass** (10 new).

**1 — Image upload.** `POST /api/uploads` (ADMIN) + `GET /api/uploads/:tenant/:file`. Files land on a host bind mount (`/opt/meetnippon/uploads` → `/app/uploads`) so they survive a container replace; the API container now runs with that volume and `UPLOAD_DIR`.
- **Served by the API, not nginx.** The API already owns the `/api` prefix, so no nginx rule was added — worth preserving on a shared server where the config is not ours alone.
- **Content decides the type, not the client.** The declared mimetype is ignored; the leading bytes must match PNG/JPEG/GIF/WebP, and the stored extension comes from that check. HTML wearing a `.png` name is rejected.
- **SVG is refused outright** — it is an executable document, and serving one from the platform's own origin would let an uploader run script against a console session.
- Stored names are 128-bit random; the client's filename never reaches disk. 5 MB cap. Serving sets `nosniff` and immutable caching.
- The serve route pattern-checks both path segments and confirms the resolved path stays under the upload root, so a crafted `..` cannot walk out.
- **Serving is unauthenticated by design**: an `<img>` cannot carry a bearer token, so access rests on the unguessable name. That is the usual bargain, but it means nothing sensitive belongs in this bucket — recorded here so the next person does not assume otherwise.

**2 — `scripts/verify.sh`** now holds the build gate, replacing ad-hoc SSH one-liners. It tags every image uniquely per run, so a previous run's image can never stand in for a build that just failed (that is precisely how a broken commit passed and then ran its tests against stale code). It also asserts the suite did not change the live `Booking` count.

**3 — Stray data removed** (owner-approved): the two `HQ Smoke` offices from the 2026-07-19 smoke test. Both had NULL coordinates and no buildings, so they never affected geofence classification. The delete was constrained to that name *and* null coordinates *and* zero buildings; `HQ Jakarta` plus 1 building / 5 floors / 11 resources verified intact afterwards. The smoke-test upload was deleted too.

**Verified live** — genuine PNG uploads and serves with the right headers; HTML-as-PNG and SVG both 400; unauthenticated 401 and EMPLOYEE 403; four traversal attempts all fail to return a file; the image still serves after `docker restart` (proving the volume).

---

## LOC-1 — Lokasi & Denah (admin) — DONE (2026-07-20)

The geofence engine and Office→Building→Floor CRUD already existed and were tested; what was missing was **any UI to reach them** and the floor-plan half of the model. **81/81 tests pass** (4 new).

**API**
- `GET|PUT /admin/floors/:id/plan` — the `FloorPlan` model (`imageUrl` + `pins`) had no endpoints at all. GET returns the plan *plus the resources on that floor*, so the editor needs one request.
- **Pins are fractions of the image (0..1), not pixels** — swapping in a plan at a different resolution leaves every pin where the admin put it.
- A pin may only reference a resource **actually on that floor**; a stale or hand-crafted payload otherwise plants another floor's desk (or another tenant's id) onto the plan. Duplicate pins for one resource are rejected too.
- `listFloors` now includes building name, plan presence and a resource count, so the table renders without a request per row.
- Office DTO tightened: `lat`/`lng` bounded to real ranges and `geofenceRadiusM` to 10..100000. An out-of-range office silently never matches any geofence, which presents as broken WFH detection rather than as bad data. `isActive` is now settable.

**Admin UI — `/locations`** — tabbed Offices / Buildings / Floors.
- Offices carry the geofence: coordinates, radius, active flag, a "use my current location" helper, and a privacy note stating what the platform stores. Coordinates are **all-or-nothing** (half a pair can never match), and an office without them is badged *No coordinates* rather than looking configured.
- Floors open a **plan editor**: paste the image URL, then click a resource's *Place* button and click the plan. Esc cancels placement without closing the dialog. Unplaced resources are listed with their positions, and a broken image URL says so instead of rendering an invisible canvas.
- Delete confirmations spell out the actual cascade (deleting a building takes its floors and plans; resources survive but lose their floor).

**Resources page gained the floor picker it never had** — resources could not be assigned to a floor from the UI at all, which meant no resource could ever appear on a plan.

**No file upload** — plan images and logos are URL strings, matching how branding already works. Adding upload means introducing object storage, which is a larger decision than this change; the hint text says so plainly.

**Verification** — live: plan GET/PUT round-trips; all four rejection paths return 400 (pin off-floor, x outside 0..1, duplicate pin, lat 999, radius 1); unauthenticated 401 and an EMPLOYEE token 403; geofence still classifies (office coordinates → `OFFICE`, 1000km away → `WFH`); `/locations`, `/resources`, `/dashboard`, `/calendar` all 200; n8n + postgres untouched; `nginx -t` clean. Probe plan data was reverted to empty afterwards.

**Gotchas recorded**
- Prisma `upsert.create` cannot satisfy `FloorPlanUncheckedCreateInput` from a literal, because `tenantId` is stamped by the scoping extension at run time — cast, as the rest of the admin services already do.
- **A build guard must not accept an existing image tag as proof of success.** An earlier run here checked `docker image inspect meetnippon-api:build` after a *failed* build; the stale image from the previous build satisfied it, the run reported a pass, and the test suite then exercised old code. Tag each build uniquely, or check the build's exit status.
- Running jest with `-t 'floor plan'` fails in isolation: those tests reuse fixtures created by earlier tests in `admin.spec.ts` (the file's existing style). The full-suite run is the real signal.

**Left alone deliberately** — two `HQ Smoke` offices from a 2026-07-19 smoke test remain in the pilot tenant. Both have NULL coordinates, so `classifyLocation` skips them and they cannot affect WFH detection; they are cosmetic only. Not deleted, because permanent prod data removal is an owner decision.

---

## CAL-1 — Kalender & Riwayat — DONE (2026-07-20)

Two views the user portal was missing, plus the API filtering they needed. **77/77 tests still pass.**

**API — `GET /bookings` gained filters** (`dto/list-bookings-query.dto.ts`). All optional, so the endpoint's old no-arg behaviour is unchanged:
- `scope=upcoming|past|all` — the boundary is **`endTime`, not `startTime`**, so a meeting running right now still counts as upcoming rather than dropping into history mid-session.
- `from` / `to` (ISO instants, `to` exclusive), `status`, `take` (1–200) / `skip`.
- Sort follows intent: `upcoming` reads ascending (soonest first), everything else descending (newest first), which is how a history list is actually scanned.
- `ValidationPipe` already runs `whitelist + forbidNonWhitelisted + transform`, so bad input 400s rather than being ignored — verified live for `scope=bogus`, `take=999`, and an unknown param.

**Pagination shape** — the response stays a plain **array**. Callers request `take = PAGE + 1` and use the surplus row as the "there is more" signal, so no total has to cross the wire and no existing consumer sees a changed contract.

**Web — `/calendar`** — Monday-first month grid on the tenant wall clock. Prev/next/today, day-detail panel, zone badge. Grid arithmetic is pure calendar math (`Date.UTC` on `YYYY-MM-DD` keys) and deliberately **zone-free** — which days a month has is the same everywhere; the zone only decides which day is *today* (`todayLocal`) and which day a booking lands on (`localDateKey`). The fetch window is the grid's own span converted through `zonedToUtcIso`, so a booking near local midnight is fetched for the day it displays on. Cancelled/rejected are hidden from the grid but still visible in History. Below 820px the chips collapse to a dot-per-booking bar and the day panel carries the detail.

**Web — `/history`** — past bookings with status + date-range filters and load-more paging (20/page). The end date reads as inclusive to the user but is sent as the following local midnight, since the API bound is exclusive.

**`/bookings` is now scoped `upcoming`** — it was fetching every booking a user had ever made, unbounded, and rendering finished rows with a dead Cancel column. It now shows only what is still ahead (every row actionable) and links across to History.

**`lib/format.ts`** gained `fmtMonthYear`, `fmtDayLong`, `weekdayLabels` — all locale-aware (`en-GB`/`id-ID`) and rendered with `timeZone: 'UTC'` because their input is already a calendar key, not an instant; re-projecting would risk shifting a day.

**Gotcha recorded** — there is **no `node_modules` on the server**; all builds run through `docker build` (`--target build` for the API's TS gate and jest, `--target prod` for images). A `npx tsc` / `npx next build` over SSH silently downloads *different major versions* from the registry (pulled next@16 against a next@14 repo) and reports nothing useful — an early attempt here "passed" without compiling a single file. The API test suite needs `--network meetnippon_internal` + `DATABASE_URL`; without it 7 of 10 suites fail on Prisma connect. Those tests are safe against the live DB — `wipe()` is scoped to the `test-tenant-A`/`test-tenant-B` fixtures (confirmed: `Booking` count 9 before and after, 0 test tenants left behind).

---

## TZ-1 — Per-tenant timezone — DONE (2026-07-20)

Commit `9ae2aa8`. Retires the Phase-2 "everything is UTC wall-clock" shortcut, which made the dashboard's *Bookings today* stat roll over at 07:00 local for WIB users and evaluated business hours against the wrong clock. **77/77 tests pass** (16 new).

**Schema** — `Tenant.timezone` (IANA string), migration `20260720073612_tenant_timezone`. Additive; **default `UTC`** so every existing tenant and all 61 pre-existing tests keep their old behaviour. New workspaces are created `Asia/Jakarta` by onboarding (`RegisterWorkspaceDto.timezone` optional override); pilot tenant `nipsea` set to `Asia/Jakarta`.

**API**
- `src/common/tz.util.ts` — Intl-based (full ICU ships with Node 13+, no tzdata dep): `zonedParts`, `tzOffsetMs`, `isoWeekdayInTz`, `minuteOfDayInTz`, `localDateKey`, `startOfDayInTz`, `addLocalDays`, `isValidTimeZone`. `startOfDayInTz`/`addLocalDays` use a two-pass offset correction so DST transitions resolve.
- `src/common/tenant-tz.ts` — `tenantTimezone(prisma)`, resolves via tenant context, `'UTC'` outside it.
- `booking.rules.ts` — `withinBusinessHours` / `validateSlot` / `isoWeekday` / `generateOccurrences` take a `tz` (defaulting to `'UTC'`, so the pure-function tests are untouched). Recurrence now steps by **calendar days on the local clock**, so an occurrence keeps its local start time across a DST shift instead of drifting an hour.
- `booking.service.ts` — resolves tenant tz once per create; per-user daily quota boundaries via `startOfDayInTz`/`addLocalDays` (was UTC midnight).
- `work-location.service.ts` (WFH `day` key) and `admin/analytics.service.ts` (WFH-today) — same fix; these were the other two UTC-midnight boundaries.
- `auth.service.ts` — **`/auth/me` now returns `timezone`.** This is the authoritative carrier: `GET /tenant/branding` resolves no tenant on shared-URL hosts (returns `{tenant:null}`), so branding alone would have left the pilot portal silently rendering UTC.
- `admin/branding` GET returns `{...branding, timezone}`; PUT accepts `timezone`, validated server-side against Intl.

**Web (both portals)** — `lib/format.ts` gained `setTenantTz`/`getTenantTz`, tz-aware `fmtDate`/`fmtTime`/`fmtDateTime`, `localDateKey`, `todayLocal`, `tzLabel`; user portal also has `zonedToUtcIso`. `todayUtc` and `sameUtcDay` are gone (all call sites updated). Both `auth.tsx` set the clock from `/auth/me` on load **and** after login (without the latter a fresh session renders UTC until the next full page load). Booking modal submits `zonedToUtcIso(date, time, tz)` instead of the old `${date}T${time}:00.000Z`, defaults the date to tenant-local today, and labels the hint with the real zone. Dashboard *today* compares local date keys. Admin Branding page has a timezone picker (14-zone shortlist, preserves an out-of-shortlist saved value so Save can't silently rewrite the workspace clock). `tzLabel` formats with `id-ID` — the only locale that names the Indonesian zones (WIB/WITA/WIT); elsewhere it degrades to GMT offsets, same as en-GB would.

**Demo seed** — `seed-demo.ts` now builds instants from **WIB wall-clock** (helpers mirror the API's), so demo bookings read as a real office day (08:30 / 09:00 / 09:30 / 10:00 / 14:00 WIB) instead of appearing 7h shifted. WFH `day` keys likewise use Jakarta local midnight. Tenant upsert pins `timezone`.

**Verification** — `zonedToUtcIso` and friends were executed under real Node against expected values (10/10), including both 2026 US DST edges (`01:30`→06:30Z and `03:30`→07:30Z on spring-forward, `01:30`→05:30Z on fall-back) and the midnight-crossing case (`00:30 WIB` → previous-day `17:30Z`). Live after deploy: `/auth/me` returns `Asia/Jakarta`; the second tenant still reads `UTC`; both portals + API 200; resources/bookings/notifications/flags intact; n8n + postgres untouched; `nginx -t` clean.

**Gotcha recorded** — Prisma schema rejects `/** */` block comments (5 validation errors); use `///`. Also: `Booking.startTime` is `timestamp without time zone`, so a verification query must read `(col at time zone 'UTC') at time zone 'Asia/Jakarta'` — a bare `at time zone 'Asia/Jakarta'` reinterprets rather than converts and shows nonsense.

---

## UI-1 — QA audit & hardening pass — DONE (2026-07-20)

Commit `3e7f830`. QA agent audited all 37 page/component files in both portals against the two mockups; findings fixed in a two-agent sweep (one per portal) + owner review. Both portals rebuilt and redeployed; builds passed clean (Next.js build = the typecheck gate, since no Node locally).

**P1 fixed (UX non-negotiables + blockers)**
- **ESC-close** on every modal/overlay: user BookingModal, cancel-confirm, both WelcomeTours, admin shared `Modal` + `ConfirmModal`. (Click-outside already worked.)
- **Collapsible sidebar** both portals — icon rail, persisted (`mn_sidebar` / `mn_admin_sidebar`).
- **Destructive-action confirmations**: cancel booking (user); delete resource, delete policy, deactivate user, change role (admin). Role change no longer fires on every `<select>` change, and **self-demotion is blocked** (compares row id vs `useAuth().user.id`).
- **Mobile navigation**: user portal previously hid the sidebar ≤820px with no alternative; admin had no breakpoint at all. Both now have a hamburger + drawer with backdrop (ESC/click-outside/route-change close); all admin tables wrapped in `.table-wrap` (`overflow-x:auto`).
- **Real error states**: every `catch(() => {})` on a data fetch replaced with an error box + Retry. Admin `analytics` and `billing` previously hung on "Loading…" forever on failure — fixed with an error branch before the null check.

**P2 fixed**
- **Notification bell + center** in both topbars (unread badge, 30s poll, mark-all-read, deep-link, ESC/click-outside). Routes: `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`.
- **i18n backfill** — user portal ~50% → ~100% (hub, chat, signup, 7-step tour, all toasts; fixed ID entries that were English copies). Admin **20 → 221 keys** (+201), all 10 pages + Shell wired; every static key verified to resolve, no duplicates.
- **Modal validation bypass** (admin): footer sat outside `<form>` and pages used `onClick={save as any}`, skipping HTML `required`. Modal now takes `formId` and renders a real `<button type="submit" form=…>`; resources/users/policies rewired.
- Admin bookings: approval decisions rendered as bare initials ("A P R") → proper bilingual colored chips.
- Chat: draft restored on send failure; IME composition guard on Enter (was breaking JP/ID input).
- WelcomeTour: overlay click no longer marks the tour permanently done — only Skip / Get started do.
- a11y: div/span `onClick` → real `<button>` (filter pills, dashboard links, chat rows); `aria-label` on icon-only buttons; toast `role="status" aria-live="polite"` + click-to-dismiss.

**Verified live after deploy:** user/admin `/login` + `/api/health` all HTTP 200; 11 resources, 6 bookings, 3 hub tasks, 5 notifications (5 unread), 13 chat convos, 6/6 flags on, 7 users, approvals visible to dina. Co-hosted apps (n8n, postgres) untouched and up; `nginx -t` clean.

**Design tokens:** audit found 100% parity with mockups (teal `#0E6E55`, coral `#E4572E`, Space Grotesk/Inter) — no drift, no changes needed.

**Deferred (P3, next wave):** user-portal mockup views still missing — **Denah** (floor plan); plus presence dropdown, WFH chip on hero, check-in button, room-detail panel, List/Denah toggle, booking-modal extras (recurrence, participants/schedule assistant, reminder chips, meeting-type, recording opt-in). Admin: dashboard approval queue with inline decisions, occupancy/ghost-booking deltas, resource-table search, and **floor-plan image upload** (URLs work today; upload needs object storage). Also still open: pagination for **admin** audit/users lists (still unbounded), Google Fonts via CSS `@import` → `next/font`. *(Per-tenant timezone — done, see TZ-1. Kalender, Riwayat and booking-list pagination — done, see CAL-1. Admin office locations/geofence + floor plans — done, see LOC-1; the user-facing Denah view that consumes those plans is still open.)*

---

## Phase 10 — DONE (2026-07-19)

Billing & self-service onboarding. Onboarding + plan limits are real; payment is mock (Stripe = escalation). **9 suites / 61 tests**; live over HTTPS.
QC gate:
- [x] **Self-service onboarding** (`src/onboarding`, public, rate-limited): `POST /api/onboarding/register` → new Tenant + branding + first ADMIN + starter tenant-policy; slug validation (reuses subdomain rules) + global uniqueness + company-email required (public domains blocked)
- [x] user-portal **/signup** page (public route) + "Create a workspace" link on login; success → sign-in
- [x] **Billing** (`src/billing`, global): plans FREE/PRO/ENTERPRISE with user/resource limits + feature sets; plan stored in `billing` flag config (no schema change); `PlanService.assertCanAddUser/Resource` **enforced** in admin user/resource create; `GET/PUT /api/admin/billing[/plan]`
- [x] admin **Billing** page: current plan, usage bars vs limits, feature chips, plan switcher
- [x] Tests: onboarding (create, dup-slug 400, reserved-slug 400, public-email 400), billing (FREE default, limit block, PRO upgrade raises limit, summary)
- [x] **Live HTTPS smoke**: registered `democo9678` → logged in → FREE (10 users/5 res) → upgraded PRO → dup 400, gmail 400
- [x] Fixed a real bug: `PUBLIC_EMAIL_DOMAINS` read as comma-string from env, now normalized defensively

**ESC (to enable real payments):** Stripe (or provider) keys → wire `PlanService.setPlan` to a checkout/subscription flow; today plan changes are immediate/mock.

## Phase 7 — DONE (2026-07-19) — 🟢 PRODUCTION LIVE

MeetNippon deployed to production on the shared server, additively and safely.
QC gate:
- [x] **Prod deploy**: additive nginx vhost `meetnippon.cosger.online` → user portal (8082) + `/api/` (8081) + `/socket.io/` (8081); **Let's Encrypt TLS** via certbot `--nginx` (expires 2026-10-17, auto-renew); http→https 301. Verified: `/login` 200, `POST /api/auth/login` 200, `/api/health` 200 over HTTPS
- [x] **Shared-server safety**: only our own vhost written; `nginx -t` passes; symlink auto-rollback on test failure; co-hosted apitoko/viewtoko/xtracker/n8n untouched (their certs/vhosts unchanged)
- [x] **Hardening**: mem limits — api 512m, web-user/admin 320m, db 448m, redis 128m (+maxmemory 96mb LRU); baked into run scripts + compose. Live usage ~154MB total, 2.1GB free
- [x] **Backups**: `scripts/backup_db.sh` (pg_dump→gz, 7-day retention) + cron 02:30 UTC; first backup verified
- [x] **Analytics**: `GET /api/admin/analytics` (bookings by status/type, 30-day, approval rate, top resources, WFH today) + web-admin **Analytics** page (bars + stat tiles). Verified 200 over HTTPS with real data
- [x] Tests still **8 suites / 55**; 5 containers healthy

DEPLOY SCRIPTS: `scripts/deploy_nginx.sh` (vhost+TLS), `scripts/harden.sh` (limits+cron), `scripts/backup_db.sh`.

**Admin portal PUBLIC (2026-07-19):** https://admin.meetnippon.cosger.online (vhost → 8083 + /api/ → 8081, TLS). Deploy: `scripts/deploy_nginx_admin.sh`.

**OWNER TO-DO (deferred, escalation-gated):**
- **Wildcard DNS** `*.meetnippon.cosger.online` → tenant-subdomain mode (shared-URL works today).
- **Prod SMTP** creds → real invitation/reminder emails (currently none wired).
- **Migration bulk-import** (CSV users/resources) — deferred to a follow-up.
- Housekeeping: stale `viewtoko.*.bak` files in nginx sites-enabled cause pre-existing "conflicting server name" warnings (not ours; left untouched).

## Phase 6 — DONE (2026-07-19)

Advanced modules. Real where no creds needed (chat, approval hub, WFH, notifications); recording + WhatsApp scaffolded behind flags (escalation-pending creds). **8 test suites / 55 tests**; all HTTP + WS smokes green; 5 containers healthy.
QC gate:
- [x] **Notifications** (`src/notification`, global): in-app create/list/unread/mark-read + **WhatsApp mock channel** (flag `whatsapp`, live-mode stub for Business API)
- [x] **Universal Approval Hub** (BRD 7.14, `src/approval-hub`): ingest external tasks → notify approver → list → decide, with **mock callback webhook** (callbackStatus SENT); approver/admin guard, tenant-scoped, audited
- [x] **WFH detection** (BRD 7.13, `src/work-location`): pure haversine geofence classify (OFFICE/WFH) + manual override; **privacy-preserving** (stores category + office name only, never raw GPS); daily `WorkLocationLog`
- [x] **Recording** (BRD 7.8, `src/recording`): flag `recording`, mock produces READY + placeholder transcript (live = STT escalation); notifies organizer
- [x] **Chat** (BRD 7.12, `src/chat`): REST (DM/group, messages, membership guard, flag `chat`) + **Socket.IO gateway** (token-auth handshake, per-tenant ALS context, conversation rooms, real-time `message:new`)
- [x] **UI**: user portal **Chat** (two-pane, polling) + **Approval Hub** pages + nav; admin **Integrations** catalog expanded (chat/whatsapp/recording toggles)
- [x] HTTP/WS smoke: approval-hub create→decide (callback SENT), WFH report/today, notifications (unread=1), recording READY+transcript, chat DM+message+list, socket.io handshake 200

**ESC-1 open (to go live):** WhatsApp Business API (phone-number id + token) for `whatsapp`; Speech-to-Text creds for `recording` live mode. Both run in mock until provided.
NOTE (UI follow-up): chat "start new conversation" needs a member picker (a user-directory endpoint); DMs currently created via API/admin. Approval-hub external ingestion is JWT-auth now; API-key ingest (BRD 7.14.5) is a follow-up.

## Phase 5 — DONE — scaffold with mocks + flags (2026-07-19)

Owner approved (escalation #1): build SSO/calendar architecture behind per-tenant feature flags with a working mock provider; switch to live when Azure/Google creds arrive.
QC gate:
- [x] **Feature flags** (`src/flags`, global): `FeatureFlagService` (isEnabled/configFor/upsert) + admin `GET/PUT /admin/feature-flags` + web-admin **Integrations** page (toggle sso_microsoft/sso_google/calendar_sync, mode mock/live, clientId, autoProvision)
- [x] **SSO** (`src/sso`): provider abstraction + **MockProvider** (fully working) + **Microsoft/Google** adapters (real OIDC auth-URL + token/userinfo exchange, **inert without creds**). Endpoints `POST /auth/sso/:p/start`, `POST|GET /auth/sso/:p/callback`; signed short-TTL state; **JIT provisioning** (match by tenant+email, verified-domain check, autoProvision) → issues our session via shared `AuthService.issueSession`
- [x] **Calendar sync** (`src/calendar`, flag-gated): `CalendarService` mock adapter records intent (Notification); hooked into `BookingService` create/cancel; live Graph/Google adapters stubbed
- [x] user-portal login: **Microsoft 365 / Google** buttons (mock → email consent prompt → callback → session; live → redirect to provider)
- [x] Tests: **6 suites / 40 tests** incl. SSO mock flow (start→callback→JIT→session), reuse-existing-user, flag gating, tampered-state; booking suite updated for calendar dep
- [x] HTTP smoke: flag enable 200, SSO start (mock) `mock:consent`+state, callback JIT-provisions user + tokens, disabled provider 400, bad state 401
- [x] Both portals rebuilt/live (8082 user w/ SSO buttons, 8083 admin w/ Integrations); 5 containers healthy

**ESC-1 still open (to go live):** provide per-provider **clientId** (set in Integrations, mode=live) + server env **MS_CLIENT_SECRET** / **GOOGLE_CLIENT_SECRET** + registered **redirect URI** `https://<host>/api/auth/sso/<provider>/callback`. WhatsApp/STT/SMTP creds anticipated in Phase 6.

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
