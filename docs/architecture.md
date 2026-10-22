# Architecture

## Overview

```
Browser ──► Cloudflare ──► Nginx ─┬─► Next.js (frontend:3000)  pages, SSR
                                  ├─► Django/Gunicorn (backend:8000)  /api/, /django-admin/, /static/
                                  └─► /media/ (public uploads volume, when not using R2)
Django ──► PostgreSQL (internal network only)
Django ──► Redis (cache, Celery broker) ◄── Celery worker + beat
Django ──► Object storage (R2): public bucket + private bucket (signed URLs)
```

- **Django is the single source of truth.** It owns authentication, authorisation, prices, exam timing and grading. Next.js renders UI and never makes trust decisions.
- **Same-origin API.** In production Nginx sends `/api/` to Django, so the browser talks to one origin and cookies stay first-party. In development Next rewrites `/api/*` to Django (`next.config.ts`).
- **Server components** fetch with the visitor's cookies forwarded (`lib/api/server.ts`). **Client components** use `lib/api/client.ts`, which adds the CSRF header to unsafe requests.

## Backend layout

```
backend/
  config/            settings (base/dev/test/prod), urls, celery, wsgi/asgi
  common/            error envelope, pagination, permissions, request-id middleware, health checks
  apps/
    accounts/        custom User (email login), profiles, roles, auth flows, user admin API
    audit/           append-only audit log + record() service
    cms/             site settings, pages + versions, section registry, menus, media library, blog, newsletter (M2)
    catalog/ learning/ live_classes/ assessments/ commerce/
    certificates/ notifications/ analytics/       (added milestone by milestone)
  tests/             cross-app tests
```

Conventions:

- Business rules live in each app's `services.py`. Views validate input, check permissions, call a service and serialise the result.
- Every sensitive action calls `apps.audit.services.record()`.
- Errors always use `{"error": {"code", "message", "details"}}` (`common/exceptions.py`).
- Each app's permissions are declared on its models (`Meta.permissions`) and mapped to roles in `apps/accounts/roles.py`, which syncs groups after every `migrate`.

## Frontend layout

```
frontend/
  app/
    (public)/        CMS home page, /[slug] pages and the blog, wrapped in the site header and footer
    preview/         staff-only previews of draft pages and posts
    (auth)/          login, register, forgot/reset password, verify email
    dashboard/       student area (server-gated by requireUser)
    (public)/courses catalog and course pages
    learn/           course player (server-rendered, access checked by the API per lesson)
    admin/           staff area (server-gated by requireStaff; each page re-checks its permission)
  components/ui/     accessible primitives (button, field, dialog, toast, …)
  components/shell/  dashboard/admin chrome
  components/cms/    public chrome, the section renderer and section components; admin/ holds the editors (section builder, rich text, media picker, SEO)
  components/courses/  course cards, price tag, enroll panel; admin/ holds the curriculum builder, team editor and resource manager
  components/learning/ player outline, lesson progress, enrolled-course cards
  lib/               API clients, auth helpers, validation schemas, formatting
  proxy.ts           optimistic redirect to /login when no session cookie exists
```

## CMS rendering

1. An editor's changes are saved to `Page.sections` (the draft). Each save that changes content also writes an immutable `PageVersion`.
2. Publishing points `published_version` at a version. The public API serialises that version only, so editing a live page never changes it until the page is published again.
3. `apps/cms/sections.py` is the single registry of section types. Each type declares typed fields (text, textarea, richtext, link, image, video, select, boolean, integer, list). The backend validates and cleans section data against the registry on every write. The admin UI fetches the descriptors from `/admin/cms/section-types/` and builds its forms from them, so adding a section type means a registry entry plus one React component in `components/cms/sections/`.
4. Next server components fetch the published payload per request and render through `SectionRenderer`; types the frontend doesn't know are skipped. Rich text is sanitised again with DOMPurify, and maths placeholders are rendered with KaTeX.
5. Previews use the staff session: `/preview/pages/{id}` calls the staff preview endpoint with the visitor's cookies. There are no shareable preview tokens.

## Catalog and learning (M3)

- `apps/catalog` owns what is taught: categories, courses, teams, modules, lessons and resources. `policies.py` holds who may see, edit and publish a course; `services.py` the lifecycle rules (publish checks, reorder, team replacement); `resources.py` upload validation and file delivery; `cms_sections.py` registers the catalog-backed CMS sections (featured courses, course collection, course categories, instructors) so `apps/cms` never imports catalog models directly.
- `apps/learning` owns who learns: enrollments and lesson progress. `services.py` is the single place that answers "may this user open this lesson" and derives course completion.
- The public course page and the player are server components that call the API with the visitor's cookies. Progress buttons are small client components that post to the API and refresh.

## Exams (M4)

- `apps/assessments` owns the question bank, exams, attempts and results.
  - `policies.py`: who may see and change questions, exams and results.
  - `services.py`: bank and exam rules (versions, publish checks, freezing scoring fields after publish).
  - `importer.py`: CSV/XLSX import and export.
  - `attempts.py`: the attempt state machine (start, save, advance, submit, expire, grade).
  - `results.py`: release rules, review, topics, ranking and analytics.
  - `tasks.py`: the beat job that finalises overdue attempts.
- An attempt copies everything it needs (content, key, marks) into `AttemptQuestion` rows at start. Grading and review read only those rows.
- The learner player (`/exam/[attemptId]`) is a client component. It renders the server's attempt, queues answer saves one at a time (`use-answer-queue.ts`), and retries when offline. It submits on the server deadline. The result page is a server component.

## Commerce (M5)

- `apps/commerce` owns orders, payments, coupons and refunds.
  - `pricing.py`: the only place amounts are computed (sale prices, coupon rules and limits, per-item discount split).
  - `services.py`: the order and payment state machine (create, initiate, verify and apply, mark paid and enroll, cancel, expire, bank-transfer review, refunds, review flags). Lock order is always order, then payment.
  - `providers/`: one `PaymentProvider` interface (`initiate`, `verify`, `is_configured`) with Khalti, eSewa and sandbox implementations, plus a small HTTP helper with timeouts. Adding a provider means one module and a registry entry.
  - `sandbox.py`: the development gateway and its signed webhook. `reports.py`: revenue aggregation. `tasks.py`: the reconciliation and expiry beat jobs.
- Enrollment stays in `apps/learning` (`enroll_purchase`); commerce calls it and never writes enrollments directly.
- Frontend: `/checkout?course=` (quote, coupon, method), the provider redirect, `/checkout/complete/{reference}` (server verification with short polling), `/dashboard/orders` (history, receipts, bank-transfer form, pay again). Staff use `/admin/commerce/*`: orders (queues for transfers and flagged orders), coupons, revenue (chart and CSV) and payment settings.

## Roles

| Role | Scope |
| --- | --- |
| Super admin | Everything. Granted only from the CLI (`grant_role`), audited. |
| Content editor | CMS pages (incl. publishing), menus, site settings, blog, media, newsletter list (M2); public catalog (M3) |
| Instructor | Own courses and lessons (M3); questions and exams for courses they teach, plus read access to the shared active bank (M4); live sessions (M6) |
| Teaching assistant | Assigned courses: read-only course view and learner progress (M3); their courses' exams and results, never the bank (M4); attendance (M6) |
| Exam coordinator | The whole question bank including answer keys, every exam and every result (M4) |
| Finance manager | Orders, payment verification, bank-transfer review, refunds, coupons, revenue reports, payment settings. No answer keys, CMS, users or security settings (M5) |
| Support staff | User directory, activate/deactivate accounts, enrollments (grant, revoke, progress), read-only orders (M5) |
| Student | Own learning, exams, orders, certificates |

The UI hides what a user cannot use, but **every check is enforced again in the API**, including object-level checks (for example, an instructor may only edit their own courses).

## Background jobs

Celery runs in a worker plus beat. Without `REDIS_URL` (local dev and tests) tasks run eagerly. Each app adds its periodic jobs to `CELERY_BEAT_SCHEDULE` when it lands, for example exam-attempt finalisation (M4, every minute), payment reconciliation and unpaid-order expiry (M5, every 5 minutes), class reminders (M6) and scheduled page publishing (M2).
