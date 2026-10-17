# Security

## Principles

1. **The server decides.** Prices, permissions, exam timers, answers and grades are computed and enforced in Django. The frontend's checks are for UX only.
2. **Least privilege.** Each role holds only the permissions it needs. Finance staff cannot read answer keys or security settings, and editors cannot see payment credentials.
3. **Secrets only in the environment.** Nothing sensitive is committed, and `.env.example` holds placeholders only. Production refuses to start with a short `DJANGO_SECRET_KEY` or with the sandbox payment provider enabled.
4. **Everything sensitive is audited** in the append-only `audit_auditlog`.

## Authentication

- Django sessions in an HttpOnly, SameSite=Lax cookie (Secure in production), 14-day lifetime.
- CSRF is enforced on every unsafe request, including login and registration.
- Passwords: minimum 10 characters plus Django's similarity, common-password and numeric validators. Stored as PBKDF2 hashes.
- Login errors are generic (`invalid_credentials`), and password reset never reveals whether an account exists.
- Throttling: login 10/min per IP **and** per email, register 5/min, password reset 5/hour, verification 10/hour. Nginx adds a coarse per-IP limit on `/api/v1/auth/`.
- Password reset tokens are single-use (Django's token generator, invalidated when the password changes) and expire after 2 hours. Email verification tokens are signed with a dedicated salt and expire after 3 days.
- Changing a password keeps the current session and invalidates all others. Deactivating an account ends all of its sessions immediately.

## Authorisation

- DRF default: `IsAuthenticated`. Every staff endpoint declares the required permission with `HasPerm(...)`.
- Object-level rules (an instructor's own courses, a student's own attempts and orders) are enforced in querysets and services. A missing object and a forbidden object both return 404 where revealing existence would leak information.
- Super admin can't be granted, removed or modified through the API. Staff can't change their own roles or status.

## Data protection

- (M3) Private files (course videos, resources, certificates) live in a private bucket and are delivered via signed URLs (default 5 minutes) after a permission check.
- Audit metadata automatically redacts keys such as `password`, `token`, `secret`, `correct_option_ids`, etc.
- Gunicorn and Nginx access logs record paths without query strings, since links carry one-time tokens.
- (M2) Rich text from the CMS is sanitised server-side (nh3) and again on render (DOMPurify). Arbitrary HTML/JS embeds are not supported.

## Transport and headers

- HTTPS-only in production: `SECURE_SSL_REDIRECT`, HSTS (30 days by default, preload opt-in), Secure cookies and `Cross-Origin-Opener-Policy: same-origin`.
- Next.js sends `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY` and `Permissions-Policy`. A strict CSP comes in M7, once the set of third-party embeds (video, payment redirects) is known.
- Client IPs: Nginx resolves the real IP from Cloudflare's published ranges and forwards it as a single overwritten `X-Forwarded-For`. Django trusts exactly one hop (`NUM_PROXIES=1`).

## Infrastructure

- PostgreSQL and Redis are on the internal Docker network only, with no published ports.
- Containers run as non-root users.
- Uploaded public media is served with `nosniff`. HTML, SVG, JS and XML uploads are forced to download.

## Exams (M4)

Attempts are server-authoritative. A question snapshot is frozen at start, and the deadline is computed by the server. Answers are rejected after the deadline, and grading is idempotent. Answer keys are never serialised to students before results are released.

## Payments (M5)

Provider integrations follow official Khalti/eSewa documentation only. Every callback is verified server-side with the provider's lookup/status API before an order is marked paid. Processing is idempotent per transaction.

## Reporting a vulnerability

Email security@hexacademynepal.com (to be set up before launch).
