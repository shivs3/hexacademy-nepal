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
- **Course access (M3):** lesson content, resources and progress are checked in `apps/learning/services.lesson_access` on every request; the course player UI is never trusted. Paid courses can't be joined through the free enroll endpoint (402) — enrollment for them comes from a verified payment (M5) or an audited staff grant. Course completion is derived from stored progress, never from a client flag. Instructors can only see and edit courses whose team they are on; price, featured status and a live course's address are manager-only.
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
- Next.js sends `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY` and `Permissions-Policy`.
- Content-Security-Policy (ADR-044), set per request by `frontend/proxy.ts` from `frontend/lib/csp.ts`:
  - `script-src 'self' 'nonce-…' 'strict-dynamic'`. A fresh 128-bit nonce per response; Next.js applies it to its own scripts. No inline or `eval` scripts in production (development adds `'unsafe-eval'` for React's error overlay). Zod runs `jitless` so it never probes `new Function`.
  - `style-src 'self' 'unsafe-inline'`: Radix's scroll lock, Tiptap and KaTeX inject styles at runtime. Style injection cannot run code.
  - `frame-src` allows only the two hosts `apps/cms/sanitize.video_embed_url` produces (youtube-nocookie.com, player.vimeo.com). `form-action` allows `'self'` plus `CSP_FORM_ACTION_ORIGINS` (the eSewa form host). `img-src`/`media-src` add `CSP_MEDIA_ORIGINS`.
  - `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, and `upgrade-insecure-requests` on HTTPS requests. Env values are validated as bare origins so they cannot add directives.
  - `e2e/csp.spec.ts` fails on any `securitypolicyviolation` across public pages, a dialog and the rich-text editor.
  - The Django API renders JSON only (the browsable API is not enabled), so its responses carry no page CSP.
- Client IPs: Nginx resolves the real IP from Cloudflare's published ranges and forwards it as a single overwritten `X-Forwarded-For`. Django trusts exactly one hop (`NUM_PROXIES=1`).
- Server renders call Django directly, so `lib/api/server.ts` forwards that same validated `X-Forwarded-For` (and `X-Request-ID`). Each visitor then has their own anonymous rate limit, instead of every page render sharing the Next server's address (ADR-045).

## Dependency scanning

- CI runs `pip-audit -r requirements.txt` and `npm audit --omit=dev --audit-level=high`, and `manage.py check --deploy --fail-level WARNING` under production settings. HSTS preload (W021) is silenced only while `DJANGO_HSTS_PRELOAD` is off.
- Known and accepted (2026-10-24): two moderate advisories in `postcss-selector-parser` (via `@tailwindcss/typography`). It runs only at build time on our own CSS, never on user input or in the browser. Upgrade when the plugin ships a fixed dependency.

## Authorisation audit (M7)

- `backend/tests/test_admin_permissions.py` enumerates every admin API route from the URL resolver and checks that anonymous callers, students and roles from other domains are refused (401/403/405) for every method before any lookup or validation (ADR-048). It specifically covers: finance never reaching the question bank, exams or results; content editors and instructors never reaching commerce; and only super admins and support reaching account administration.
- Assessments viewsets now enforce their open/manage policies as DRF permission classes, so a POST from an unauthorised staff role gets 403 instead of reaching serializer validation.

## Logging

- `LOG_FORMAT=json` writes one JSON object per line with the request ID. The application logs no request bodies, passwords, session or CSRF tokens, payment secrets or exam answers. Audit entries are stored in the database (`apps/audit`), not only in logs.

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

- **The server prices everything.** The browser names courses and a coupon code; subtotal, sale price, discount and total come from `apps/commerce/pricing.py` and are frozen into the order and its items. Money is `Decimal` end to end; the frontend compares amounts in integer paisa and never does float arithmetic on them.
- **Only the provider's own answer marks an order paid.** Return redirects are ignored entirely (the complete page sends just our payment reference). The server calls Khalti's lookup API (`Authorization: Key …`) or eSewa's status API with values it already holds, and accepts only `Completed` / `COMPLETE`. The reported amount must equal the payment amount and the order total, or the payment becomes `mismatch` and the order is flagged for review instead of being paid.
- **Integrations follow the official documentation** (docs.khalti.com ePayment KPG-2; developer.esewa.com.np ePay v2). eSewa form fields are signed with HMAC-SHA256 over `total_amount,transaction_uuid,product_code` as documented. Neither provider sends webhooks, so payments are confirmed by the verify call and by a reconciliation job; there is no unauthenticated endpoint that can mark a payment paid.
- **Idempotency and concurrency.** Provider calls run outside transactions; the result is applied under row locks (order, then payment), and an already-final payment is never changed again, so repeated or concurrent verifications have the effect of one. The database enforces one completed payment per order and unique provider references. A second successful payment for a paid order is stored as `duplicate` and flagged for a refund; enrollments use the existing unique `(user, course)` constraint, so nobody is enrolled twice.
- **Purchase enrollments** are created only inside the paid transition. A learner whose access staff had revoked is not silently re-enrolled by a payment; the order is flagged instead.
- **Bank transfers** are approved by a person with `manage_orders`, who must enter the amount that actually arrived; anything other than the exact total is refused. Approvals, rejections (with a note shown to the learner), refunds, cancellations, review resolutions, settings changes and CSV exports are all audited with the acting user.
- **Secrets.** Gateway keys live only in the environment (`KHALTI_SECRET_KEY`, `ESEWA_SECRET_KEY`); the database and the settings API store just on/off flags and report whether a gateway is configured, never the key. Payment events store sanitised provider responses without credentials. The frontend never sees a key: eSewa's signed fields are produced by the server.
- **Sandbox.** The local test gateway is enabled only by `PAYMENTS_ENABLE_SANDBOX`, its webhook is HMAC-signed with a timestamp window (replays rejected by a unique event id), and `config/settings/prod.py` refuses to start with it enabled.
- **Least privilege.** Finance managers hold only `commerce.*` permissions (orders, refunds, coupons, revenue, payment settings) and no assessment, CMS or user-management rights. Support staff can view orders but not act on them. Content editors have no commerce permissions. Learners see only their own orders and payments (other references answer 404). Payment endpoints are throttled (`payment`, 30/min).
- **Refunds** are recorded, not executed: finance pays the money back through the provider's merchant portal or the bank and records the amount and reference here. The amount is capped at what remains refundable, enforced by both the service and a database `CHECK`.

## Live classes (M6)

- **Meeting links are private.** Session lists and details never include the link or passcode. `POST /class-sessions/{id}/join/` returns them only after the server checks, at that moment, that the session is scheduled, the caller is a member of its batch, their enrollment in the course is active and the join window is open (15 minutes before the start until the end). Support staff can read schedules but never links.
- **Only real provider links are stored.** A Google Meet link must be `https://meet.google.com/<code>`; a Zoom link must be a `/j/` or `/w/` join link (or a personal `/my/` link) on `zoom.us` or `zoom.com`. Zoom host/start links are refused, so a host key is never handed to learners. Links are normalised before saving.
- **Attendance is marked by staff.** `joined_at` only records that a learner pressed Join here; it is not proof of attendance. Automatic attendance from Meet or Zoom is not implemented (it needs provider APIs, account plans and OAuth credentials).
- Members can only be learners actively enrolled in the course. Scheduling, rescheduling, cancelling, membership and attendance changes are audited.

## Assignments (M6)

- Learners see published assignments only in courses where their enrollment is active, and only their own submission. Staff access follows the course's teaching team (or `grade_all_submissions`). Content editors can author assignments but cannot read learner work.
- Answers and feedback are plain text, rendered as text (never HTML). Files go through the same content-type detection, size limit and private storage as lesson resources and are always downloaded as attachments.
- Grades come only from the grading endpoint, capped at the assignment's `max_points`. A graded submission cannot be overwritten by the learner unless staff return it. Assignment authoring, grading, regrading and returns are audited (with points, not the learner's answer).

## Certificates (M6)

- **Issued only from server records.** Eligibility uses the enrollment's stored completion, finalised exam attempts with released results, and graded submissions. The claim endpoint just asks the server to check; nothing the browser sends counts as completion. A unique `(user, course)` constraint and a row lock make issuing idempotent under concurrent triggers.
- **Public verification shows only what the printed certificate shows:** number, heading, recipient name, course title, issue date and status (with the revocation date). No email, user id or reason. The endpoint is unauthenticated, throttled (`certificate_verify`, 60/min per IP) and uses unguessable 8-character Crockford base32 numbers. The verify pages are `noindex`.
- **Downloads.** A learner can only download their own PDF (other numbers answer 404). Staff downloads need `view_certificates` or `manage_certificates`. PDFs are rendered on request, drawn from plain text with no markup parsing, and sent with `Cache-Control: private, no-store`.
- **Revocation** needs a reason, is audited, shows on the verify page and watermarks the PDF. A revoked certificate is never re-issued automatically; reinstating it is a separate, audited staff action.
- **Roles.** Content editors manage templates and rules; support staff can look up issued certificates read-only. Neither gains exam or payment rights.

## Notifications (M6)

- Notification links must be internal paths (enforced by a database `CHECK`), so a notice can never send a learner to another site.
- Email goes only to active accounts with a verified address, after the triggering transaction commits. A failed email never undoes the in-app notice. Emails contain no meeting links or passcodes.

## Reporting a vulnerability

Email security@hexacademynepal.com (to be set up before launch).
