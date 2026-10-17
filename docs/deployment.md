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
