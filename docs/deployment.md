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

- Database: `infrastructure/scripts/backup.sh` writes a `pg_dump` custom-format archive to `./backups/` and keeps the newest 14. Run it daily from cron, then copy the files off-host (for example `rclone copy backups r2:hexacademy-backups`).
- Restore: `infrastructure/scripts/restore.sh <file>`. It asks for confirmation, stops the app containers, restores in a single transaction and re-runs migrations. **Test restores on staging monthly.**
- Media: R2 is durable storage. Turn on bucket versioning or lifecycle rules, and if not using R2, back up the `media` and `private_media` volumes.

## Monitoring

- Liveness: `/healthz/`. Readiness (DB): `/readyz/`. Point an uptime monitor at `/readyz/`.
- Logs: `docker compose logs -f backend worker nginx`. Every response carries `X-Request-ID`, and the same ID appears in Django logs and audit entries.

## Staging validation checklist (before first production launch)

- [ ] `docker compose config` and `docker compose up --build` succeed from a clean checkout
- [ ] `docker compose exec nginx nginx -t` passes
- [ ] `/readyz/` is 200 through Nginx; `/api/docs/` is **not** reachable (DEBUG off)
- [ ] Register, log in and log out work over HTTPS. Cookies are `Secure` and `HttpOnly` (session)
- [ ] `/django-admin/` loads with styles (WhiteNoise static)
- [ ] Postgres and Redis ports are not reachable from outside (`nmap` from another host)
- [ ] A backup + restore round trip works on staging
- [ ] The Celery worker and beat are running (`docker compose logs worker beat`)
- [ ] The payment staging test above passes with each provider's test credentials, then live keys are swapped in
- [ ] A test email arrives (verify address, then a class reminder) with SPF/DKIM passing
- [ ] A certificate PDF downloads and its printed verification link opens the public verify page
- [ ] The browser console shows no CSP violations on the home page, a course page, checkout (each enabled gateway) and the admin editor
- [ ] Two different client IPs browsing anonymously are throttled separately (Django logs show the visitor IP, not the frontend container's)
