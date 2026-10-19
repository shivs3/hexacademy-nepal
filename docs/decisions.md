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

## ADR-009: Page versions are immutable snapshots; drafts live on the page row

**Context:** Editors need drafts, previews, history and restore without affecting the live site.
**Decision:** `Page.sections` is the working draft. Saving with changed content creates an immutable `PageVersion` (title, sections, SEO). Publishing or scheduling points at a version, and the public API only ever serialises `published_version`. Restore copies an old version into the draft as a new version, so history is never rewritten.
**Consequences:** Rollback is "publish an older version". Versions accumulate; pruning can be added if storage ever matters.

## ADR-010: A fixed section registry instead of free-form page building

**Context:** The CMS must be flexible without allowing arbitrary HTML or JavaScript.
**Decision:** Sections are typed entries in `apps/cms/sections.py`, validated and cleaned on every write. The admin form is generated from the registry's field descriptors, and each type has one React component. Catalog-backed types (featured courses, categories, instructors, collections) are added in M3 when their data exists, rather than shipped as placeholders.
**Consequences:** New layouts need a small code change, which is deliberate: every rendered element is reviewed and accessible.

## ADR-011: Blog posts are not versioned; editing a live post needs publish rights

**Context:** Articles change less often than landing pages, and full versioning doubles the editor's complexity.
**Decision:** Posts have draft/published/archived status and an optional future `published_at` (scheduling) but no version history. Because a save changes a live article immediately, the API requires `publish_blog` to edit a published post. Writers without it can only work on drafts.
**Consequences:** No rollback for posts. If that becomes necessary, reuse the page versioning pattern.

## ADR-012: Previews use the staff session, not share tokens

**Decision:** `/preview/pages/{id}` and `/preview/posts/{id}` are Next routes that call staff-only preview endpoints with the visitor's cookies, and they are disallowed in robots.txt and marked noindex.
**Consequences:** Previews cannot be shared with people who lack an account. A signed, expiring share link can be added later if that is needed.

## ADR-013: Media images are served unoptimised by Next

**Context:** The Next image optimiser would need every storage host whitelisted and would proxy all images through the frontend server.
**Decision:** The backend validates and re-encodes uploads. `MediaImage` renders them with `unoptimized` plus explicit width and height (no layout shift) and lazy loading. Edge caching comes from Cloudflare.
**Consequences:** No automatic responsive resizing. Revisit if image weight becomes a performance problem (for example, Cloudflare Images or generating variants at upload time).

## ADR-014: Maths stored as placeholder nodes, rendered at view time

**Decision:** The Tiptap editor stores formulas as `<span|div data-type="inline-math|block-math" data-latex="…">` nodes, which survive the backend allowlist. They are rendered with KaTeX (`trust: false`, bounded `maxExpand`/`maxSize`) on the server when the page is rendered. The stored HTML never contains KaTeX output.
**Consequences:** Upgrading KaTeX re-renders everything consistently. The same nodes will be reused for lesson content and exam questions (M3/M4).
