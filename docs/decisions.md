# Architecture decision records

Short records of choices that are expensive to reverse. Newest last.

## ADR-001: Django + DRF backend, Next.js frontend

**Context:** The platform needs a rich admin back office, strong relational modelling (courses, exams, orders) and an SEO-friendly public site, and one developer has to maintain it.
**Decision:** Django 5.2 LTS with DRF for the API. Next.js App Router for all user-facing UI, including the staff dashboard. Django admin stays available at `/django-admin/` for superuser maintenance only.
**Consequences:** There are two runtimes to deploy. Business logic stays in one place (Django).

## ADR-002: Session cookies + CSRF, not JWT

**Context:** The browser is the only client. Tokens kept in JS-readable storage are exposed to XSS.
**Decision:** Django sessions in an HttpOnly, Secure, SameSite=Lax cookie (`hx_session`) plus Django CSRF (`hx_csrftoken` cookie → `X-CSRFToken` header). The API is served same-origin.
**Consequences:** Deactivating a user ends their sessions immediately, because `ModelBackend` rejects inactive users. Mobile apps, if built later, would need a separate token scheme.

## ADR-003: Custom user model with email as the username

**Decision:** `accounts.User` was created before the first migration. Email is unique, both as typed and case-insensitively (a `Lower(email)` constraint), and is normalised to lower case. Profile data lives in `UserProfile`.

## ADR-004: Roles are Django groups defined in code

**Decision:** Role → permission mappings are declared in `apps/accounts/roles.py` and synced on `post_migrate`. Super admin is `is_superuser`, granted only through the audited `grant_role` command and never through the API.
**Consequences:** Permission changes go through code review and are applied consistently in every environment.

## ADR-005: Money in integer minor units

**Decision:** All amounts are stored as integer paisa (`BigIntegerField`), with currency NPR. Floats are never used for money. Display formatting happens only at the edge (`formatMoney`).

## ADR-006: Next.js `cacheComponents` disabled; CMS routes render dynamically

**Context:** Next 16's Cache Components require Suspense boundaries around every cookie read and make builds depend on data availability.
**Decision:** `cacheComponents: false`. Authenticated and CMS-driven routes render per request (`dynamic = "force-dynamic"` or `no-store` fetches), so `next build` never needs the Django API to be reachable. Caching, if needed, happens at the edge (Cloudflare) for anonymous public pages.
**Consequences:** It is simpler to reason about at the cost of some server render time. This can be revisited once the public site's traffic profile is known.

## ADR-007: Static files served by WhiteNoise; media from object storage

**Decision:** Django's static files (admin and API docs) are served by WhiteNoise from the backend image, behind Nginx caching headers. User uploads go to R2 (`USE_S3_STORAGE=true`). There are two buckets: public assets, and a private bucket (videos, resources, certificates) that is accessed only through short-lived signed URLs issued after a permission check.

## ADR-008: Trailing slashes preserved through the Next dev proxy

**Decision:** `skipTrailingSlashRedirect: true` so `/api/v1/foo/` reaches Django unchanged, avoiding a 308 round trip on every API call in development. The rewrite destination appends the slash for paths written without one.
