# Hexacademy Nepal

CMS + LMS + online examination + course commerce platform for [hexacademynepal.com](https://hexacademynepal.com).

| Part | Stack |
| --- | --- |
| `frontend/` | Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, React Hook Form + Zod |
| `backend/` | Django 5.2 LTS, Django REST Framework, drf-spectacular (OpenAPI), Celery |
| Data | PostgreSQL 17, Redis (cache + Celery broker), S3-compatible object storage (Cloudflare R2) |
| Ops | Docker Compose, Nginx, Gunicorn, GitHub Actions |

Current status and what is next: [docs/development-progress.md](docs/development-progress.md).

## Local development

Prerequisites: Python 3.12, Node 24+, PostgreSQL 17. Redis is optional locally (Celery runs tasks eagerly and the cache falls back to memory without it).

```bash
# Databases (once)
createdb hexacademy_dev
createdb hexacademy_test

# Backend
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver          # http://127.0.0.1:8000, API docs at /api/docs/

# Frontend (second terminal)
cd frontend
npm install
npm run dev                                   # http://localhost:3000 (proxies /api to Django)
```

Create your first account at `/register`, then grant yourself super admin from the CLI (deliberately not possible through the API):

```bash
cd backend && .venv/bin/python manage.py grant_role you@example.com --role super_admin
```

Settings come from environment variables; see [.env.example](.env.example). Local dev works with no `.env` at all.

## Tests and checks

```bash
cd backend
.venv/bin/pytest                 # add --create-db after model changes
.venv/bin/ruff check . && .venv/bin/ruff format --check .

cd frontend
npm run lint && npm run typecheck && npm test && npm run build
npm run e2e                      # needs both dev servers running; uses the dev database
```

The CMS and learning end-to-end tests are skipped unless `E2E_EDITOR_EMAIL` and `E2E_EDITOR_PASSWORD` name a staff
account with the `content_editor` role (`python manage.py grant_role <email> --role content_editor`). The learning test
also needs `E2E_INSTRUCTOR_EMAIL`, an account with the `instructor` role. The exams test also needs the editor to hold the `exam_coordinator` role
(`python manage.py grant_role <email> --role exam_coordinator`). The suite registers and signs in many accounts, so start
the local Django server with `DJANGO_E2E_RELAXED_THROTTLES=true` (development settings only) or the real login and
registration limits will throttle a full run.
The commerce test buys a course through the built-in sandbox gateway, which development settings enable by default
(`PAYMENTS_ENABLE_SANDBOX`); it skips itself when `/api/v1/payments/methods/` reports `sandbox: false`.
The live-classes test signs in as the instructor too, so it also needs `E2E_INSTRUCTOR_PASSWORD`. The certificates test
uses the editor (who needs the `content_editor` role, which can manage certificates) and the instructor email.

Demo content, clearly labelled as such: `python manage.py seed_cms` (pages, menus, settings) and
`python manage.py seed_catalog --instructor <email>` (two demo courses; without `--instructor` they stay drafts).

## Production

`docker compose up -d --build` with a filled-in `.env`. Read [docs/deployment.md](docs/deployment.md) first.

## Documentation

- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [API](docs/api.md)
- [Security](docs/security.md)
- [Deployment](docs/deployment.md)
- [Decisions (ADRs)](docs/decisions.md)
- [Development progress](docs/development-progress.md)
