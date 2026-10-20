# Development progress

Update this file at the end of every milestone. Only record what was actually executed and verified.

## Milestones

| # | Milestone | Status |
| --- | --- | --- |
| M1 | Foundation: repo, settings, custom user, roles, auth, audit, UI kit, dashboard/admin shells, infra skeleton, docs | **Done** (infra not yet run; see below) |
| M2 | CMS and public website: pages + versions + scheduling, section builder, menus, site settings, blog, SEO/sitemap, media library | **Done** (catalog-backed sections move to M3) |
| M3 | Catalog and LMS: courses → modules → lessons → resources, enrollment, progress, course player, instructor tools | **Done** (assignments move to M4/M6; paid enrollment waits for M5) |
| M4 | Exam engine: question bank, exams, server-authoritative attempts, autosave, grading, results and analytics | **Done** (assignments move to M6) |
| M5 | Commerce: pricing, coupons, orders, Khalti/eSewa providers (from official docs), webhooks, refunds | Next |
| M6 | Live classes (Meet/Zoom provider abstraction) and certificates with public verification | Planned |
| M7 | Production readiness: CSP, observability, performance, accessibility audit, load test, staging launch | Planned |

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
- The Khalti/eSewa default URLs in `config/settings/base.py` (`PAYMENTS`) were written from memory and **must be checked against the official documentation in M5** before any use.
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

## How to continue

1. Read this file, then `docs/architecture.md` and `docs/decisions.md`.
2. Next up is **M5: commerce** (`apps/commerce`):
   - Orders and order items that snapshot names and prices (Decimal), coupons and redemptions, payments and payment events, and refunds.
   - A provider abstraction. Khalti and eSewa must follow their **official** documentation only: no invented endpoints, signatures or env vars. Where the docs can't be confirmed, ship the sandbox provider (`PAYMENTS["ENABLE_SANDBOX_PROVIDER"]` already exists in settings) and document the activation steps.
   - Server-side verification of every callback, idempotent webhook processing, and `purchase` enrollments created only after verified payment (reuse `apps/learning` services).
   - Manual bank-transfer verification (audited), order history, and reconciliation and revenue reports for finance managers. Finance must not gain exam or security access.
3. Local dev:
   - `python manage.py seed_cms` and `python manage.py seed_catalog --instructor <email>`.
   - E2E needs `E2E_EDITOR_EMAIL`, `E2E_EDITOR_PASSWORD` and `E2E_INSTRUCTOR_EMAIL`. The editor needs the `content_editor` and `exam_coordinator` roles.
   - Start Django with `DJANGO_E2E_RELAXED_THROTTLES=true` for full E2E runs.
4. Keep the verification bar: tests and builds must actually run before anything is marked done.
