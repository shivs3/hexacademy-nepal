# Deployment

> **Status:** the Compose stack, Dockerfiles and Nginx config are written, but they have **not yet been run**. Docker and Nginx were not available on the development machine. Validate everything on a staging server before production (see the checklist below).

## Target

A single VPS (2 vCPU / 4 GB RAM is enough to start) running Docker Compose, behind Cloudflare. Media lives in Cloudflare R2.

## First deployment

1. Point DNS for `hexacademynepal.com` and `www` at the server through Cloudflare (proxied).
2. On the server: install Docker Engine + the Compose plugin, and allow only ports 22 and 80/443 in the firewall.
3. Clone the repo and create `.env` from `.env.example`:
   - `DJANGO_SECRET_KEY`: `python3 -c "import secrets; print(secrets.token_urlsafe(64))"`
   - a strong `POSTGRES_PASSWORD`
   - SMTP credentials, R2 credentials (`USE_S3_STORAGE=true`) and payment keys from the merchant dashboards
4. Populate the Cloudflare real-IP list: `infrastructure/nginx/update-cloudflare-ips.sh` (and add a weekly cron job).
5. Build and start everything: `docker compose up -d --build`. The `migrate` service runs migrations before the backend, worker and beat start.
6. Create the first super admin: register on the site, then run
   `docker compose run --rm backend python manage.py grant_role you@example.com --role super_admin`.
7. Check `curl -fsS https://hexacademynepal.com/readyz/`.

## Shared-VPS staging (deployed 2026-10-30)

A staging copy runs without Docker on a VPS shared with other sites, at **http://80.241.208.65:8090**. Everything it uses is separate from the other apps:

| Piece | Where |
| --- | --- |
| Code | `/var/www/SHIV/hexacademy-nepal`, owned by the `hexacademy` system user (no login shell) |
| Nginx | `/etc/nginx/sites-available/hexacademy-nepal`, on port 8090 only; zones and upstreams are prefixed `hexacademy_` |
| Django (Gunicorn) | `hexacademy-backend.service` on `127.0.0.1:8050` |
| Next.js | `hexacademy-frontend.service` on `127.0.0.1:3050`, using a private Node 24 in `.node/` (jsdom needs Node 22.22 or newer; the system Node 20 serves other sites) |
| Celery | `hexacademy-celery-worker.service` and `hexacademy-celery-beat.service` |
| Redis | `hexacademy-redis.service`, a Docker container on `127.0.0.1:6390` |
| PostgreSQL | database and role `hexacademy` on the shared local PostgreSQL 16 |
| Secrets | `backend/.env` and `frontend/.env.production` (mode 600, generated on the server) |
| Admin login | `/root/hexacademy-admin-credentials.txt` (root only) |

The unit files and Nginx site are in `infrastructure/vps/`. UFW allows 8090/tcp.

**HTTP only.** There is no domain or certificate yet, so `.env` sets `DJANGO_SECURE_SSL_REDIRECT=false` and `DJANGO_SECURE_COOKIES=false`, and `check --deploy` reports the four matching warnings. Passwords travel unencrypted, so use it only for demos and testing. Once `hexacademynepal.com` points at the server, add an HTTPS server block (certbot), set both flags back to `true`, and update `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL` and `NEXT_PUBLIC_SITE_URL` (a frontend rebuild is needed).

**Not set up yet:** SMTP (emails go to the backend log), object storage (media is on local disk), payment gateways, and scheduled database backups.

**Redeploy** (from a clean checkout of `main` on your machine):

```sh
git archive --format=tar HEAD | ssh root@80.241.208.65 'tar -x -C /var/www/SHIV/hexacademy-nepal && chown -R hexacademy:hexacademy /var/www/SHIV/hexacademy-nepal'
ssh root@80.241.208.65 'bash -s' <<'EOF'
set -euo pipefail
cd /var/www/SHIV/hexacademy-nepal/backend
sudo -u hexacademy bash -c 'set -a; . ./.env; set +a; .venv/bin/pip install -q -r requirements.txt && .venv/bin/python manage.py migrate --noinput && .venv/bin/python manage.py collectstatic --noinput'
cd ../frontend
sudo -u hexacademy -H bash -c 'export PATH=/var/www/SHIV/hexacademy-nepal/.node/bin:$PATH npm_config_cache=/var/www/SHIV/hexacademy-nepal/.npm NEXT_TELEMETRY_DISABLED=1; npm ci --no-audit --no-fund && npm run build && cp -r .next/static .next/standalone/.next/static'
systemctl restart hexacademy-backend hexacademy-celery-worker hexacademy-celery-beat hexacademy-frontend
curl -fsS http://127.0.0.1:8050/readyz/ -H 'Host: 80.241.208.65'
EOF
```

Logs: `journalctl -u hexacademy-backend -f` (likewise for the other units) and `/var/log/nginx/hexacademy.*.log`.

## Payments: activating Khalti, eSewa and bank transfer

No production payment credentials are in this repository, and none have been tested yet. Until a gateway is configured it stays hidden from learners, and the settings page in `/admin/commerce/settings` can't switch it on.

**Before you start:** get merchant accounts with Khalti and eSewa. Confirm eligibility, fees and settlement terms with each provider, and get their sandbox (test) credentials first.

**Khalti (ePayment, docs.khalti.com):**

1. Set `KHALTI_SECRET_KEY` to the **live secret key** from the Khalti merchant dashboard. The public key is not used.
2. Set `KHALTI_BASE_URL=https://khalti.com/api/v2/`. The default is the sandbox, `https://dev.khalti.com/api/v2/`.
3. Check the production base URL against Khalti's current documentation before launch.

**eSewa (ePay v2, developer.esewa.com.np):**

1. Set `ESEWA_PRODUCT_CODE` and `ESEWA_SECRET_KEY` to the merchant values eSewa issues.
2. Set `ESEWA_FORM_URL` and `ESEWA_STATUS_URL` to the **production** URLs from eSewa's documentation. The defaults are the UAT (test) URLs.
3. Never put the UAT secret published in eSewa's docs into a production `.env`.

**Return URLs.** Both providers send the learner back to `https://<FRONTEND_URL>/checkout/complete/<reference>`, so `FRONTEND_URL` must be the public HTTPS origin. Neither provider sends webhooks for these products, so there is nothing to register on their side.

**Turning gateways on.** Restart the backend and the worker. A finance manager then enables each configured gateway in `/admin/commerce/settings`. The page shows "configured" when the key is present and never shows the key itself.

**Bank transfer.** This needs no credentials:

1. In payment settings, enable it and enter the bank details: account name, number, bank and branch.
2. Finance approves each transfer from the "Transfers to review" queue after checking it against the bank statement.

**Background jobs (Celery beat).** These must run in production:

| Job | Schedule | What it does |
| --- | --- | --- |
| `commerce-reconcile-payments` | every 5 min | Re-checks unsettled gateway payments for 24 hours |
| `commerce-expire-orders` | every 5 min | Expires unpaid orders after the order time limit; orders with a transfer awaiting review are kept |

**Sandbox.** `PAYMENTS_ENABLE_SANDBOX` and `PAYMENTS_SANDBOX_SECRET` are for development and CI only. `config/settings/prod.py` refuses to start if the sandbox is enabled.

**Staging test before launch.** On staging, with the providers' test credentials:

1. Pay once with each gateway.
2. Cancel once with each gateway.
3. Close the tab mid-payment and check the reconcile job settles the payment.
4. Approve one bank transfer and reject another.
5. Record a refund.
6. Compare the revenue report with the merchant dashboards.

## Live classes: Google Meet and Zoom

Live classes work today with **instructor-managed links**: the instructor creates the meeting in their own Google Meet or Zoom account and pastes the join link when scheduling. No provider credentials are needed and none are configured.

What is not implemented, and what it would need:

- **Creating meetings automatically.** Zoom needs a Server-to-Server OAuth (or OAuth) app in the Zoom Marketplace with meeting scopes. Google Meet needs a Google Cloud project with the Calendar API (meetings are created as Calendar events with conference data) and OAuth consent for the organiser's Workspace account. Each would become a `create_meeting` method on its provider in `apps/live_classes/providers.py`, with credentials read only from the environment. Confirm the scopes and plan requirements in the providers' current documentation first.
- **Automatic attendance and recordings.** Zoom's participant reports and cloud recordings need a paid plan and the matching API scopes; Meet attendance and recordings need Google Workspace editions that offer them. Until then, staff mark attendance and paste recording links.

Production checks: the beat container must run (class reminders go out every 5 minutes for sessions starting within the hour), and `TIME_ZONE` stays `Asia/Kathmandu`.

## Email and notifications

In-app notifications always work. Email copies (class reminders, reschedules and cancellations, graded or returned assignments, issued certificates) go to verified addresses through the Celery worker. Set the `EMAIL_*` variables and `DEFAULT_FROM_EMAIL` from `.env.example` with a transactional mail provider, and set up SPF, DKIM and DMARC for the sending domain. `FRONTEND_URL` must be the public site address: it is printed on certificates as the verification link.

## Certificates

Certificate PDFs use reportlab's built-in fonts, which cover Latin text only. Names written in Devanagari will not render correctly in the PDF (the verify page shows them fine). Before issuing to learners with non-Latin names, bundle a font with Devanagari coverage (for example Noto Sans Devanagari, SIL Open Font License) and register it in `apps/certificates/pdf.py`.

## Content-Security-Policy

The frontend sends a nonce-based CSP on every page (`docs/security.md`). Set these in `.env` for the frontend container:

- `CSP_MEDIA_ORIGINS`: the public media origin (the R2 custom domain, `S3_PUBLIC_CUSTOM_DOMAIN` with `https://`).
- `CSP_FORM_ACTION_ORIGINS`: the origin of `ESEWA_FORM_URL`. The default is eSewa's UAT host; when you switch to eSewa's production URL, put its origin here too, or the browser blocks the checkout form.
- `CSP_REPORT_URI` (optional): a report collector. Leave it empty if you don't run one.

Adding a third-party script, iframe or font host later means adding it in `frontend/lib/csp.ts`; `npm run e2e` (`csp.spec.ts`) catches anything missed.

## TLS

Recommended: Cloudflare SSL mode **Full (strict)** with a Cloudflare Origin Certificate installed in Nginx. Add a `listen 443 ssl` server block using the origin cert and key, mount them read-only, and redirect port 80 to 443. Until that's done, use "Flexible" mode only for a first smoke test, never for real traffic.

Django sets `SECURE_SSL_REDIRECT` and trusts `X-Forwarded-Proto` from Nginx. If you test directly over plain HTTP without Cloudflare, set `DJANGO_SECURE_SSL_REDIRECT=false` temporarily.

## Updates

```bash
git pull
docker compose build
docker compose up -d          # migrate runs first; backend/worker/beat restart after it
docker image prune -f
```

## Backups

- Database: `infrastructure/scripts/backup.sh [dir]` writes a `pg_dump` custom-format archive (default `./backups/`, directory mode 700, files 600), checks that its table of contents reads back, and keeps the newest `BACKUP_KEEP` (default 14). Run it daily from cron, then copy the files off-host (for example `rclone copy backups r2:hexacademy-backups`, to a private bucket).
  - Default mode: dumps the compose `postgres` service.
  - Managed PostgreSQL: set `DATABASE_URL` and the host's `pg_dump` is used instead (install the client matching the server's major version). Keep the password in `~/.pgpass` or `PGPASSFILE`, not in the URL, so it does not appear in the process list.
- Restore: `infrastructure/scripts/restore.sh <file>`. It asks you to type `restore`, then restores in a single transaction with `--clean --if-exists`.
  - Default mode: stops the app containers, restores, re-runs migrations and starts them again.
  - With `DATABASE_URL`: restores into that database only. Stop everything that uses it first, and run `manage.py migrate` afterwards.
- **Restore drill (verified 2026-10-24, `DATABASE_URL` mode, PostgreSQL 17 locally).** The dev database was backed up twice with `BACKUP_KEEP=1`; only the newer dump was kept, with modes 700/600. It was restored into a new scratch database, then restored again on top of it (the `--clean` path). Row counts matched the source in all 61 tables, `manage.py migrate --check` found nothing to apply, and Django read users and courses from the copy. Any answer other than `restore` aborted with exit 1. The compose mode has **not** been run (no Docker locally); repeat the drill on staging.
- **Test restores on staging monthly**, into a scratch database, and compare row counts the same way.
- Media: R2 is durable storage. Turn on bucket versioning or lifecycle rules, and if not using R2, back up the `media` and `private_media` volumes.

## Monitoring

- Liveness: `/healthz/` (process up, no dependencies). Readiness: `/readyz/` checks the database (`SELECT 1`) and the cache (a set/get/delete of a per-probe key, so Redis is covered in production). It returns `{"status": "ok", "database": "ok", "cache": "ok"}`, or 503 with the failing part marked `error`; failures are logged with their traceback. Point an uptime monitor at `/readyz/`, and use `/healthz/` for container restarts so a database outage doesn't restart every container.
- Logs: set `LOG_FORMAT=json` in production. Each line is one JSON object with `time` (UTC), `level`, `logger`, `request_id`, `message`, any structured `extra` fields and `exception` when there is one. That suits Loki, Grafana Cloud, Better Stack or `jq`. The application does not log request bodies, passwords, tokens or exam answers. `docker compose logs -f backend worker nginx` still works.
- Every response carries `X-Request-ID`, and the same ID appears in Django logs and audit entries. Next.js server renders forward it, so one page view can be traced across both services.
- Error reporting: no third-party service is wired in. If you add Sentry or similar, keep `send_default_pii` off and scrub request bodies.

## Launch-readiness review (2026-10-24)

What has been verified locally, what has not, and what must happen before real learners and payments:

| Area | State | Evidence / remaining step |
| --- | --- | --- |
| Automated tests | Ready | 418 backend tests; 134 frontend unit tests; 40 Playwright tests (desktop and mobile Chromium) against a production build |
| Access control | Ready | Every admin route refuses anonymous callers and students, and roles are kept out of other domains (`backend/tests/test_admin_permissions.py`, built from the URL resolver). Object-level rules have their own tests per app |
| Exams | Ready | Server-side deadlines, snapshots, row-locked finalisation, no answer keys before release (M4 tests) |
| Payments | **Blocked on merchant accounts** | Only the local sandbox has been exercised. Khalti and eSewa need credentials and the staging test above |
| Live classes | Ready (manual links) | Meet/Zoom APIs not integrated; instructors paste links |
| Email | **Not verified** | Console backend only; configure SMTP with SPF/DKIM/DMARC |
| Security headers / CSP | Ready | `check --deploy` clean under production settings; nonce CSP with an E2E violation check |
| Dependencies | Ready | `pip-audit`: none. `npm audit --omit=dev`: none. Two moderate advisories remain in dev-only tooling (`postcss-selector-parser` via `@tailwindcss/typography`, build-time only) |
| Accessibility | Ready (automated) | axe WCAG 2.1 A/AA passes on public, dashboard, admin and exam-player pages; a manual keyboard and screen-reader pass is still recommended |
| Performance | Ready (queries) | List endpoints use a constant number of queries regardless of row count (`assert_constant_queries`). No load test has been run |
| Backups | Partly verified | Restore drill passed in `DATABASE_URL` mode; repeat in compose mode on staging |
| Infrastructure | **Not run** | Docker Compose, Nginx, Gunicorn, Celery, Redis and CI have never run on this machine. The staging checklist below is mandatory |
| Content | Needs the owner | Demo CMS and catalog content is labelled as demo; replace it, and fill the legal pages, before launch |
| Certificates | Caveat | PDFs cannot draw Devanagari names until a font is bundled (see Certificates) |

Launch only when the staging checklist passes, at least one gateway passes its staging test, email delivers, and the demo content is replaced.

## Staging validation checklist (before first production launch)

- [ ] `docker compose config` and `docker compose up --build` succeed from a clean checkout
- [ ] `docker compose exec nginx nginx -t` passes
- [ ] `/readyz/` is 200 through Nginx; `/api/docs/` is **not** reachable (DEBUG off)
- [ ] Register, log in and log out work over HTTPS. Cookies are `Secure` and `HttpOnly` (session)
- [ ] `/django-admin/` loads with styles (WhiteNoise static)
- [ ] Postgres and Redis ports are not reachable from outside (`nmap` from another host)
- [ ] A backup + restore round trip works on staging in compose mode (and in `DATABASE_URL` mode if the database is managed)
- [ ] `/readyz/` returns 503 when Redis is stopped, and 200 again when it is back
- [ ] Logs are JSON (`LOG_FORMAT=json`) and reach the log store with request IDs
- [ ] A short load test (for example k6 against the catalog, a course page and an exam attempt) shows acceptable latency on the chosen VPS size
- [ ] The Celery worker and beat are running (`docker compose logs worker beat`)
- [ ] The payment staging test above passes with each provider's test credentials, then live keys are swapped in
- [ ] A test email arrives (verify address, then a class reminder) with SPF/DKIM passing
- [ ] A certificate PDF downloads and its printed verification link opens the public verify page
- [ ] The browser console shows no CSP violations on the home page, a course page, checkout (each enabled gateway) and the admin editor
- [ ] Two different client IPs browsing anonymously are throttled separately (Django logs show the visitor IP, not the frontend container's)
