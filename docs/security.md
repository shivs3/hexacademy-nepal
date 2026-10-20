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

- **Lesson files (M3):** resources are stored with the `private` storage backend (a separate bucket with object storage, `private_media/` locally, never web-served). Every download goes through the API, which checks lesson access first, then either streams the file (`Cache-Control: private, no-store`) or redirects to a signed URL valid for `PRIVATE_URL_TTL_SECONDS` (default 300). Files are always served as attachments with the type detected at upload: PDF, images, Office/OpenDocument and zip (checked by signature) and UTF-8 text/code files (served as `text/plain`). Uploads and deletes are audited.
- **Course access (M3):** lesson content, resources and progress are checked in `apps/learning/services.lesson_access` on every request; the course player UI is never trusted. Paid courses can't be joined through the free enroll endpoint (402) — enrollment for them comes only from a staff grant (audited) until verified payments land in M5. Course completion is derived from stored progress, never from a client flag. Instructors can only see and edit courses whose team they are on; price, featured status and a live course's address are manager-only.
- Audit metadata automatically redacts keys such as `password`, `token`, `secret`, `correct_option_ids`, etc.
- Gunicorn and Nginx access logs record paths without query strings, since links carry one-time tokens.
- **CMS content (M2):**
  - Rich text is sanitised server-side with an nh3 allowlist (no scripts, styles, iframes or event handlers) and again on render with DOMPurify. KaTeX runs with `trust: false`. Administrators cannot add arbitrary HTML, JS or embeds: section types are a fixed, validated registry.
  - Every CMS link (menus, buttons, rich-text anchors) must be a site path, `#anchor`, http(s) URL with a host, `mailto:` or `tel:`. `javascript:`, `data:` and protocol-relative URLs are refused. Video embeds are limited to YouTube (privacy-enhanced domain) and Vimeo (`dnt=1`) and are rebuilt from the video id, never copied verbatim.
  - Unpublished content never reaches public endpoints: public views read only the published version or published posts whose date has passed. Previews require a staff session with the editing permission.
  - Publishing is a separate permission (`publish_pages`, `publish_blog`). Since blog posts are not versioned, editing a live post also requires `publish_blog`.
  - Uploads: the type is detected from the file's content (never from the client-supplied name or MIME type), with an allowlist of JPEG, PNG, WebP, GIF and PDF and size and pixel limits. JPEG and WebP are re-encoded to remove EXIF and GPS data. SVG and HTML are refused. Storage keys are random. Only `manage_media` may upload or delete.
  - Brand colours must keep sufficient contrast with white text, so an admin cannot make buttons unreadable.
  - The newsletter subscribe endpoint is throttled and returns the same response whether or not the address exists. The CSV export is audited and neutralises spreadsheet formulas.

## Transport and headers

- HTTPS-only in production: `SECURE_SSL_REDIRECT`, HSTS (30 days by default, preload opt-in), Secure cookies and `Cross-Origin-Opener-Policy: same-origin`.
- Next.js sends `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY` and `Permissions-Policy`. A strict CSP comes in M7, once the set of third-party embeds (video, payment redirects) is known.
- Client IPs: Nginx resolves the real IP from Cloudflare's published ranges and forwards it as a single overwritten `X-Forwarded-For`. Django trusts exactly one hop (`NUM_PROXIES=1`).

## Infrastructure

- PostgreSQL and Redis are on the internal Docker network only, with no published ports.
- Containers run as non-root users.
- Uploaded public media is served with `nosniff`. HTML, SVG, JS and XML uploads are forced to download.

## Exams (M4)

- **Answer keys stay on the server.** Learner serializers are separate from staff ones and never include `is_correct`, `answer_key` or explanations. The attempt payload carries only the snapshot's `content`. The result endpoint adds correct options and explanations only after release, and only when the exam's `show_answers` / `show_explanations` allow it. An E2E test asserts the attempt payload contains no key.
- **Who sees keys:** exam coordinators (`manage_question_bank`) and instructors for their own courses' questions. Content editors, finance and support staff have no assessment permissions. Teaching assistants see exams and results, never the bank.
- **Server time only.** The deadline is `min(start + duration, closes_at)`, computed once when the attempt starts. The browser countdown is corrected by the server's clock and is display only. Saves are accepted up to 5 seconds (`ASSESSMENTS_ANSWER_GRACE_SECONDS`) past the deadline to absorb network latency; after that they get 409 and the attempt is finalised. A Celery beat task finalises abandoned attempts every minute, and any read of an overdue attempt finalises it too.
- **No client-supplied correctness.** The client sends only selected option ids, validated against the snapshot. Grading, scores and pass/fail are computed on the server, in the same transaction that ends the attempt, under a row lock, so they run at most once.
- **Object access.** Attempts are looked up by `(id, user)`; other users get 404, not 403, so ids cannot be probed.
- **Randomness** for question draws and shuffles uses `random.SystemRandom`.
- **Rankings** show initials only, plus the viewer's own row.
- **Audit:** question creation, imports, exports and deletions; exam creation, edits, question lists, status changes and result publication and export; attempt starts and submissions are recorded in the audit log. Answer contents are not logged.

**Limitations (cheating).** A browser exam cannot stop a learner from using another device, another person, or copying questions. The platform does not lock the browser, watch the camera or detect tab switching. What it does: server-enforced timing, per-attempt shuffling and random draws, optional no-revisit mode, limited attempts, delayed result and answer release, and analytics staff can review. High-stakes exams should add supervision outside the platform.

## Payments (M5)

Provider integrations follow official Khalti/eSewa documentation only. Every callback is verified server-side with the provider's lookup/status API before an order is marked paid. Processing is idempotent per transaction.

## Reporting a vulnerability

Email security@hexacademynepal.com (to be set up before launch).
