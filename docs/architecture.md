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
    cms/ catalog/ learning/ live_classes/ assessments/ commerce/
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
    (auth)/          login, register, forgot/reset password, verify email
    dashboard/       student area (server-gated by requireUser)
    admin/           staff area (server-gated by requireStaff; each page re-checks its permission)
  components/ui/     accessible primitives (button, field, dialog, toast, …)
  components/shell/  dashboard/admin chrome
  lib/               API clients, auth helpers, validation schemas, formatting
  proxy.ts           optimistic redirect to /login when no session cookie exists
```

## Roles

| Role | Scope |
| --- | --- |
| Super admin | Everything. Granted only from the CLI (`grant_role`), audited. |
| Content editor | CMS pages, menus, blog, media (M2) |
| Instructor | Own courses, lessons, question bank, exams, live sessions (M3–M6) |
| Teaching assistant | Assigned courses: grading support, attendance (M3–M6) |
| Finance manager | Orders, payments, refunds, coupons. No answer keys or security settings (M5) |
| Support staff | User directory, activate/deactivate accounts, enrollment help |
| Student | Own learning, exams, orders, certificates |

The UI hides what a user cannot use, but **every check is enforced again in the API**, including object-level checks (for example, an instructor may only edit their own courses).

## Background jobs

Celery runs in a worker plus beat. Without `REDIS_URL` (local dev and tests) tasks run eagerly. Each app adds its periodic jobs to `CELERY_BEAT_SCHEDULE` when it lands, for example exam-attempt finalisation (M4), class reminders (M6) and scheduled page publishing (M2).
