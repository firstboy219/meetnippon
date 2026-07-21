# PROGRESS.md — MeetNippon Execution Log

> Source of truth for phase continuation. Autonomous mode (owner-approved): continue phase→phase after each QC gate; stop only for the 5 escalation conditions (roadmap ch.3).

**Repo:** `C:\Users\020159\Projects\MeetNippon\app` (monorepo)
**Deploy target:** meetnippon.cosger.online @ 13.212.182.48
**Docs:** BRD (authoritative) + Roadmap + 2 mockups + SERVER_AUDIT.md — all in `../KnowledgeBase`

---

## Active phase: Phases 8–9 (Android/iOS native) — **pended by owner**; separate mobile track, needs mobile toolchain (not this server). All WEB phases (0–7, 10) DONE, plus UI-1 (hardening), TZ-1 (per-tenant timezone), CAL-1 (Kalender & Riwayat), LOC-1 (Lokasi & Denah admin), UP-1 (upload), UX-1 (alur booking).

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
| UX-1 | Booking flow: participants + invite confirmation, edit, post-book redirect | ✅ DONE (2026-07-20) |
| SYNC-1 | Admin settings actually reach the user portal | ✅ DONE (2026-07-20) |
| MAIL-1 | Outbound email service | ✅ DONE — **delivering live** since 2026-07-21 |
| MAIL-2 | SMTP configurable from the admin console (encrypted at rest) | ✅ DONE (2026-07-21) |
| PAGE-1 | Pagination + filters for admin audit / users / bookings | ✅ DONE (2026-07-21) |
| BRAND-1 | Branding actually reaches the user portal | ✅ DONE (2026-07-21) |
| QR-1 | Room QR codes + door-schedule page; resource-edit 400 fixed | ✅ DONE (2026-07-21) |
| DATA-1 | PT NPC master data: 10 rooms + 255 active bookings imported | ✅ DONE (2026-07-21) |

---

## DATA-1 — PT NPC master data import — DONE (2026-07-21)

Source: `KnowledgeBase/PT NPC - BOOKING MEETING ROOM.xlsx`, 12 sheets (10 rooms +
`Template`/`Sheet1`), columns `No | Name | Division | Meeting Room | Date | Time | Remarks`.
Parsed with a **stdlib-only** reader (`scripts/import/xlsx_analyze.py`) — an xlsx is a zip of XML, and
`pip install` on a box running other people's projects is not something to do casually.

**Rooms** — all 10 sheet names created as ROOM resources, capacity 8, category "Meeting Room".
Idempotent by name: `Solareflect` and `Superlac` already existed (owner-created) and were left
untouched, including their capacity of 1.

**Bookings** — 2,288 rows in the file; **2,033 already in the past**, so only the **255 still upcoming**
were imported, per the owner's instruction. Range 2026-07-21 .. 2026-12-28, 44 distinct people.
Backup taken first: `backups/booking-before-npc-import-20260721-043117.sql`. Count went 22 → 277.

**Owner decisions taken (asked, not assumed):**
- *Ownership* — every imported booking belongs to the **admin account**, with the real person and
  division in the title (`Mini SNOP — Octy (MRP)`) and the source recorded in the description.
  The alternative was 44 placeholder identities; the owner chose not to create them.
- *`FULL DAY`* (104 rows) → **08:00–16:30 WIB**. Open-ended rows (`… - SELESAI`) end at 16:30 too.

**Written as direct SQL, not API calls, on purpose.** The booking rules cap duration at 4h and
advance booking at 60 days; most of these legitimate rows would have been rejected. A migration is
not a user action. Two things were deliberately *not* bypassed: overlaps are detected and reported,
and nothing is sent — the importer writes rows, so it cannot email anyone by construction.

**Data quality found in the source** (reported, imported as-is — the sheet is the record):
- 2 genuine overlaps, both Superlac 2026-07-24: a FULL DAY booking by Mr. Tay plus two others.
- 1 malformed time `13.00 - 1500` → treated as 13:00–16:30.
- 108 distinct division spellings that are really ~45 (`Marketing`/`MARKETING`/`Mkt`/`MKT`,
  `Purchasing`/`purchasing`/`PURCHASING`/`Purchaing`, `Operation`/`Operations`/`Ops`). Left alone —
  divisions are only free text on the booking title today.

**Still open** — 44 staff accounts (the file has first names only, no emails) and the 2,033 historical
rows. Both wait on the owner.

---

---

## QR-1 — Room QR codes — DONE (2026-07-21)

**147/147 tests pass.**

**Bug fixed first: editing a resource returned `property type should not exist`.** The console sent
`type` on every save, but `UpdateResourceDto` deliberately omits it — a resource's type is fixed once
it exists (changing a ROOM into a DESK under live bookings is meaningless), which is why the picker
is already disabled on edit. The fix is in the **console**, not the DTO: `type` is now sent only on
create. Confirmed live that a normal edit returns 200 and that sending `type` is still refused.

**Room QR.** Each resource gets a printable code from Admin → Resources → **QR**. It encodes the user
portal's `/room/<id>` page, so scanning opens something a person can read rather than raw API JSON.
The modal offers print (a clean sticker layout with the room name and a scan hint), PNG download, and
copy-link. Generated client-side with `qrcode`, so no authenticated image request is needed — an
`<img>` cannot carry a bearer token.

**The page it opens** shows a large free/in-use banner, what is on now and what is next, the whole
day's bookings **with who booked each slot and their department**, and day-stepper navigation.
It refreshes itself every 60s, since a door display is left open. Times render on the tenant's clock,
and the day boundary is the tenant's midnight — a 23:00 UTC booking correctly belongs to the *next*
Jakarta day, which my first probe got wrong before the logic did.

**Privacy decision — the page requires sign-in.** It names colleagues, so it lives inside the
authenticated area: pointing a phone at a door as a visitor gets the login screen, not a list of who
is meeting whom. Verified: unauthenticated **401**, unknown room **404**, and another tenant cannot
read the room at all. Cancelled and rejected bookings are excluded so a free room never looks busy.

**Observation, not a defect** — the pilot tenant's demo resources are gone; only `Solareflect` and
`Superlac` remain, both owner-created. The owner is populating real rooms. My first smoke used a
stale demo id and 404'd because of that, not because of a bug.

---

---

## BRAND-1 — Branding reaches the portal — DONE (2026-07-21)

Owner reported that colours set in admin had no effect. Correct — and for **three** separate
reasons. **146/146 tests pass** (5 new). Also: the owner supplied a working Gmail App Password,
so **email now actually delivers** — `mail:sent … via smtp.gmail.com (tenant)` confirmed for both a
test send and a real booking invitation.

**1. The portal never received the branding at all.** `/tenant/branding` resolves the tenant from the
**Host header**, and `meetnippon.cosger.online` is a shared URL with no subdomain, so it returned
`{"tenant":null}` to everyone — the same trap TZ-1 hit with the timezone. It now falls back to the
**authenticated** tenant when the host resolves nothing, and the portal requests it *with* its token.

**2. Branding was never re-fetched after login.** On a shared URL the first (anonymous) request can
never succeed, so even with fix 1 a fresh sign-in stayed unthemed until a manual reload. `login()`
now reloads branding once a token exists.

**3. Only two of the six colour variables were being set.** The stylesheet is built on families —
the sidebar is `--teal-dark`, hovers and selected states are `--teal-tint`, badges are
`--coral-tint` — but only `--teal` and `--coral` were overridden. A rebranded workspace came out
half-changed: blue buttons on a still-green sidebar. `lib/theme.ts` now derives the whole palette
from the two brand colours (darken 28% for the sidebar, lighten 88% for tints).

**Contrast guard** — the sidebar paints its text on `--teal-dark`. A pale brand colour would leave
white-on-white, so a new `--on-brand` variable flips to dark ink when the derived dark colour is
still bright (BT.601 luminance > 150). Tested: default green, the tenant's blue and near-black all
keep white text; `#ffe680` and `#ffffff` switch to dark.

**Verified live** — a signed-in request returns the tenant's real `#0276f2`/`#dd4048`; setting
purple/amber in admin is visible on the very next portal request; `--on-brand` is present in the
shipped bundle. Hex parsing rejects junk (`red`, `#12`, `javascript:alert(1)`) so a malformed value
leaves the defaults rather than writing garbage into the DOM.

**Follow-up (owner correction): branding follows the workspace typed at login.** The limitation
above was wrong — the login screen *does* know which workspace it is for, because the user types the
slug. `GET /tenant/branding?workspace=<slug>` now resolves branding by slug, unauthenticated, and
the login page applies it as you type (400 ms debounce, only once the slug is ≥3 chars so the
palette does not flicker). The slug is remembered in `localStorage`, so a returning user lands on an
already-branded login screen and the field is prefilled. An unrecognised slug shows a quiet hint
rather than silently doing nothing.

Resolution order is now: **`?workspace=` → Host header → the caller's own tenant.**

**Why the slug lookup is safe to leave unauthenticated:** a login page must be able to theme itself
for a workspace nobody has proven membership of yet. It returns only what a login screen renders —
name, colours, logo, access mode — and nothing about members. Guessing slugs therefore reveals no
more than attempting a sign-in already does, and the global throttle applies. The slug is validated
against the registration character set before it reaches the database. Verified live that
`nipsea'--`, `../../etc/passwd`, `a or 1=1`, `%00` and a 2-character slug all return
`{"tenant":null}`, while `"  NiPsEa  "` resolves (users type sloppily), and that the response
carries no membership or PII fields.

**Still limited** — the admin console remains unthemed; it is the platform's own tool and branding it
per tenant is a separate decision.

**Process note — I clobbered a live setting.** My verification script changed the brand colour to
test propagation and then "restored" it to a value captured earlier in the session. The owner had
changed it to `#429eff` in the meantime, so the restore wrote back a stale `#0276f2`. Caught it in
the probe output and put `#429eff` back. **A test that mutates production must capture the current
value immediately before overwriting it, not reuse one from earlier in the run.**

---

---

## PAGE-1 — Admin list pagination — DONE (2026-07-21)

The last item on the P3 list. **141/141 tests pass** (9 new).

**The bug was silent truncation.** `/admin/audit` returned a bare `take: 100` and `/admin/bookings`
a `take: 200`, with nothing to say more existed; `/admin/users` had no limit at all and would have
grown unbounded. Live proof after the fix: the pilot tenant's audit log holds **119 rows — 19 of
them had been unreachable**.

**API** — shared `src/common/pagination.ts` (`PageQueryDto`, `pageParams`, `toPage`). All three
endpoints now return `{ items, total, page, pageSize, pages }` and run the row query and the count
in one `Promise.all`. `pages` is floored at 1 so the console can never render "page 1 of 0";
`pageParams` clamps `page ≥ 1` and `pageSize` to 1..200 so a hand-edited query cannot ask for a
negative offset or the whole table.

**Filters, because paging alone does not make a long log usable:**
- audit — action prefix, entity, actor, date range
- users — search across name + email, role, active state
- bookings — status, title search, date range

**Web** — shared `Pager` component (first / prev / next / last, "1–25 of 1,432"). Search inputs are
debounced 300 ms, and any filter change resets to page 1 — otherwise you land on page 7 of a
2-page result. Tables keep the previous rows visible while the next page loads instead of blanking.

**Caught during the change:** the admin **dashboard** also consumed `/admin/bookings` and expected a
bare array; the new envelope would have broken its "recent bookings" panel silently. It now asks for
`?pageSize=8` — exactly the rows it renders — instead of fetching a slice and discarding most of it.

**Gotcha recorded** — `pagination.spec.ts` failed to even load with
`TypeError: Reflect.getMetadata is not a function`. It is the only spec that imports a
decorator-using module *without* going through Nest first, which is what normally pulls in
`reflect-metadata`; the import is now explicit at the top of that spec.

**Verified live** — page 1 and page 2 return different rows; `total` is the real count, not the page
size; action and role filters narrow correctly; a page past the end is empty rather than an error;
`pageSize=9999`, `page=0` and an invalid status all **400**; EMPLOYEE still **403** on all three;
no `passwordHash` in any user payload.

---

---

## SYNC-1 — Admin ↔ user portal sync — DONE (2026-07-20)

Owner asked whether admin settings actually take effect for users. Two did not.

**The approval bug.** The booking page decided whether a room needed approval with
`(r.category ?? '').toLowerCase().includes('vip')` — a string match on the category *name*.
The policy engine was never consulted, so switching approval off in the admin console changed
nothing a user saw. `GET /resources` now returns the **resolved** policy
(TENANT←CATEGORY←ROOM) per resource and the portal reads `policy.requiresApproval`.
`approverIds` and `autoReleaseMinutes` are stripped — who signs off is internal routing.
Resolution is batched (`resolveMany`) so a listing is one query, not one per row.

**Proved live, both directions:** with approval ON the portal shows *requires approval* and a
new booking lands `PENDING`; admin switches the VIP category off → the portal immediately shows
*available* and the next booking lands `APPROVED`; switched back on → `PENDING` again.

**Feature flags.** Flags were admin-only; the portal showed every module regardless. `/auth/me`
now carries the enabled keys and the sidebar hides what is off. Only `chat` has a real flag today
(and the API already refuses it when disabled) — **do not gate an item on a key that does not
exist**, or it simply never appears.

**Also now honoured, verified:** resource status (MAINTENANCE/INACTIVE rooms are filtered out of
`/resources`), branding colours + logo (CSS custom properties from `/tenant/branding`), tenant
timezone (TZ-1), deactivated users (excluded from the directory), plan limits (enforced on create).

**Schema flaw found.** `BookingPolicy` has `@@unique([tenantId, scope, category, resourceId])`,
but for a TENANT-scope row both `category` and `resourceId` are NULL — and Postgres treats NULLs
as *distinct* in a unique index, so the constraint does not stop duplicates. That is how `nipsea`
ended up with two TENANT policies. The resolver now orders by `id` so resolution is at least
deterministic, but **the real fix is a partial unique index**, and the duplicate rows should be
merged. Not done here: it is a migration plus prod data surgery.

## MAIL-2 — SMTP from the admin console — DONE (2026-07-21)

Owner wanted to type the SMTP details (including the app password) into the admin UI instead of
editing `.env` on the server. **132/132 tests pass** (22 new).

**Admin → Email** (`/mail` in the console): provider preset (Gmail / Microsoft 365 / SES / Resend /
custom), host, port, username, password, sender name + address, an enable switch, **Test connection**
and **Send test email**. A status banner says plainly which of *not configured / disabled / working /
last attempt failed / not tested yet* applies, and shows the real SMTP error when there is one.

**The password is the sensitive part, so:**
- Stored **AES-256-GCM encrypted** (`src/common/secret-box.ts`), format `v1:iv:tag:ciphertext`.
  GCM means a tampered row fails to decrypt instead of yielding garbage; the `v1` prefix leaves room
  to rotate the scheme. Verified live: the column reads `v1:jNlhj2oMK6usBp8S:…` and a
  `LIKE '%plaintext%'` query over the table returns **0 rows**.
- **Never returned by any route.** The API only ever reports `hasPassword: true|false`. Confirmed
  live that neither the plaintext nor the ciphertext appears in the settings response.
- **Omitting the field keeps the stored value**, so an admin can change the port without knowing the
  credential; sending `""` clears it.
- **Not written to the audit log** — the log records host/port/username/enabled only.
- Key comes from `MAIL_SECRET_KEY` (generated on the server), falling back to a scrypt derivation
  from `JWT_ACCESS_SECRET` with a purpose-specific salt so it is a separate key, not a reuse.
  **If `MAIL_SECRET_KEY` is lost, stored SMTP passwords become unreadable** and each workspace must
  re-enter one — recoverable, but back the key up with the rest of the env.

**Resolution order** — a tenant's own settings win; with none (or disabled, or a password that will
not decrypt) it falls back to the platform env defaults. A password that fails to decrypt
deliberately yields *no* config rather than silently attempting an anonymous connection.
Transports are cached per tenant and invalidated on save, so a corrected password takes effect on
the next send rather than after a restart.

**Schema** — `TenantMailSetting` (one row per tenant, cascade on tenant delete), migration
`20260721013204_tenant_mail_settings`, added to `TENANT_SCOPED_MODELS`. Applied additively:
tenants 2→2, bookings 18→18.

**Verified live** — settings save and read back without the secret; editing another field preserves
the password; the status probe uses the **tenant** transport (`using: "smtp.gmail.com (tenant)"`)
and surfaces the true Gmail error; EMPLOYEE gets **403** on all four routes and unauthenticated
**401**; invalid port / missing host / malformed sender address all **400**. Probe rows deleted
afterwards (0 left).

**Still true from MAIL-1**: the Gmail credential itself is invalid, so email will not actually
deliver until a working App Password is entered — which is now a form field rather than a server edit.

## MAIL-1 — Outbound email — BUILT, BLOCKED ON CREDENTIAL (2026-07-20)

**110/110 tests pass.** Everything is written, deployed and wired. It cannot deliver because the
SMTP credential it was told to reuse is rejected by Gmail.

**Service** — `MailService` on nodemailer, configured entirely from env. Delivery is
**best-effort and never blocks the caller**: a booking must not fail because a mail server is slow.
With no `SMTP_HOST` it disables itself and logs what it *would* have sent, so tests need no mail
server and an unconfigured production is obvious rather than silently broken.
HTML bodies escape every interpolated value (a meeting title is user input).

**Wired to** — booking created (all participants), booking rescheduled, approval approved/rejected
(requester, with the approver's note), new user created by an admin (credentials; a password the
*admin* chose is never mailed, only a generated one), workspace registration (never echoes the
password the user just chose).

**Env plumbing gotcha** — `validateEnv` returns a *whitelist* object and that return value **is**
the config. Any key not listed there reads back `undefined` no matter what is in the environment,
so `SMTP_*` and `APP_BASE_URL` had to be added explicitly.

**Honesty fix** — the API first reported `emailed: N`, which was a lie: sends are fire-and-forget,
so N counted messages *handed to the transport*, not delivered. Renamed to `emailQueued`, and
`GET /admin/mail/status` now performs a real `verify()` so an admin can find out whether email
actually works. `POST /admin/mail/test` sends to the calling admin.

**🔴 BLOCKER — the credential is dead.** Reused from `/home/ubuntu/apps/autotoko/.env`
(`smtp.gmail.com:587`, `muhilhamps@gmail.com`). It copied across intact — 16 chars, unquoted, no
spaces, correct shape for a Gmail App Password — but Gmail rejects it:
`535-5.7.8 Username and Password not accepted`. Confirmed with a **raw SMTP login test outside the
application**, so this is the credential, not the code. It has presumably been revoked or expired
(autotoko is not currently running, so nothing else was exercising it).
`/api/admin/mail/status` reports exactly this. **Needs a fresh Gmail App Password**; swapping
`SMTP_PASS` in `/opt/meetnippon/.env` and restarting the API is the whole fix.

**Note on the From address** — Gmail rewrites `From` to the authenticated mailbox, so
`no-reply@meetnippon.cosger.online` would be silently replaced. Configured as
`MeetNippon <muhilhamps@gmail.com>`. A proper sender identity needs either a Google Workspace
alias or a real transactional provider — worth deciding before pilot.

**Deploy gotcha repeated** — an `scp` failed with `Connection closed`, the build then ran against
a **stale tarball**, and the whole gate reported OK while `mail.controller.js` was simply absent
from the image (the route 404'd). Uploads are now hash-checked before building.

---

## UX-1 — Booking flow rework — DONE (2026-07-20)

Owner reviewed the user portal and named four expectations. Three were genuinely absent. **100/100 tests pass** (9 new).

**Audit result**
| Expected | Was |
|---|---|
| New user gets guidance | Present (7-step tour) — but it predated Kalender & Riwayat, so it taught a nav that no longer existed |
| Confirmation before notifying participants | **Absent.** The API accepted `participants`; the UI never collected them and nothing was ever sent |
| Land on the calendar after booking | **Absent.** A toast fired and the user stayed on /book |
| Author can edit a meeting | **Absent.** There was no update endpoint at all — only create, cancel, check-in |

**API**
- **`PATCH /bookings/:id`** — re-runs the same policy gate as create, because an edit can move a slot anywhere a create could have. Owner-or-admin only. Times must be sent as a **pair** (validating a half-updated slot is meaningless). Conflict detection now takes an `excludeBookingId`, so a booking no longer collides with itself. A finished booking cannot be edited; one already under way can have its details corrected but not its time. **Moving an approved booking in an approval-required room resets it to PENDING and reissues the approval steps** — the decision was about the old slot.
- **`GET /users/directory`** — a minimal colleague list (id, name, email, department) for any authenticated member, since you cannot invite someone you cannot look up. Deliberately not admin-only, and deliberately narrower than the admin user API. Also unblocks the deferred chat member-picker.
- **Participant invites** — internal participants get a real in-app notification on create and on reschedule; the response carries `{notified, unreachable}` so the UI can state what actually happened. `notify: false` opts out. A title-only edit notifies nobody.

**Web**
- Booking modal gained a **participant picker** (directory search + typed external addresses) and a **second confirmation screen** listing exactly who will be told, with an explicit opt-out. Esc backs out of the confirmation before it closes the dialog, so a stray keypress cannot discard a filled-in form.
- **After booking, the portal navigates to `/calendar?d=<day>`** — the result becomes visible rather than merely announced.
- **Edit** is reachable from both the calendar day panel and My Bookings, sharing one `EditBookingModal`. It only appears for the author on a booking that has not ended; the API enforces the same, so the UI is just not offering a refused action. It warns before an edit that would trigger re-approval, and before one that will notify guests.
- Tour rewritten: added a Calendar & History step, and the booking/My-Bookings steps now describe invites and editing.

**Honest limitation — external invitees are not emailed.** There is no mail transport in the platform at all (no nodemailer, no SMTP host running; `SMTP_HOST=mailpit` points at a container that does not exist). External participants are stored on the booking and counted as `unreachable`, and the confirmation screen says plainly that they must be told another way. Wiring real delivery needs SMTP credentials — an owner decision, escalation condition 1.

**Verified live** — directory reachable by an employee and 401 without a token, exposing no role/password fields; create with one internal + one external returns `{notified:1, unreachable:1}` and the colleague's inbox shows the invite; `notify:false` leaves the unread count unchanged; author can rename and move; a move re-notifies; a different employee editing gets **403**; a half time-pair gets **400**; `/calendar?d=`, `/book`, `/bookings`, `/history` all 200. Smoke bookings cancelled afterwards; co-hosted apps untouched; `nginx -t` clean.

**Noted, not acted on** — the tenant directory shows leftover test users (`Emp Smoke`, `Bob Builder`) from earlier sessions. Harmless, but they appear in the participant picker; removing them is prod data deletion and therefore an owner call.

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

**Deferred (P3, next wave):** user-portal mockup views still missing — **Denah** (floor plan); plus presence dropdown, WFH chip on hero, check-in button, room-detail panel, List/Denah toggle, booking-modal extras (recurrence, participants/schedule assistant, reminder chips, meeting-type, recording opt-in). Admin: dashboard approval queue with inline decisions, occupancy/ghost-booking deltas, resource-table search, and **floor-plan image upload** (URLs work today; upload needs object storage). Also still open: Google Fonts via CSS `@import` → `next/font`. *(Per-tenant timezone — done, see TZ-1. Kalender, Riwayat and booking-list pagination — done, see CAL-1. Admin office locations/geofence + floor plans — done, see LOC-1; the user-facing Denah view that consumes those plans is still open.)*

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
