# Hexacademy Nepal

CMS + LMS + online examination platform for [hexacademynepal.com](https://hexacademynepal.com).

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
