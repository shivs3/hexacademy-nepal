# Development progress

Update this file at the end of every milestone. Only record what was actually executed and verified.

## Milestones

| # | Milestone | Status |
| --- | --- | --- |
| M1 | Foundation: repo, settings, custom user, roles, auth, audit, UI kit, dashboard/admin shells, infra skeleton, docs | **Done** (infra not yet run; see below) |
| M2 | CMS and public website: pages + versions + scheduling, section builder, menus, site settings, blog, SEO/sitemap, media library | Next |
| M3 | Catalog and LMS: courses → modules → lessons → resources, enrollment, progress, course player, instructor tools | Planned |
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

- The interim home page and auth-panel tagline are static text. M2 replaces them with CMS-managed content (site settings and homepage sections).
- `/courses`, `/terms` and `/privacy` links will 404 until M2/M3.
- The Khalti/eSewa default URLs in `config/settings/base.py` (`PAYMENTS`) were written from memory and **must be checked against the official documentation in M5** before any use.
- The CSP header is deferred to M7.
- Staff role permission sets are minimal until each domain app adds its permissions to `apps/accounts/roles.py`.

## How to continue

1. Read this file, then `docs/architecture.md`.
2. Next up is **M2**: create `apps/cms` and add it to `LOCAL_APPS`. Add its permissions to the `content_editor` role, register `publish_scheduled_pages` in `CELERY_BEAT_SCHEDULE`, and build the public routes in the frontend.
3. Keep the verification bar: tests and builds must actually run before anything is marked done.
