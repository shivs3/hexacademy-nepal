# Development progress

Update this file at the end of every milestone. Only record what was actually executed and verified.

## Milestones

| # | Milestone | Status |
| --- | --- | --- |
| M1 | Foundation: repo, settings, custom user, roles, auth, audit, UI kit, dashboard/admin shells, infra skeleton, docs | **Done** (infra not yet run; see below) |
| M2 | CMS and public website: pages + versions + scheduling, section builder, menus, site settings, blog, SEO/sitemap, media library | **Done** (catalog-backed sections move to M3) |
| M3 | Catalog and LMS: courses → modules → lessons → resources, enrollment, progress, course player, instructor tools | **Done** (assignments move to M4/M6; paid enrollment waits for M5) |
| M4 | Exam engine: question bank, exams, server-authoritative attempts, autosave, grading, results and analytics | **Done** (assignments move to M6) |
| M5 | Commerce: pricing, coupons, orders, Khalti/eSewa providers (from official docs), webhooks, refunds | **Done** (real gateways need merchant credentials; see below) |
| M6 | Live classes (Meet/Zoom provider abstraction), assignments, and certificates with public verification | **Done** (Meet/Zoom APIs need OAuth credentials; links are instructor-managed) |
| M7 | Production readiness: CSP, observability, performance, accessibility audit, load test, staging launch | **Done locally** (load test and staging launch need a server; see below) |

## M1 — Foundation (completed 2026-10-17)

### Built

- **Backend** (Django 5.2.18, DRF 3.18.3): environment-driven settings (base/dev/test/prod), custom `User` (email login, case-insensitive uniqueness), `UserProfile`, code-defined roles synced to groups, `HasPerm` permission factory, a uniform error envelope, request-ID middleware, health/readiness endpoints, OpenAPI schema.
- **Auth API:** CSRF bootstrap, register (auto-login and verification email), login (throttled per IP and per email), logout, current user GET/PATCH, password change, password reset (no account enumeration), email verification and resend.
- **Staff API:** user directory (search/filter/order), activate/deactivate, assign roles, role list. Super admin is CLI-only (`grant_role`). Self-modification is blocked.
- **Audit:** append-only `AuditLog` with redaction, recorded for logins (success and failure), registration, password changes and resets, role and status changes, CLI grants.
- **Frontend** (Next 16.4.2, React 19.3, Tailwind v4):
  - brand tokens and an accessible UI kit (button, field, input, dialog, toast, alert, badge, card, skeleton)
  - auth pages: login, register, forgot/reset password, verify email
  - student dashboard with the profile & security page
  - staff dashboard with the user directory (search, filters, pagination, role dialog, deactivate confirm)
  - `proxy.ts` for an optimistic auth redirect, and an open-redirect-safe `next` param
- **Infra:** `compose.yaml` (postgres, redis, migrate, backend, worker, beat, frontend, nginx; only Nginx publishes a port), backend/frontend Dockerfiles (non-root), Gunicorn config, Nginx config (rate limits, Cloudflare real-IP generator), backup/restore scripts, `.env.example` (placeholders), GitHub Actions CI (backend, frontend, e2e jobs).
- **Docs:** architecture, database, API, security, deployment, decisions (ADR-001…008).

### Verified (executed locally on 2026-10-17)

- `manage.py migrate` and `makemigrations --check` succeed on PostgreSQL 17.
- `pytest`: 22 backend tests pass (auth flows, CSRF enforcement, throttling, verification, reset, roles/permissions, super-admin protection, session invalidation on deactivation, audit immutability).
- `ruff check` and `ruff format --check` are clean. `spectacular --validate --fail-on-warn` passes. `check --deploy` with prod settings reports only the opt-in HSTS-preload warning.
- Frontend: `eslint`, `tsc --noEmit` and `vitest` (24 tests: API client/CSRF, error mapping, validation schemas, safe redirects, permissions, money formatting, login form behaviour) all pass, and `next build` succeeds.
- Manual smoke test through the Next proxy against a live Django server: register → dashboard render → student blocked from `/admin` (UI redirect + API 403) → profile PATCH → PATCH without CSRF rejected → logout → `/users/me/` rejected. A super admin granted via the CLI could load `/admin/users` and list users.
- Playwright e2e (`e2e/auth.spec.ts`, desktop and mobile Chromium): 4/4 pass.

### Not verified

- **Docker Compose, Dockerfiles, Nginx and the CI workflow have not been executed.** Docker, Nginx and Redis are not installed on the development machine. The YAML parses and the Celery app loads, but the containers have not been built. Use the staging checklist in `deployment.md`.
- Real SMTP delivery (the dev/test email backends were used).

### Known gaps / follow-ups

- ~~The interim home page and auth-panel tagline are static text.~~ Done in M2: both come from the CMS.
- `/courses` 404s until M3. `/terms` and `/privacy` are ordinary CMS pages, seeded and published by `seed_cms` with a visible demo notice until replaced.
- ~~The Khalti/eSewa default URLs in `config/settings/base.py` were written from memory.~~ M5 checked them against the official developer docs. The sandbox URLs are the defaults, and the production URLs must still be confirmed with each provider when the merchant account is opened (`docs/deployment.md`).
- The CSP header is deferred to M7.
- Staff role permission sets are minimal until each domain app adds its permissions to `apps/accounts/roles.py`.

## M2 — CMS and public website (completed 2026-10-19)

### Built

- **Backend `apps/cms`:**
  - Models: `MediaAsset`, `SiteSettings` (singleton, enforced by a check constraint), `Page` and immutable `PageVersion`, `Menu` and `MenuItem` (two levels), `BlogCategory`, `BlogPost`, `NewsletterSubscriber`. Constraints and indexes are listed in `database.md`.
  - Services (`services.py`): page lifecycle (create, save draft → new version only when content changes, publish any version, schedule, cancel schedule, unpublish, archive and restore, make home, duplicate, restore an old version, delete); site settings; menu tree replacement; blog publish and unpublish; idempotent newsletter subscribe. Every mutation is audited.
  - Section registry (`sections.py`): 11 validated section types (hero, rich text, features, testimonials, FAQ, stats, image + text, video, CTA, newsletter, contact). Each section is validated against its schema on every write; unknown keys are dropped.
  - Sanitisation (`sanitize.py`): rich text uses an nh3 allowlist; links are limited to site paths, `#anchors`, http(s), mailto: and tel:; video links must be YouTube (rewritten to youtube-nocookie) or Vimeo (with dnt=1); brand colours must meet a WCAG contrast minimum; slugs must be lowercase words joined by single hyphens, and application routes are reserved.
  - Media (`media.py`): the file type is detected from the content. Accepted: JPEG, PNG, WebP and GIF up to 10 MB / 40 MP, and PDF up to `MAX_UPLOAD_SIZE_MB`. JPEG and WebP are re-encoded to strip EXIF. A SHA-256 checksum is stored. SVG and HTML are refused.
  - Celery beat task `cms-publish-scheduled-pages` (every 60 s, uses row locks with skip-locked). Scheduled blog posts need no task: a published post with a future `published_at` stays hidden until that time.
  - `seed_cms` command: idempotent, published demo home, about, contact, terms and privacy pages plus menus and settings, all labelled "Demo content".
  - Content editor role now holds all `cms.*` permissions.
- **Public frontend:**
  - CMS-driven home page (`/`) and `/[slug]` pages; header with dropdowns and a mobile drawer; footer and legal menus; announcement bar with a time window.
  - Section components for every registry type. Rich text is rendered through DOMPurify plus KaTeX (`trust: false`).
  - Blog index (category filter, pagination) and article pages with JSON-LD.
  - `sitemap.xml` and `robots.txt` generated from CMS data; `allow_indexing=false` disallows everything.
  - Per-page metadata: title, description, canonical URL, Open Graph image, noindex.
  - Brand colours from site settings are applied as CSS variables.
  - Staff-only preview routes `/preview/pages/{id}?version=` and `/preview/posts/{id}`.
- **Admin frontend (`/admin/cms/*`):**
  - Overview page with counts.
  - Pages list, plus a page editor: section builder (add, reorder, hide, remove, collapse), page settings and SEO, history with preview and restore, and publish, schedule, unpublish, archive, duplicate, make-home and delete flows. It warns about unsaved edits and supports Ctrl/Cmd+S.
  - Media library (upload with progress, search and filter, alt text and title editing, delete).
  - Menus editor (header, footer and legal tabs; page or URL links; header-only groups).
  - Site settings (identity, brand colours with a live contrast check, contact and social links, announcement, SEO defaults, sign-in panel).
  - Blog: posts list, post editor (rich text with maths, cover, author, categories, SEO, publish, schedule, unpublish, archive, preview), and a categories manager.
  - Newsletter subscriber list with CSV export. The export is audited and protected against spreadsheet formula injection.
- **Tests:**
  - 78 new backend tests in `apps/cms/tests`: pages and versioning, scheduling, permissions, public visibility, sections, media and seed.
  - New Vitest suites: `lib/cms-utils.test.ts` (sanitising, maths, link rules, empty section data, nested error flattening, contrast, slugs) and `newsletter-form.test.tsx`.
  - New Playwright spec `e2e/cms.spec.ts`: an editor creates a page, adds a CTA section and saves; the draft returns 404 to a visitor; after publishing, the visitor sees it. The CI e2e job now creates the editor account it needs.

### Verified (executed locally on 2026-10-19)

- `pytest`: **100 passed**. `ruff check` and `ruff format --check` are clean. `makemigrations --check` reports no changes. `spectacular --validate --fail-on-warn` passes.
- Frontend: `tsc --noEmit` and `eslint .` are clean. `vitest`: **53 passed**. `next build` succeeds (all CMS routes are dynamic, so the build does not need the API).
- Playwright against the dev servers (Django + `next dev` on the local Postgres): **6/6 passed** (auth and CMS specs, desktop and mobile Chromium). Test data was deleted afterwards.
- Manual smoke test through the Next proxy as a super admin:
  - Created a category and a post, patched the post and published it.
  - The blog list, post editor, categories, newsletter, post preview, public article and category-filtered blog pages all returned 200.
  - The CSV export returned 200 with the header row.
  - Smoke data was deleted afterwards.

### Not verified

- Celery beat has not run as a separate process; Redis is not installed locally. `publish_due_pages` is covered by tests that call it directly.
- R2 storage has not been used yet; media was stored on the local filesystem in development.
- Docker, Nginx and CI are still unexecuted (see M1).

### Known gaps / follow-ups

- ~~Catalog-backed sections need M3's catalog models.~~ Done in M3.
- Blog posts are not versioned. Saving a published post changes the live article, so the API requires `publish_blog` to edit one (ADR-011).
- Supported languages: only `default_language` (default `en`) is stored in site settings. Multilingual content is not implemented.
- There is no unsubscribe link flow yet; it needs transactional email (M6/M7). `unsubscribed_at` is already modelled.
- The CSP header is still deferred to M7. Video embeds need `frame-src` for youtube-nocookie.com and player.vimeo.com.

## M3 — Catalog and LMS (completed 2026-10-20)

### Built

- **Backend `apps/catalog`:** `Category` (two levels), `Course` (SEO fields, decimal price and sale with an end date, featured flag, outcomes and prerequisites, sequential mode), `CourseInstructor` (instructor / teaching assistant, public flag), `CourseModule`, `Lesson` (sanitised rich text with maths, YouTube/Vimeo video, preview and published flags), `LessonResource` (private file or external link).
  - Policies (`policies.py`): managers and publishers see every course; authors and TAs see only courses they teach; only managers change price, featured status, the team and a live course's address.
  - Services: create (the creator joins the team), publish checks (`publish_problems`), status changes, delete rules, team replacement, full-curriculum reorder with 409 on stale input, module and lesson rules. All mutations are audited.
  - Resources (`resources.py`): content-detected types, private storage, attachment-only delivery, signed URLs with object storage.
  - Catalog-backed CMS sections: featured courses (featured flag, newest, or a category), course collection, course categories, instructors, with a reference picker endpoint for the page builder.
  - `seed_catalog` command: two demo courses labelled "(Demo)", published only when `--instructor` names an account.
- **Backend `apps/learning`:** `Enrollment` (unique per user and course; free, purchase or staff grant; revocable without losing progress) and `LessonProgress`.
  - One access service (ADR-016), free enrollment (402 for paid courses), progress recording with server-derived course completion, learner endpoints, staff enrollment management (grant by email, revoke, reinstate, per-lesson progress) and a scoped course list for it (ADR-018).
  - Roles: content editors get `manage_catalog` and `publish_courses`; instructors `author_assigned_courses`; support staff `manage_enrollments` and `view_learner_progress`.
- **Public frontend:** `/courses` catalog (search, category, level, price, ordering, pagination), course page (outline, team, price, enroll panel, JSON-LD, SEO), course sections on CMS pages, courses in `sitemap.xml`.
- **Learner frontend:** `/learn/{slug}` player with outline, lesson view (video, rich text, maths, resource downloads), locked and preview states, mark complete and continue; `/dashboard/courses` and "continue learning" on the dashboard.
- **Staff frontend:**
  - `/admin/catalog`: course list.
  - Course editor: details, pricing, SEO, publish flow with listed problems, curriculum builder (modules, lessons, reorder, move between modules), teaching team.
  - Lesson editor (body, video preview, visibility, resources with multi-file upload).
  - `/admin/catalog/categories`.
  - `/admin/learning/enrollments` (filters, grant, revoke and restore, progress dialog).
  - A "Learning" nav section gated per permission.
- **Tests:** 50 new backend tests (`apps/catalog/tests`, `apps/learning/tests`: publishing rules, field-level permissions, instructor scoping, lesson access including previews and sequential locks, revoked learners, paid-course refusal, resource validation and authorised download, CMS sections, seed). New Vitest suites `lib/catalog.test.ts`, `enroll-panel.test.tsx`, `lesson-progress.test.tsx`. New Playwright spec `e2e/learning.spec.ts`: an editor creates a course, assigns an instructor, adds a module and lesson, publishes; a new student registers, finds it, is refused the lesson before enrolling, enrolls, completes the lesson, and progress survives a reload. CI creates the instructor account it needs.

### Verified (executed locally on 2026-10-20)

- `pytest`: **150 passed**. `ruff check` and `ruff format --check` are clean. `makemigrations --check` reports no changes. `spectacular --validate --fail-on-warn` passes.
- Frontend: `tsc --noEmit` and `eslint` are clean. `vitest`: **68 passed**. `next build` succeeds.
- Playwright against the dev servers (Django + `next dev` on the local Postgres): **8/8 passed** (auth, CMS and learning specs, desktop and mobile Chromium). The courses and learner accounts it created were deleted afterwards; the `e2e-editor` and `e2e-instructor` accounts remain in the local dev database for re-runs.
- `seed_catalog --instructor demo-instructor@example.com` published both demo courses; `/`, `/courses`, `/sitemap.xml` and the public course API return 200 through the Next proxy.

### Not verified

- Object storage (signed URL redirect for private files) has not run against R2; locally files are streamed from `private_media/`. The S3 branch is covered only by reading, not by a test against a bucket.
- Docker, Nginx, Redis/Celery and CI are still unexecuted (see M1).

### Known gaps / follow-ups

- Paid courses can't be bought yet: the course page explains how to contact the team, and staff grant access after confirming payment. M5 adds orders and verified payments, creating `purchase` enrollments.
- Assignments and submissions are not built; they belong with grading in M4 (or M6 with certificates).
- Videos are YouTube/Vimeo embeds. Protected streaming needs a managed video service (documented in CLAUDE.md §16), not yet chosen.
- `/admin/learning/courses/` is capped at 500 courses (ADR-018).
- Course bundles and discounts beyond a single sale price come with coupons in M5.

## M4 — Exam engine (completed 2026-10-20)

### Built

- **Backend `apps/assessments`:**
  - **Models:** `Subject`, `Topic` (with subtopics), `Question` (single, multiple, true/false; maths; image; tags; marks; status), `QuestionOption` (private `is_correct`), `QuestionVersion`, `Exam` (full configuration), `ExamQuestion`, `ExamAttempt`, `AttemptQuestion` (snapshot), `AttemptAnswer`. DB constraints are described in `database.md`.
  - **Policies:** a new Exam Coordinator role (ADR-025). Instructors author for courses they teach; TAs read their courses' exams and results.
  - **Bank:** question CRUD with versioning on content change; questions used by an exam can only be retired. CSV/XLSX import is all or nothing, with a per-row report; CSV export.
  - **Exams:**
    - Validated configuration, plus publish checks that list every problem at once.
    - Scoring is frozen after publish (ADR-024). The question list is replaced in one go.
    - Status changes, manual result release, staff results list, analytics and CSV export.
  - **Attempts** (`attempts.py`):
    - Eligibility (window, enrollment, attempt limit) and one open attempt per learner.
    - A snapshot is taken at start, with random draws and shuffles from `SystemRandom`. The server sets the deadline.
    - Answer saves are validated against the snapshot. A no-revisit mode is available.
    - Finalisation is idempotent and runs under a row lock (ADR-021), with a 5 s grace window (ADR-022). Grading follows ADR-023.
    - A Celery beat task finalises abandoned attempts every minute; reads also finalise overdue attempts.
  - **Results** (`results.py`):
    - Release modes: immediate, after close, or manual.
    - Summary, topic breakdown, and a review whose answers and explanations each follow their own exam flag.
    - Rankings show initials only. Learners have attempt history; staff get analytics.
- **Staff frontend:**
  - `/admin/assessments/subjects`: subjects and topics.
  - `/admin/assessments/questions`: list with filters, an editor with maths, images, options and versions, and an import dialog with an error report.
  - `/admin/assessments/exams`: list and editor with tabs for settings, questions (picker, marks, order) and results (analytics, attempts, export). Includes the publish flow.
  - Nav entries are gated per permission.
- **Learner frontend:**
  - `/dashboard/exams`: list and attempt history with a trend chart.
  - `/dashboard/exams/{slug}`: rules, instructions, attempts, start or resume.
  - `/exam/{attemptId}`: the full-screen player.
    - Countdown corrected by the server clock, with auto-submit at the deadline and a resync when the tab becomes visible.
    - Autosave queue with offline retry and an honest save indicator.
    - Flags, question navigator, no-revisit mode, and a submit dialog with counts.
  - `/dashboard/exams/results/{id}`: score, topic chart and table, ranking, answer review.
  - The dashboard shows upcoming exams and recent results.
- **Fix found by E2E:** the answer queue's unmount cleanup set a "stopped" flag that React Strict Mode's remount never reset, so in development no answer was ever saved. It now resets on mount, and a Strict Mode regression test fails without the fix.
- **Dev/CI:** `DJANGO_E2E_RELAXED_THROTTLES=true`, read only by dev settings, raises the login and register limits for E2E runs. CI sets it and grants the E2E editor `exam_coordinator`.
- **Tests:**
  - 55 new backend tests in `apps/assessments/tests`: bank permissions and key privacy, versions, import (dry run, error report, XLSX) and export, publish checks, scoring freeze, eligibility, snapshots, deadline and grace, no-revisit, concurrent start (database constraint), duplicate submit and double finalise, expiry task, grading rules, release modes, review flags, ranking privacy, analytics.
  - New Vitest suites: `lib/assessments.test.ts` and `exam-player.test.tsx` (9 tests).
  - New Playwright spec `e2e/exams.spec.ts`:
    - A coordinator builds and publishes an exam through the UI.
    - A new learner takes it. The attempt payload has no key, an answer survives a reload, and the learner submits.
    - The server grades it 1/2. A late save is refused, and other users can't read the attempt.

### Verified (executed locally on 2026-10-20)

- Backend: `pytest` reports **205 passed**. `ruff check` is clean. `makemigrations --check` reports no changes. `spectacular --validate --fail-on-warn` passes.
- Frontend: `tsc --noEmit` and `eslint` are clean. `vitest` reports **86 passed**. `next build` succeeds, and the new routes are listed.
- Playwright against the dev servers (Django with `DJANGO_E2E_RELAXED_THROTTLES=true` + `next dev`): **10/10 passed** in one run (auth, CMS, learning, exams; desktop and mobile Chromium).
- Without the relaxed setting, running both projects back to back trips the real register/login throttles. That is expected behaviour, not a failure.

### Not verified

- The beat task has been tested by calling it directly. Celery/Redis are still not run locally (see M1).
- XLSX import is covered by tests with generated workbooks only, not with files exported from Excel or Google Sheets.

### Known gaps / follow-ups

- No regrade tool for fixing a wrong key after attempts exist (ADR-020).
- No partial credit option (ADR-023).
- Question images are public media (ADR-026).
- Assignments and submissions move to M6 with certificates.
- Anti-cheating is limited to what `security.md` lists; there is no proctoring.

## M5 — Commerce (completed 2026-10-22)

### Built

- `apps/commerce`:
  - Models: `Order`, `OrderItem` (title and price snapshots), `Coupon`, `CouponRedemption`, `Payment`, `PaymentEvent`, `Refund` and `CommerceSettings`.
  - Money is `Decimal(12,2)`. Constraints cover unique order numbers, payment references and provider references.
- Pricing (`pricing.py`):
  - Prices come from the database at order time, never from the browser.
  - Coupons can be percentage (with an optional cap) or a fixed amount, with a minimum subtotal, start and end dates, total and per-user limits, and a course scope.
  - A coupon is reserved under `select_for_update` inside the atomic `create_order`.
- Provider abstraction (`providers/`):
  - **Khalti** (KPG-2: initiate, then lookup) and **eSewa** (ePay v2: HMAC-SHA256 signed form, then the status API), both written from the official docs.
  - **Bank transfer**: the learner reports the transfer and finance approves or rejects it.
  - A development-only **sandbox** provider, refused in production settings.
- Confirmation (ADR-027):
  - A payment is confirmed only after the server asks the provider. Return-URL parameters are ignored.
  - Amount, currency, order and provider reference are all checked.
  - A mismatch or duplicate payment flags the order `needs_review` instead of guessing.
  - Lock order is order, then payment. Finalization is idempotent, and `PaymentEvent` records each step.
- After a verified payment:
  - `purchase` enrollments are created through `apps/learning` services. They are never duplicated, and a revoked enrollment is not silently re-granted.
  - A refund can optionally revoke access.
- Background jobs (Celery beat, every 5 min):
  - `commerce-reconcile-payments` re-asks providers about pending payments for 24 h.
  - `commerce-expire-orders` expires unpaid orders after `order_ttl_minutes` (default 60) and releases their coupons. Bank transfers are held 14 days.
- Webhook endpoint:
  - Only the sandbox posts to it: HMAC over `timestamp.body`, ±300 s window, unique event id.
  - Khalti and eSewa document no webhooks for these flows, so none were invented.
- Refunds are recorded after finance pays the money back through the merchant portal or bank (ADR-031). They are audited and capped at the refundable amount.
- Permissions:
  - `commerce.view_orders`, `manage_orders`, `manage_refunds`, `manage_coupons`, `view_revenue` and `manage_payment_settings`.
  - Finance Manager holds all six and Support holds `view_orders`. Neither gains exam or security access.
- Reports:
  - A revenue report (gross, refunds, net, by provider and by course) with a CSV/XLSX export (`common/spreadsheet.py`), limited to 366 days.
  - A transfer-review queue.
- Throttling: the `payment` scope allows 30/min.
- Frontend:
  - `/checkout` (method picker, coupon field, server-priced summary), `/checkout/complete/[ref]` (polls the server's verdict), `/checkout/sandbox/[ref]`.
  - `/dashboard/orders` and `/dashboard/orders/[number]`: receipt with print, bank-transfer form, pay again, cancel.
  - Admin `/admin/commerce/{orders,orders/[number],coupons,revenue,settings}`.
  - The course enroll panel shows "Buy now" for paid courses.
- Playwright spec `e2e/commerce.spec.ts`:
  - The editor publishes a paid course. A new learner is refused the lesson.
  - The learner buys through the sandbox gateway and then gets the lesson, the course player and a "Paid" order in history.

### Verified (executed locally on 2026-10-22)

- Backend: `pytest` reports **286 passed** (81 commerce). `ruff check` and `ruff format --check` are clean. `makemigrations --check` reports no changes. `spectacular --validate --fail-on-warn` passes.
- Frontend: `tsc --noEmit` and `eslint` are clean. `vitest` reports **98 passed** (13 files). `next build` succeeds, and all commerce routes are listed.
- Playwright against the dev servers (Django with `DJANGO_E2E_RELAXED_THROTTLES=true PAYMENTS_ENABLE_SANDBOX=true`): **12/12 passed** (auth, CMS, commerce, exams, learning; desktop and mobile Chromium).
- Manual smoke test as super admin: every admin commerce API and page returned 200. E2E data was then deleted from the dev database.

### Not verified

- **Real Khalti and eSewa**: there are no merchant or sandbox credentials. The providers are unit-tested with mocked HTTP responses shaped like the official docs. `docs/deployment.md` lists the activation and staging test steps.
- The Celery beat jobs have been tested by calling the tasks directly. Celery, Redis, Docker, Nginx and CI are still not run locally (see M1).

### Known gaps / follow-ups

- Refunds are not sent through provider refund APIs (ADR-031).
- The checkout UI buys one course at a time. The API accepts up to 10 items, but there is no cart or bundle UI.
- No tax invoice or VAT handling. The receipt is a printable order summary.
- Production gateway URLs must be confirmed when merchant accounts are opened.

## M6 — Live classes, assignments and certificates (completed 2026-10-23)

### Built

- `apps/live_classes`:
  - Models: `Batch`, `BatchMembership`, `ClassSession` and `AttendanceRecord`. Timestamps are stored in UTC and shown in Asia/Kathmandu (ADR-036).
  - One-time sessions, plus weekly repeats (`repeat_weeks` 1–26). Cancel and reschedule notify members.
  - Provider interface (`providers.py`) for Google Meet, Zoom and other links. Links are instructor-managed (ADR-033); there is no `MeetingIntegration` model until OAuth is implemented.
  - The join link is a POST that only works for batch members, from 15 minutes before the start until the end (ADR-034). Joins are logged as evidence. Staff mark attendance; nothing claims automatic attendance or recordings (ADR-035).
  - Celery beat `live-classes-send-reminders` (every 5 min) sends one reminder 60 minutes ahead.
  - Roles: instructors and TAs teach assigned classes, support views every class, and only super admins manage every class (ADR-037).
- Assignments (`apps/learning`):
  - `Assignment` and `Submission`, with one submission per learner (ADR-038) and private file uploads.
  - Grading (`graded` / `returned`; returning needs feedback), with notifications.
  - Editors author assignments but can't read submissions (ADR-039).
- `apps/notifications`: in-app notifications with an unread count and mark-read, plus an optional email copy that never contains meeting links (ADR-043).
- `apps/certificates`:
  - `CertificateTemplate`, `CertificateRule` (lessons, an optional exam pass, optional graded assignments) and `Certificate` with a unique `HXN-YYYY-XXXXXXXX` number.
  - Issued only by the server, from server records, idempotently (ADR-040). Triggers: lesson completion, exam finalisation, result publication, grading, the learner's claim and a staff bulk check.
  - Public verification (throttled; shows only what the printed certificate shows), revocation and reinstatement (audited; ADR-041), and a reportlab PDF rendered on demand (ADR-042).
- Frontend:
  - `/dashboard/classes`, `/dashboard/assignments`, `/dashboard/certificates`, `/dashboard/notifications`; the dashboard home shows upcoming classes and certificates.
  - Admin `/admin/live-classes/...` (batches, members, sessions, attendance), assignment authoring and review, `/admin/certificates/{templates,rules,issued}`.
  - Public `/certificates/verify` and `/certificates/verify/[number]`.
  - Fixes: dialog header and footer no longer scroll away (`shrink-0`, scrolling body), and table scroll wrappers are `relative` so `sr-only` header text can't widen mobile pages.
- Playwright specs `e2e/live-classes.spec.ts` and `e2e/certificates.spec.ts` (publish, rule, learner completion, PDF, public verify, revoke, and no horizontal overflow on mobile).

### Verified (executed locally on 2026-10-23)

- Backend: `pytest` reports **381 passed** (61 live classes, 16 assignments, 11 certificates, 7 notifications). `ruff check` and `ruff format --check` are clean. `makemigrations --check` reports no changes. `spectacular --validate --fail-on-warn` passes.
- Frontend: `tsc --noEmit` and `eslint` (including `e2e/`) are clean. `vitest` reports **125 passed** (22 files). `next build` succeeds.
- Playwright against the dev servers: **16/16 passed** (auth, CMS, commerce, exams, learning, live classes, certificates; desktop and mobile Chromium). E2E data was then deleted from the dev database.

### Not verified

- **Google Meet and Zoom APIs**: no OAuth apps or credentials. Links are pasted by instructors; `docs/deployment.md` lists what API work would need.
- **Real email**: the console backend was used. SMTP, SPF/DKIM/DMARC are untested.
- The reminder task has been tested by calling it directly. Celery beat, Redis, Docker, Nginx and CI are still not run locally (see M1).
- Certificate PDFs use built-in Helvetica/Times, which can't draw Devanagari names (see `docs/deployment.md`).

### Known gaps / follow-ups

- No automatic meeting creation, attendance import or recording retrieval.
- Template edits change certificates already issued, because PDFs are rendered on demand (ADR-042).
- Notifications have no per-user email preferences yet.

## M7 — Production readiness (completed locally 2026-10-24)

### Built

- **Part 1** (commit 6f07a14):
  - A nonce-based Content-Security-Policy from `proxy.ts` / `lib/csp.ts`, with Zod running jitless (ADR-044).
  - Server renders forward the visitor IP and request ID to Django (ADR-045).
  - CI gains `check --deploy`, `pip-audit` and `npm audit`.
  - `e2e/csp.spec.ts`.
- **Observability:**
  - `common/logging.py` adds a JSON formatter, enabled with `LOG_FORMAT=json`. Each line carries the request ID.
  - `/readyz/` now checks the cache as well as the database, and returns 503 with the failing part.
  - `tests/test_operations.py` covers the health endpoints, request IDs, the formatter and throttle identity behind one proxy, including a spoofed multi-hop `X-Forwarded-For`.
- **Performance:**
  - The `assert_constant_queries` fixture (ADR-047) has query-count tests for every list endpoint with per-row data, across catalog, CMS, learning, assessments, commerce, live classes, certificates and notifications.
  - Fixed N+1s, with query counts going from 2 rows to 8 rows before the fix:
    - me/enrollments, 6→18, fixed with `progress_summaries()`;
    - the exam catalog, 8→26, fixed with `with_pool_totals()`, prefetched own attempts and the `eligibility()` hints;
    - admin live sessions, 58→88;
    - admin batches, fixed by prefetching instructor links and having `teaching_role` use them.
- **Authorisation audit:**
  - `tests/test_admin_permissions.py` (ADR-048) walks all 119 admin routes and checks every method for anonymous callers, students and 13 cross-domain role/prefix pairs.
  - It found that assessments viewsets checked access only in `get_queryset`, so a finance manager's POST reached serializer validation (400 instead of 403), and `course-options` answered 200 with an empty list. Nothing was written and no answer keys were exposed, but the policies now run as DRF permission classes first.
- **Accessibility:**
  - `@axe-core/playwright` 4.13.0 is pinned.
  - `e2e/axe.ts` and `e2e/a11y.spec.ts` check 7 public pages, a course page and 15 dashboard/admin pages, with status checks.
  - The exams spec runs axe inside the player with an answer selected.
  - Contrast fixes use `teal-700` / `teal-800` for text-bearing fills (ADR-046). The logo is exempt and excluded.
  - Every CMS-accepted accent colour still gives at least 5.16:1 contrast, checked numerically.
- **Backups:**
  - `backup.sh` and `restore.sh` gain a `DATABASE_URL` mode for managed PostgreSQL (ADR-049). Pruning no longer relies on `xargs -r`, and dumps are created with umask 077.
  - The restore drill is recorded in `docs/deployment.md`.
- **Docs:**
  - `docs/deployment.md`: the launch-readiness review, monitoring (readiness, JSON logs) and backups.
  - `docs/security.md`: the authorisation audit, logging, and the accepted dev-only npm advisories.
  - README: E2E against a production build, the axe and CSP specs, backups.

### Verified (executed locally on 2026-10-24)

- **Backend:**
  - `pytest` reports **418 passed**.
  - `ruff check` and `ruff format` are clean.
  - `makemigrations --check` reports no changes.
  - `spectacular --validate --fail-on-warn` passes.
  - `check --deploy --fail-level WARNING` under `config.settings.prod` reports no issues (1 silenced: HSTS preload).
  - `pip-audit` finds no known vulnerabilities.
- **Frontend:**
  - `tsc --noEmit` and `eslint` are clean.
  - `vitest` reports **134 passed** (24 files).
  - `next build` succeeds.
  - `npm audit --omit=dev` finds 0 vulnerabilities. The full audit shows 2 moderate advisories, both dev-only (see `docs/security.md`).
- **Playwright** against `next start` (production build) and the dev Django server: **40/40 passed** in 1.4 min, desktop and mobile Chromium, including every axe and CSP check. E2E data was then purged from the dev database.
  - An earlier run against `next dev` took 3.3 h and failed 16 tests on navigation timeouts while routes compiled. It passed unchanged on the production build, so the README now says to use one.
- **Restore drill** (`DATABASE_URL` mode, details in `docs/deployment.md#backups`): two backups were taken and pruned to one. The dump was restored into a fresh scratch database and then again on top of it. All 61 tables had the same row counts as the source, `migrate --check` was clean, and the abort path exited 1. The scratch database was dropped afterwards.

### Not verified

- **Infrastructure:** Docker Compose, Nginx, Gunicorn, Celery, Redis and the GitHub Actions workflow have still never run (no Docker locally). The compose mode of the backup scripts is untested.
- **Load testing:** none has been run. It needs the target VPS (the staging checklist includes it).
- **External services:** real email, Khalti, eSewa, Meet and Zoom (as in M5 and M6).
- **Accessibility:** only automated checks have run. A manual keyboard and screen-reader pass has not been done.

### Known gaps / follow-ups

- There is no caching layer for public CMS and catalog reads yet. Pages render dynamically (ADR-006 and ADR-044), and the constant query counts keep that cheap; add per-view caching if the load test calls for it.
- Index review for hot filters has been done only through the query-count work. Run `EXPLAIN ANALYZE` on staging-sized data.
- There is no error-reporting service (Sentry or similar) yet. If one is added, PII must stay off.
- The staging launch: run the staging validation checklist and the launch-readiness review in `docs/deployment.md`.

## Demo data and IOE MSc practice test (2026-10-24)

### Built

- **`seed_demo`:** creates a demo instructor with no usable password, then runs the three seeds below. A re-run never changes an existing account's password or profile.
- **`seed_cms`:**
  - **Home page:** hero, featured courses, stats, categories, features, instructors, sample testimonials, FAQ, newsletter and a call to action.
  - **About page.**
  - **Menus:** the header and footer menus now link to Courses.
  - **Blog:** two categories and three posts (the IOE pattern with source links, how practice tests work, and a weekly maths plan).
  - **Upgrades:** content from an earlier seed is upgraded only if nobody has edited it (ADR-050).
- **`seed_catalog`:** two new categories (mathematics, under engineering, and entrance preparation). It now has six demo courses with NPR prices; the IOE course costs Rs. 4,500, on sale for Rs. 3,500. Three courses are featured.
- **`seed_exams` (data in `apps/assessments/demo_ioe.py`):** "IOE MSc Entrance — Section A Practice (Demo)", a 60-minute practice test with negative marking.
  - **Reasoning:** 5 questions worth 2 marks each, with 0.2 off for a wrong answer.
  - **Maths:** 40 questions worth 1 mark each, with 0.1 off for a wrong answer, split 3/8/6/12/3/4/4 across the syllabus topics.
  - **Total:** 50 marks.
  - **Questions:** all written for this project, with KaTeX formulas. The 15 answers that can be computed were checked numerically.
  - **Sources:** edusanjal (exam and syllabus pages), ioenotes and piacademy.
- **Fixes:**
  - `rich_text_is_empty` treated an option made only of a formula (such as √7) as empty.
  - Base-layer CSS (ADR-052).
  - A mint badge text shade with enough contrast.
  - The disabled pagination labels on lists had too little contrast; they now meet it and carry `aria-disabled`.

### Verified (executed locally on 2026-10-24)

- **Backend:** 432 tests pass. Ruff and the migration check are clean.
- **Frontend:** tsc, eslint and vitest (134) pass, and the build succeeds.
- **Playwright:** 40 of 40 pass against the production build.
- **Dev database:** seeded, and it renders: /, /courses, a course page, /blog, a post and /about.

### Not verified

- Section B (the programme-specific part) of the IOE MSc syllabus. No reliable current source was found, so none is seeded.
- The exam pattern has not been checked against the official IOE notice. The seeded content tells learners to check it themselves.

## Fix: dashboard crash for learners with exam results (2026-10-30)

- **Symptom:** after sign-in, /dashboard and /dashboard/exams showed "This page couldn't load" for any learner with a graded attempt.
- **Cause:** `formatDate` in `frontend/lib/utils.ts` always added `dateStyle: "medium"`. Intl throws `TypeError: Invalid option` when `dateStyle` is mixed with fields such as `day`/`month`, and the attempt-history chart passes those fields. The admin revenue report had the same problem.
- **Fix:** the default `dateStyle` now applies only when the caller asks for no individual fields.
- **Tests:** a vitest regression test (it fails without the fix), and the exam E2E now opens /dashboard and /dashboard/exams after grading and asserts there are no page errors. vitest 135, tsc, eslint and the build pass; Playwright 40/40.
- E2E-run records and the debug account were purged from the dev database. The e2e-editor and e2e-instructor accounts and all demo data were kept.

## Staging deployment on the shared VPS (2026-10-30)

- Live at http://80.241.208.65:8090 (HTTP only, no domain yet). Layout, redeploy steps and what is still missing are in [deployment.md](deployment.md#shared-vps-staging-deployed-2026-10-30).
- New setting `DJANGO_SECURE_COOKIES` (default true; false only allowed with the SSL redirect off), covered by `backend/tests/test_prod_settings.py`. Backend tests: 435 pass.
- Verified on the server: migrations, collectstatic, `check --deploy` (only the four HTTP-only warnings), demo seed, all five units active, `/readyz/` 200. A Playwright smoke run against the server passed on desktop and mobile: learner sign-up, dashboard, catalog, course page, exams page with no page errors, and admin sign-in to /admin/cms/pages. The smoke accounts were deleted afterwards.
- The other sites on the server still respond. The only shared-service change was a graceful Nginx reload after `nginx -t`.
- Next: point the domain at the server, add HTTPS and turn the secure flags back on; configure SMTP, R2 and backups.

## Domain and HTTPS (2026-10-30)

- Live at **https://hexacademynepal.com**, behind Cloudflare in "Full" SSL mode. www, plain HTTP and the old `:8090` address all 301 to the apex. A Let's Encrypt certificate was issued by webroot (valid until 2027-01-28); the shared `certbot.timer` renews it and reloads Nginx (`certbot renew --dry-run` passed).
- `.env` now has the secure-cookie and SSL-redirect flags on and the domain in the hosts and origins settings; `check --deploy` reports no issues. Visitor IPs come from a Cloudflare real-IP snippet included only in Hexacademy's server block.
- **Fix: pages hung after the SSL redirect was turned on.** Next's server-side calls to Django are plain HTTP, so Django redirected them. `forwardedHeaders` now passes `X-Forwarded-Proto` (vitest covers it; 136 pass). The same latent bug existed in the Compose setup.
- **Fix: React hydration error #418 and a CSP-blocked script on signed-in pages.** Cloudflare Email Obfuscation rewrote the user's email in the app shell. Nginx now sends `Cache-Control: no-transform` on Next responses (both the VPS and the Compose configs).
- Verified on the domain: `/`, `/courses`, `/blog`, `/sitemap.xml` (https URLs), `/robots.txt`, `/login`, the API and `/readyz/` return 200. Playwright smoke run on desktop and mobile passed: sign-up sets a Secure, HttpOnly session cookie; the dashboard, course, exams and profile pages and admin sign-in show no page errors. The smoke accounts were deleted. All other sites on the server still return 200.
- Still to do: SMTP, R2 object storage, a payment gateway, scheduled backups; optionally Cloudflare "Full (strict)" and HSTS.

## Question import fixes and exam CSV import (2026-10-31)

- Questions 46–55 on the server showed raw LaTeX. The CSV that created them had every backslash doubled (`\\(\\frac…\\)`). They were repaired as new versions (all 309 stored formulas now parse in KaTeX), and the importer now rejects rows with doubled maths markers.
- New: **Import CSV** on an exam's Questions tab (`POST …/exams/{id}/import-questions/`). One file loads a full model test: the questions go into the bank (exam's course, ready unless the row says otherwise) and are appended to the draft exam with the row's marks. Backend tests cover dry run, all-or-nothing, draft-only and instructor scope; `e2e/exam-import.spec.ts` covers the UI (passed desktop and mobile, plus the existing exam E2E).

## How to continue

1. Read this file, then `docs/architecture.md` and `docs/decisions.md`.
2. All seven milestones are done locally. Next is the **staging launch**, which needs a server:
   - Provision a VPS and work through the "Staging validation checklist" and the "Launch-readiness review" in `docs/deployment.md`, including the compose-mode restore drill and a load test.
   - Activate one payment gateway with merchant test credentials, then configure SMTP.
   - The owner replaces the demo content and legal pages.
   - After launch, see the deferred items: provider refund APIs, Meet/Zoom OAuth, a cart and bundles, email preferences, a Devanagari certificate font, and caching if the load test needs it.
3. Local dev:
   - `python manage.py seed_demo` (or the individual `seed_cms`, `seed_catalog --instructor <email>` and `seed_exams`).
   - E2E needs `E2E_EDITOR_EMAIL`, `E2E_EDITOR_PASSWORD`, `E2E_INSTRUCTOR_EMAIL` and `E2E_INSTRUCTOR_PASSWORD`. The editor needs the `content_editor` and `exam_coordinator` roles; the instructor needs `instructor`.
   - Start Django with `DJANGO_E2E_RELAXED_THROTTLES=true` for full E2E runs. The commerce spec also needs `PAYMENTS_ENABLE_SANDBOX=true` and any `PAYMENTS_SANDBOX_SECRET` (`dev.py` enables the sandbox by default).
   - Run E2E against `npm run build && npm run start`, not `next dev`.
   - E2E specs create `e2e-` courses and learners in the dev database; delete them afterwards (Refund and Payment rows first, since they PROTECT orders).
4. Keep the verification bar: tests and builds must actually run before anything is marked done.
