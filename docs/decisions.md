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

**Decision:** All transactional amounts (orders, payments, refunds) are stored as integer paisa (`BigIntegerField`), with currency NPR. Catalog list prices are fixed-precision decimals (ADR-015). Floats are never used for money. Display formatting happens only at the edge (`formatMoney`).

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

## ADR-015: Catalog prices are fixed-precision decimals

**Context:** ADR-005 put all money in integer paisa. Course prices are entered and read by people ("2500.00"), are compared in SQL for the price filter and ordering, and never take part in arithmetic beyond a comparison.
**Decision:** `Course.price` and `sale_price` are `DecimalField(10, 2)` in NPR, serialised as decimal strings. The frontend never parses them as floats: `decimalToMinor` converts them digit by digit before formatting. ADR-005 still applies to orders, payments, refunds and coupons (M5), which convert the decimal list price to paisa once, when the order item is snapshotted.
**Consequences:** Two representations exist; the conversion point is the order snapshot and is covered by tests there. Both are exact, and neither ever passes through floating point.

## ADR-016: Lesson access is decided in one service

**Decision:** `apps/learning/services.lesson_access` is the only function that decides whether a user may open a lesson. It is used by the lesson, progress and resource-download endpoints; the player outline marks locked lessons with `locked_lesson_ids` from the same module. It covers free previews, enrollment, sequential locking and staff access.
**Consequences:** Any new lesson-scoped feature (assignments, exams attached to lessons) must call it instead of re-deriving the rules.

## ADR-017: Staff course edits are partial and field-scoped

**Context:** Instructors may edit their own course content, but price, featured status and a live course's address belong to catalog managers.
**Decision:** The course PATCH refuses any manager-only field from a non-manager, even if its value is unchanged, rather than silently ignoring it. The editor therefore sends only the fields that changed. Teams are replaced as a whole (`PUT …/team/`), and curriculum reorders must list every module and lesson, so a stale editor gets a 409 and reloads instead of overwriting someone else's change.
**Consequences:** Clients must diff before saving. Rejections are explicit, so a permission gap can't hide as a no-op save.

## ADR-018: Enrollment admin uses its own scoped course list

**Context:** Support staff manage enrollments but have no catalog permissions, so they can't call `/admin/catalog/courses/`.
**Decision:** `GET /admin/learning/courses/` returns just `{id, title, slug, status}` for non-draft courses the caller may see enrollments for (all for enrollment managers, only taught courses for instructors and TAs).
**Consequences:** Granting enrollment access doesn't require granting catalog access. The endpoint is capped at 500 rows and should become searchable if the catalog grows past that.

## ADR-019: Revoking access keeps the enrollment

**Decision:** Revoking sets `status=revoked` and `revoked_at` but keeps the row and its lesson progress. A revoked learner can't re-enroll themselves in a free course (403 `revoked`); only staff can reinstate them. Courses with enrollments are archived, never deleted or returned to draft.
**Consequences:** History survives for support, refunds (M5) and certificates (M6). Removing a learner's data entirely is a separate deletion process, to be defined with the retention policy in M7.


## ADR-020: Attempts grade only from their own snapshot

**Decision:** Starting an attempt copies each drawn question's learner-visible content (options in display order), answer key, explanation, marks and version into `AttemptQuestion`. Saving, grading, review and analytics read only these rows, never the live bank.
**Consequences:** Editing, re-keying or retiring a question never changes an attempt in progress or a past result. The snapshot duplicates some data per attempt, which is acceptable at this scale. Fixing a wrong key for past attempts would need an explicit regrade tool (not built).

## ADR-021: Attempt state changes serialise on a row lock

**Decision:** Every answer save, advance, submit and expiry runs in a transaction that takes `SELECT … FOR UPDATE` on the attempt row. Finalising checks the status under the lock and returns the attempt unchanged if it has already ended. A partial unique index allows one open attempt per learner and exam.
**Consequences:** A save racing a submit is either graded or refused with 409 `attempt_closed`, never half-applied. Double submits, client retries and the beat task cannot grade twice. Saves for one attempt are sequential, which is fine because the client sends them one at a time.

## ADR-022: A 5-second grace window after the deadline

**Decision:** Answer saves are accepted until `deadline + ASSESSMENTS_ANSWER_GRACE_SECONDS` (default 5). After that the attempt is finalised as expired with whatever was saved.
**Consequences:** A click made just before time ran out still counts despite network latency. A learner gains at most a few seconds, and only for requests already in flight.

## ADR-023: Scoring rules: exact match, no floor

**Decision:** A question scores full marks only if the selected set equals the key exactly. Multiple-select questions get no partial credit. A wrong answer loses `negative_marks` when the exam uses negative marking, and an unanswered question scores 0. The total is not floored at zero.
**Consequences:** Results are simple to explain and audit. A heavily negative-marked exam can produce a negative total, which matches how such exams are usually scored. Partial credit could be added later as an explicit per-exam option.

## ADR-024: Scoring is frozen once an exam is published

**Decision:** The question list and the fields that decide what an attempt contains or how it scores (course, kind, question count, negative marking, pass marks, duration, shuffles) can change only while the exam is a draft. Publishing runs `publish_problems` and lists every problem at once. When questions are drawn at random from a larger pool, every question must carry the same marks.
**Consequences:** Every learner of an exam faces the same rules, and random draws can't give different learners different maximum scores. To change a live exam, close it and publish a new one. Title, instructions, window and release settings stay editable.

## ADR-025: An Exam Coordinator role separate from content editing

**Decision:** A new `exam_coordinator` role holds `manage_question_bank` (every question including keys) and `manage_exams`. Instructors get `author_course_assessments`, which covers questions and exams of the courses they teach, plus read-and-use access to *active* shared-bank questions (no course). Exam managers without bank rights see only active questions. Content editors, finance and support get no assessment permissions.
**Consequences:** Seeing answer keys is a deliberate grant, kept apart from editing the website. The E2E editor account needs the extra role (`grant_role … --role exam_coordinator`).

## ADR-026: Learner-facing exam URLs use slugs; rankings show initials

**Decision:** Exams are addressed by slug in learner URLs and APIs (`/dashboard/exams/{slug}`). Attempts use numeric ids, and the API answers 404 for any attempt that isn't the caller's. Leaderboards show each learner's best attempt by initials only, with the viewer's own row marked. Question and option images are public media assets, chosen in the bank editor.
**Consequences:** Rankings don't reveal names or emails. Images are not secret, so don't put an answer in an image's file name or alt text. Exams with sensitive images should wait for private media delivery.

## ADR-027: Payments are confirmed by asking the provider, not by callbacks

**Decision:** An order is marked paid only after the server queries the provider's status API (Khalti `epayment/lookup/`, eSewa `transaction/status/`) and the reported amount matches. Return-URL parameters are never parsed. Neither provider documents webhooks for these products, so a beat job re-checks unsettled gateway payments every 5 minutes for 24 hours, covering learners who close the tab mid-redirect.
**Consequences:** One trust path for every provider, and no unauthenticated endpoint can mark a payment paid. A payment may take up to 5 minutes to settle if the learner never returns. If a provider later adds signed webhooks, they become a trigger for the same verify call.

## ADR-028: Money is Decimal(12, 2) NPR with snapshot order items

**Decision:** Amounts are `Decimal` with two places (rupees and paisa). Order items copy title, slug, list price, unit price and discount at order time; database `CHECK`s keep `total = subtotal − discount` and refunds within the total. Providers that need paisa (Khalti) convert at the edge.
**Consequences:** Later price edits or deleted courses never change an order. The frontend treats amounts as strings and compares them in integer paisa.

## ADR-029: Bad payment situations flag the order instead of guessing

**Decision:** An amount mismatch, a second successful payment for a paid order, or a payment for a course the learner was removed from does not fail silently or auto-refund. The payment gets a distinct status (`mismatch`, `duplicate`) and the order gets `needs_review` with a reason, shown in a finance queue until someone resolves it with a note.
**Consequences:** Money problems always reach a person, with an audit trail. Finance must watch the "Flagged for review" queue.

## ADR-030: Coupons are reserved at order time

**Decision:** Placing an order creates a `CouponRedemption` in `reserved` state under a coupon row lock; payment turns it `redeemed`, cancellation or expiry `released`. Reserved and redeemed rows both count towards total and per-learner limits. Unpaid orders expire after `order_ttl_minutes` (default 60), except while a bank transfer awaits review (held up to 14 days).
**Consequences:** Limited coupons can't be oversold by parallel checkouts. An abandoned checkout ties up a use for at most the order TTL.

## ADR-031: Refunds are recorded, not executed

**Decision:** The platform records refunds (amount, reason, provider or bank reference, optional access revocation) but does not call provider refund APIs. Finance issues the refund from the merchant portal or bank.
**Consequences:** No refund API credentials or flows to secure in this release, and bank transfers are handled the same way. Reconciliation relies on staff entering the reference. A provider refund integration can be added behind the provider interface later.

## ADR-032: A local sandbox gateway instead of shared test credentials

**Decision:** Development, tests and CI use a built-in sandbox provider that simulates the redirect, the status check and a signed webhook. It is enabled only by `PAYMENTS_ENABLE_SANDBOX` and production settings refuse to start with it. Khalti and eSewa test credentials are configured per environment and never committed.
**Consequences:** The whole purchase journey runs end to end without third-party accounts (the Playwright commerce test uses it). The real gateways still need a staging test with merchant test keys before launch (see `deployment.md`).

