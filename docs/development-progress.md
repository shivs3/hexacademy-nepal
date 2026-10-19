# Development progress

Update this file at the end of every milestone. Only record what was actually executed and verified.

## Milestones

| # | Milestone | Status |
| --- | --- | --- |
| M1 | Foundation: repo, settings, custom user, roles, auth, audit, UI kit, dashboard/admin shells, infra skeleton, docs | **Done** (infra not yet run; see below) |
| M2 | CMS and public website: pages + versions + scheduling, section builder, menus, site settings, blog, SEO/sitemap, media library | **Done** (catalog-backed sections move to M3) |
| M3 | Catalog and LMS: courses → modules → lessons → resources, enrollment, progress, course player, instructor tools | Next |
| M4 | Exam engine: question bank, exams, server-authoritative attempts, autosave, grading, results and analytics | Planned |
| M5 | Commerce: pricing, coupons, orders, Khalti/eSewa providers (from official docs), webhooks, refunds | Planned |
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

- Catalog-backed sections (featured courses, course categories, instructor profiles, course collections) need M3's catalog models. They are left out of the registry, rather than shipped as placeholders.
- Blog posts are not versioned. Saving a published post changes the live article, so the API requires `publish_blog` to edit one (ADR-011).
- Supported languages: only `default_language` (default `en`) is stored in site settings. Multilingual content is not implemented.
- There is no unsubscribe link flow yet; it needs transactional email (M6/M7). `unsubscribed_at` is already modelled.
- The CSP header is still deferred to M7. Video embeds need `frame-src` for youtube-nocookie.com and player.vimeo.com.

## How to continue

1. Read this file, then `docs/architecture.md`.
2. Next up is **M3**:
   - Create `apps/catalog` (categories, courses, instructors, pricing) and `apps/learning` (modules, lessons, resources, enrollment, progress). Add their permissions to the instructor, TA and content-editor roles.
   - Then add the catalog-backed section types to `apps/cms/sections.py`, with a matching React component in `components/cms/sections/`.
   - Private lesson files go in the private bucket and are served through signed URLs.
   - Start local dev with `python manage.py seed_cms` for the demo site. Run e2e with `E2E_EDITOR_EMAIL`/`E2E_EDITOR_PASSWORD` set (see `e2e/cms.spec.ts`).
3. Keep the verification bar: tests and builds must actually run before anything is marked done.
