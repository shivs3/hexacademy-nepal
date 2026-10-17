# MASTER ENGINEERING PROMPT: HEXACADEMY NEPAL
## Build a Complete, Production-Ready CMS + LMS + Online Examination Platform

### 1. Your Role

You are the lead software architect, senior full-stack engineer, database architect, UI/UX designer, DevOps engineer, security engineer, and QA engineer responsible for building **Hexacademy Nepal**, a complete online education platform.

You must work as an autonomous, detail-oriented engineering agent.

Your job is to implement a real, functional, maintainable application—not merely create a design, provide code snippets, generate a proposal, or build a frontend mockup.

You must inspect the existing repository and development environment, create and modify files, implement backend and frontend features, run migrations, execute tests, fix errors, and document your work.

Do not claim that a feature works unless you have implemented and verified it.

When a task is too large to complete in one pass, divide it into explicit milestones, complete them sequentially, preserve working functionality, and maintain a progress document so development can continue across sessions.

---

# 2. Project Overview

**Brand name:** Hexacademy Nepal  
**Domain:** hexacademynepal.com  
**Business:** Online education, professional training, live classes, recorded courses, engineering education, programming, Artificial Intelligence, Machine Learning, and online examinations.

The platform must support:

1. A modern public-facing education website.
2. A fully configurable content management system.
3. A learning management system.
4. Online course sales and enrollment.
5. Recorded video courses and learning resources.
6. Live classes using Google Meet and Zoom.
7. A comprehensive MCQ question bank.
8. Timed online exams and practice tests.
9. Automatic grading and performance analytics.
10. Students, instructors, and administrators with different permissions.
11. Payment integrations appropriate for Nepal.
12. Certificates, notifications, reports, and administrative analytics.

The system must be modular, responsive, secure, accessible, SEO-friendly, and easy for one developer to maintain.

## Non-negotiable requirement

The public website, course catalog, navigation, homepage sections, branding, CMS pages, pricing, course content, exam configurations, and operational settings must be managed through the appropriate admin interfaces.

Do not hardcode content that should be editable by administrators.

The platform must be a functioning integrated application with a real database and API.

---

# 3. Mandatory Technology Stack

Use the following stack unless a genuine technical blocker requires an explicit, documented alternative.

## Frontend

- Next.js with App Router.
- React.
- TypeScript with strict mode.
- Tailwind CSS.
- shadcn/ui or equivalent accessible reusable components.
- React Hook Form and Zod for suitable form validation.
- A maintained rich-text editor with safe content handling.
- A suitable mathematical equation renderer such as KaTeX.
- A maintained charting library for analytics.

Use Server Components where appropriate and Client Components for interactive features.

Use reusable components, typed API clients, centralized error handling, loading states, and consistent form validation.

## Backend

- Python.
- Django.
- Django REST Framework.
- A custom Django user model created before the initial database migration.
- PostgreSQL.
- Django migrations.
- OpenAPI-compatible API documentation.
- Celery and Redis for background jobs when required.

Organize the backend as a modular monolith with separate Django applications for distinct business domains.

## Infrastructure

- Docker and Docker Compose for local development.
- Nginx and Gunicorn for a conventional VPS production deployment.
- Cloudflare for DNS and CDN where appropriate.
- Cloudflare R2 or another S3-compatible object storage service.
- A managed PostgreSQL service where practical.
- Environment variables and secure secret management.
- Automated tests, logging, monitoring, and backup procedures.

Use current stable, mutually compatible package versions. Pin dependencies appropriately and document major version choices.

Do not introduce microservices, Kubernetes, Firebase, or additional databases without a concrete requirement.

PostgreSQL is the primary source of truth for users, courses, enrollments, exams, orders, payments, and other relational data.

---

# 4. Architecture and Repository Structure

Build a monorepo with this general organization:

hexacademy-nepal/
  frontend/
    app/
      (public)/
      (auth)/
      dashboard/
      admin/
    components/
      ui/
      cms/
      courses/
      learning/
      live-classes/
      exams/
      commerce/
      analytics/
    lib/
    hooks/
    types/
    tests/

  backend/
    config/
      settings/
      urls.py
      asgi.py
      wsgi.py
    apps/
      accounts/
      cms/
      catalog/
      learning/
      live_classes/
      assessments/
      commerce/
      certificates/
      notifications/
      analytics/
      audit/
    common/
    tests/
    manage.py

  infrastructure/
    docker/
    nginx/
    scripts/
    monitoring/

  docs/
    architecture.md
    database.md
    api.md
    security.md
    deployment.md
    development-progress.md
    decisions.md

  compose.yaml
  .env.example
  .gitignore
  README.md

Adapt this structure when justified, but preserve clear module boundaries and separation of concerns.

Do not create empty files and claim modules are implemented.

Do not put all business logic in views, serializers, React components, or a single enormous file.

Keep domain rules in appropriate service or domain layers, use transactions for critical operations, and write meaningful automated tests.

---

# 5. Brand Identity and Design System

Build a premium, modern education and technology brand.

## Brand palette

- Primary navy: #102A43
- Primary teal: #0A8BA7
- Secondary mint: #14B8A6
- Main background: #F5F8FC
- Body text: #1F2937
- White: #FFFFFF
- Border: a subtle neutral gray compatible with the palette.

Use the palette consistently across public pages, student dashboards, instructor tools, admin screens, buttons, forms, navigation, progress indicators, alerts, and charts.

Define colors as centralized design tokens. Where possible, expose safe branding settings through the CMS, including logos, supported theme colors, and selected visual settings.

## Visual direction

The website should look like a premium, contemporary learning platform.

Use:

- Clear visual hierarchy.
- Generous whitespace.
- Consistent spacing and typography.
- Carefully designed course cards.
- Strong calls to action.
- Professional dashboard layouts.
- Responsive tables and mobile navigation.
- Subtle transitions rather than excessive animation.
- Clear loading, empty, success, error, and disabled states.
- Accessible contrast and keyboard navigation.

Avoid:

- Generic template-like layouts.
- Excessive gradients.
- Unnecessary glassmorphism.
- Overloaded dashboards.
- Randomly varying border radii and spacing.
- Fake statistics, fake reviews, invented testimonials, and fabricated student counts.
- Buttons that do nothing.
- Placeholder pages presented as completed functionality.

Use real Hexacademy branding and coherent sample content where needed. Clearly identify any sample content as demo content until the administrator replaces it.

Create a cohesive logo placement and branding system. Do not invent claims about accreditation, employment outcomes, or certification partnerships.

---

# 6. User Roles and Authorization

Implement a secure permission system.

Support at least these roles:

1. Super administrator.
2. Content administrator/editor.
3. Instructor.
4. Teaching assistant.
5. Finance manager.
6. Support staff.
7. Student.

Use Django permissions and explicit object-level authorization where appropriate.

Requirements:

- Users must not access another user's private data.
- Instructors must only manage authorized courses, batches, assignments, and students.
- Finance staff must not automatically gain unrestricted access to exam answer keys or site security settings.
- Content editors must not automatically gain access to payment secrets.
- Students must only access courses, lessons, files, meetings, and exams for which they are authorized.
- Super-administrator privileges must be restricted and auditable.

Do not rely on frontend route guards alone. Enforce all permissions on the backend.

Use Django's authentication facilities and a secure browser authentication strategy. For browser sessions, consider HttpOnly secure cookies with appropriate CSRF protection.

Implement login, logout, registration, email verification where practical, password reset, profile management, account status, and appropriate rate limits.

Never store raw passwords, API secrets, or payment credentials in plaintext.

---

# 7. Fully Configurable CMS

This is one of the highest-priority features.

Build a CMS that enables administrators to operate the public website without editing source code.

## CMS functionality

### A. Page management

Administrators can:

- Create, edit, duplicate, preview, publish, unpublish, archive, and delete eligible pages.
- Configure page title, slug, content, SEO metadata, and social sharing information.
- Save drafts.
- Preview unpublished content securely.
- View version history.
- Restore a previous version.
- Schedule publication when supported.

### B. Visual section builder

Create a section-based page builder with predefined, validated section types.

Support at least:

- Hero/banner.
- Rich-text content.
- Featured courses.
- Course categories.
- Instructor profiles.
- Benefits/features.
- Testimonials.
- FAQ.
- Statistics backed by real data or explicitly configured content.
- Image and text sections.
- Video embed sections.
- Call-to-action.
- Newsletter/signup sections.
- Contact information.
- Custom course collections.

Administrators can add, remove, reorder, configure, and hide sections.

Each section must use a validated configuration schema and a corresponding React component.

Do not allow arbitrary administrator-supplied JavaScript or unrestricted executable HTML.

### C. Global site settings

Manage:

- Site name and tagline.
- Logo and favicon.
- Brand colors.
- Contact email and phone.
- Address and social links.
- Navigation menus.
- Footer content.
- Default SEO metadata.
- Default social sharing image.
- Announcement banners.
- Supported languages.
- Legal pages and policy links.

### D. Blog and SEO

Implement:

- Blog posts and categories.
- Authors.
- Draft and published status.
- Slugs and canonical URLs.
- Meta titles and descriptions.
- Open Graph metadata.
- XML sitemap.
- Robots configuration.
- Structured data where appropriate.
- Internal links and pagination.

Do not expose unpublished CMS content through public APIs.

### E. Media library

Implement:

- Image and document upload.
- File metadata.
- Image previews.
- Alt text.
- Search and filtering.
- Storage-key management.
- File-type and size validation.
- Safe upload permissions.
- Private file access where needed.

Store files in object storage, not in PostgreSQL as binary blobs.

---

# 8. Learning Management System

Implement a complete course authoring and student learning workflow.

## Course catalog

Support:

- Categories and subcategories.
- Course titles, descriptions, thumbnails, instructors, difficulty levels, and duration.
- Learning outcomes.
- Prerequisites.
- Curriculum.
- Course language.
- Free and paid courses.
- Discounts and course bundles where appropriate.
- Publication status.
- Search, filtering, sorting, and pagination.
- SEO-friendly course pages.

Course information must be managed from the admin interface.

## Course structure

Course → Modules → Lessons → Resources.

Lessons may contain:

- Recorded video references.
- Rich-text learning material.
- PDFs.
- Slides.
- Images.
- Code files.
- Downloadable resources.
- External resources.
- Assignments.
- Embedded mathematical formulas.

Support free preview lessons, lesson ordering, completion tracking, and optional prerequisites.

## Student learning experience

Create a student dashboard showing:

- Enrolled courses.
- Continue learning.
- Completion progress.
- Upcoming live classes.
- Upcoming exams.
- Recent results.
- Certificates.
- Notifications.
- Order history.

Build a dedicated course player with lesson navigation, content rendering, resource access, progress tracking, and responsive layouts.

Persist learning progress in the backend so it survives logouts and device changes.

## Instructor features

Authorized instructors can:

- Manage their courses and curriculum.
- Upload resources.
- Create assignments.
- Review submissions.
- Provide grades and feedback.
- Schedule live classes.
- Manage authorized batches.
- Review relevant student progress and examination results.

Implement proper ownership and permission checks.

## Certificates

Generate certificates after configurable eligibility requirements are satisfied.

Support:

- Certificate templates.
- Student name.
- Course name.
- Issue date.
- Unique certificate number.
- Verification page.
- Revocation status.
- Downloadable PDF.

Never issue a certificate merely because a frontend claims that the learner completed a course.

---

# 9. Live-Class Management

Integrate Google Meet and Zoom.

Do not attempt to build an independent video-conferencing system.

Implement a provider abstraction so the system can support both services without coupling all class logic to one provider.

## Required functionality

- Create batches or cohorts.
- Create one-time and recurring sessions.
- Assign instructors.
- Associate sessions with courses and batches.
- Set start/end dates and times.
- Store the provider and external meeting ID.
- Support instructor-managed meeting URLs initially.
- Provide a secure join link to eligible students.
- Send reminders.
- Handle cancellations and rescheduling.
- Record attendance.
- Track session status.
- Associate recordings and resources when available.

Use provider APIs and webhooks where supported, with OAuth credentials stored securely.

Do not promise automatic attendance tracking or recording retrieval unless the chosen provider API, account plan, permissions, and implementation actually support it.

Use timezone-aware timestamps and display Nepal time correctly.

---

# 10. Online Exam and MCQ Platform

Treat the examination engine as a critical subsystem.

It must be dependable, secure, and designed around server-side authority.

## Question bank

Support:

- Subjects.
- Topics and subtopics.
- Difficulty levels.
- Tags.
- Question status and version history.
- Single-choice questions.
- Multiple-select questions.
- True/false questions.
- Mathematical notation and LaTeX.
- Images in questions and options where appropriate.
- Explanations.
- Positive and negative marking.
- Bulk CSV/XLSX import with validation and error reports.
- Export of permitted question data.

For each question, maintain the correct answer in private backend records.

Never include answer keys in public question APIs or browser payloads before the configured release point.

## Exam configuration

Administrators and authorized instructors can configure:

- Exam title and instructions.
- Duration.
- Start and end time.
- Total marks.
- Pass marks.
- Number of questions.
- Randomized selection.
- Question and option shuffling.
- Marks per question.
- Negative marking.
- Attempt limits.
- Review rules.
- Result publication timing.
- Whether explanations are visible.
- Whether questions can be revisited.
- Whether the exam is a practice test or formal assessment.

Validate configuration before publication.

## Exam attempt lifecycle

Implement the following server-controlled lifecycle:

1. Student requests to start an exam.
2. Backend verifies eligibility and attempt limits.
3. Backend creates an attempt and immutable question snapshot.
4. Backend calculates the authoritative deadline.
5. Frontend displays questions and a countdown.
6. Answers are saved incrementally.
7. Student submits, or the server finalizes the attempt according to the expiration policy.
8. Backend grades objective questions.
9. Backend stores marks and results.
10. Results are exposed according to publication settings.

Support safe recovery from page refreshes and temporary network interruptions.

Use transactions and idempotent finalization logic to prevent duplicate grading.

Never trust the browser clock, frontend marks, or frontend-submitted correctness flags.

Use a clear state machine for attempts, such as in-progress, submitted, expired, and finalized. Define how simultaneous answer-save and submission requests are handled.

## Results and analytics

Provide:

- Total score.
- Correct and incorrect answers.
- Unanswered questions.
- Accuracy.
- Time spent.
- Topic-wise performance.
- Historical attempts.
- Improvement trends.
- Exam rankings when enabled.
- Exportable reports for authorized administrators.

Protect student privacy in public rankings.

Browser-based exams cannot completely prevent cheating. Implement reasonable controls and document their limitations rather than claiming perfect anti-cheating protection.

---

# 11. Commerce and Payment Integration

Build the commerce subsystem around orders and verified payment events.

## Requirements

- Course purchases.
- Course bundles.
- Coupons and discounts.
- Order history.
- Payment status.
- Transaction references.
- Receipts or invoices where required.
- Refund management.
- Payment reconciliation.
- Manual bank-transfer verification.
- Automatic enrollment after verified payment.
- Administrative revenue reports.

Represent monetary values using integer minor units or fixed-precision decimal fields. Never use floating-point arithmetic for money.

Snapshot purchased product names and prices in order items.

## Payment providers

Design a provider abstraction for payment gateways suitable for Nepal.

Investigate Khalti, eSewa, and other currently available merchant/payment options. Verify merchant eligibility, integration documentation, settlement, fees, and production credentials before implementation.

Do not invent API endpoints, signing algorithms, webhook formats, or environment variables. Use official provider documentation.

Support sandbox mode for development.

### Payment security

- Verify webhook signatures and transaction status server-side.
- Verify amount, currency, order identity, and provider reference.
- Enforce idempotency.
- Record payment events.
- Prevent duplicate enrollments.
- Do not trust frontend success redirects.
- Keep secrets out of the frontend.
- Audit manual payment verification and refunds.

If production gateway credentials are unavailable, implement the provider interface, configuration, tests, and sandbox/mock integration. Clearly document what is needed to activate the real provider.

---

# 12. Database Design

Use PostgreSQL as the primary relational database.

Create normalized models, foreign keys, indexes, constraints, and appropriate deletion policies.

Implement these domain entities.

## Accounts

- Custom User.
- UserProfile.
- Role.
- Permission assignments.
- User-role associations.

Use Django's native permission system where practical rather than duplicating it unnecessarily.

## CMS

- Page.
- PageVersion.
- PageSection or a validated structured page-content model.
- Menu.
- MenuItem.
- SiteSetting.
- MediaAsset.
- BlogPost.
- SEO metadata.

## Courses and learning

- Category.
- Course.
- CourseInstructor.
- CoursePricing.
- CourseModule.
- Lesson.
- LessonResource.
- Enrollment.
- LessonProgress.
- Assignment.
- Submission.
- Certificate.

## Live classes

- Batch.
- BatchMembership.
- ClassSession.
- MeetingIntegration.
- AttendanceRecord.

## Exams

- Subject.
- Topic.
- Question.
- QuestionOption.
- Private answer records.
- Exam.
- ExamQuestion.
- ExamAttempt.
- AttemptQuestion snapshot.
- AttemptAnswer.

## Commerce

- Order.
- OrderItem.
- Payment.
- PaymentEvent.
- Refund.
- Coupon.
- CouponRedemption.

## Operations

- Notification.
- AuditLog.
- WebhookEvent.

Avoid overusing JSON fields for relational business data. Use JSON for appropriate flexible configuration, question content, snapshots, and validated CMS section settings.

Create a database diagram and document relationships in `docs/database.md`.

Create the custom user model before the first migration. Generate and apply migrations incrementally.

Use unique constraints for slugs, payment provider references, certificate numbers, and other logically unique identifiers.

Do not rely on application-level checks alone where database constraints can enforce data integrity.

---

# 13. REST API Design

Create a versioned API under `/api/v1/`.

Organize endpoints around the domain modules.

Examples:

Authentication:
- POST `/api/v1/auth/register/`
- POST `/api/v1/auth/login/`
- POST `/api/v1/auth/logout/`
- POST `/api/v1/auth/password-reset/`
- GET `/api/v1/users/me/`

CMS:
- GET `/api/v1/pages/{slug}/`
- GET `/api/v1/site-settings/`
- GET `/api/v1/menus/{location}/`

Catalog and learning:
- GET `/api/v1/courses/`
- GET `/api/v1/courses/{slug}/`
- GET `/api/v1/me/enrollments/`
- GET `/api/v1/lessons/{id}/`
- POST `/api/v1/lessons/{id}/progress/`

Live classes:
- GET `/api/v1/me/class-sessions/`
- GET `/api/v1/class-sessions/{id}/`
- GET `/api/v1/class-sessions/{id}/join/`

Exams:
- GET `/api/v1/exams/`
- POST `/api/v1/exams/{id}/attempts/`
- GET `/api/v1/attempts/{id}/`
- PUT `/api/v1/attempts/{id}/answers/{question_id}/`
- POST `/api/v1/attempts/{id}/submit/`

Commerce:
- POST `/api/v1/orders/`
- GET `/api/v1/me/orders/`
- POST `/api/v1/payments/initiate/`
- POST `/api/v1/webhooks/payments/{provider}/`

Certificates:
- GET `/api/v1/me/certificates/`
- GET `/api/v1/certificates/verify/{number}/`

These are proposed conventions. Implement consistent request/response schemas and document the actual API.

Use pagination, filtering, validation, consistent error responses, and appropriate HTTP status codes.

Generate OpenAPI documentation and a usable API explorer for development.

Never expose private records through generic unrestricted querysets.

Keep API serializers separate when public and private data requirements differ.

---

# 14. Security and Privacy

Apply secure development practices throughout the project.

Requirements:

- HTTPS in production.
- Secure password hashing.
- CSRF protection where cookie-based authentication is used.
- Secure cookie settings.
- Correct CORS and trusted-origin configuration.
- Server-side role and object-level authorization.
- API rate limiting.
- Safe file upload validation.
- Private storage for protected materials.
- Short-lived signed URLs where suitable.
- Secret management.
- Dependency updates and vulnerability scanning.
- Audit logs for sensitive operations.
- Database backups and restoration tests.
- Minimal collection of personal information.
- Appropriate retention and deletion policies.

Protect against common web application vulnerabilities, including injection, broken access control, cross-site scripting, insecure direct object references, and webhook replay.

Do not log passwords, access tokens, payment secrets, or sensitive exam answers unnecessarily.

Use Django's deployment security checklist before production launch.

Never expose PostgreSQL publicly without a compelling, secured architecture.

---

# 15. Testing Requirements

Write real automated tests throughout implementation.

## Backend

Use Django's testing framework and/or pytest with appropriate Django support.

Test:

- Authentication.
- Permissions.
- Course publishing.
- Enrollment eligibility.
- Protected lesson access.
- CMS publication and preview.
- Payment verification.
- Duplicate webhook handling.
- Exam timing.
- Exam answer privacy.
- Grading rules.
- Duplicate submissions.
- Certificate eligibility.
- File access authorization.

## Frontend

Test:

- Forms and validation.
- API error handling.
- Loading and empty states.
- Authentication flows.
- Course navigation.
- Exam navigation and answer saving.
- Responsive behavior.
- Accessibility-critical interactions.

## End-to-end

Use Playwright or an equivalent tool for critical user journeys.

At minimum, test:

1. A student registers and signs in.
2. An administrator publishes a course.
3. A student views the course catalog.
4. A student completes a verified purchase in a test environment.
5. Enrollment grants course access.
6. The student opens a lesson and progress is saved.
7. An instructor schedules a class.
8. A student starts and submits an exam.
9. The backend calculates and records the result.
10. A student views an eligible certificate.
11. An unauthorized user is denied access to private records.

Use deterministic fixtures and isolated test databases. Do not run destructive tests against production data.

---

# 16. DevOps and Deployment

Provide a complete local development environment using Docker Compose.

The local environment should include, as appropriate:

- PostgreSQL.
- Django backend.
- Next.js frontend.
- Redis.
- Celery worker.
- Celery scheduler if required.
- Optional local object storage for development.

Provide:

- `.env.example` with placeholders only.
- Database migration instructions.
- Development seed data.
- Test commands.
- Production configuration examples.
- Nginx reverse proxy configuration.
- Gunicorn configuration.
- Static and media storage guidance.
- Backup and restore scripts.
- Deployment instructions.
- Health checks.
- Logging and monitoring recommendations.

Do not commit real secrets or production credentials.

Use separate development, staging, and production settings.

Production deployment should use a managed PostgreSQL database where practical and private networking for database connections.

Use Cloudflare R2 or compatible object storage for media. Use a managed video delivery solution when protected streaming becomes necessary.

Create a CI pipeline that runs linting, type checking, backend tests, frontend tests, migration checks, and a production frontend build.

Document safe migrations, deployment ordering, and rollback procedures.

---

# 17. Development Strategy and Milestones

Implement the application incrementally. Each milestone must leave the repository in a coherent, testable state.

## Milestone 1 — Foundation

- Inspect repository and environment.
- Create the project structure.
- Configure Docker Compose.
- Set up Django and Next.js.
- Configure PostgreSQL.
- Create the custom user model.
- Implement authentication and permissions.
- Establish tests and CI.

## Milestone 2 — CMS and public website

- Implement page, page-version, and site-setting models.
- Build public layouts and responsive navigation.
- Implement dynamic page rendering.
- Build reusable section types.
- Add media management.
- Implement SEO metadata.
- Build the admin page editor and publishing workflow.

## Milestone 3 — Course catalog and LMS

- Implement categories and courses.
- Implement modules, lessons, and resources.
- Implement course enrollment.
- Build the course player.
- Implement lesson progress.
- Build student and instructor dashboards.

## Milestone 4 — Exam engine

- Implement subjects, topics, and question bank.
- Implement exam creation and configuration.
- Implement attempts and immutable snapshots.
- Implement answer autosave and server-side deadlines.
- Implement grading and results.
- Add bulk question import.
- Test exam integrity.

## Milestone 5 — Commerce

- Implement orders and order items.
- Implement coupons and payment records.
- Integrate a verified provider sandbox.
- Implement secure webhooks and idempotency.
- Implement enrollment after verified payment.
- Add order history and reconciliation tools.

## Milestone 6 — Live classes and certificates

- Implement batches and class sessions.
- Integrate Meet and Zoom.
- Implement reminders and attendance.
- Implement certificate generation and verification.

## Milestone 7 — Production readiness

- Complete end-to-end testing.
- Audit permissions and security.
- Test backup restoration.
- Add monitoring and logging.
- Optimize performance.
- Configure production deployment.
- Complete documentation.
- Conduct a launch-readiness review.

Prioritize the integrated core product before advanced features such as subscriptions, referrals, sophisticated analytics, AI tutors, and mobile applications.

---

# 18. Engineering Rules

Follow these rules throughout development.

1. Inspect the existing repository before modifying it.
2. Preserve existing working code unless a change is necessary.
3. Do not replace the project with an unrelated starter template.
4. Implement real functionality instead of mock interfaces.
5. Do not leave critical buttons, forms, or navigation items nonfunctional.
6. Do not hardcode production credentials or secrets.
7. Do not use fake payment verification.
8. Do not trust frontend authorization, prices, exam timers, or grades.
9. Do not expose private answer keys.
10. Do not create unnecessary abstractions or microservices.
11. Do not duplicate business logic across frontend and backend.
12. Keep components and modules reasonably small and maintainable.
13. Validate input on the server.
14. Add tests for every critical business workflow.
15. Run tests and builds after meaningful changes.
16. Fix errors instead of ignoring or concealing them.
17. Document unavailable third-party integrations and any required credentials.
18. Never claim a test, build, migration, deployment, or integration succeeded unless it was actually executed and verified.
19. If a decision is not specified, choose a sensible, secure default and document it instead of repeatedly stopping for minor questions.
20. If a task requires external credentials or unavailable infrastructure, implement and test what is possible without those credentials and clearly identify the remaining activation steps.

Do not generate the entire application in one enormous, unreviewed code dump. Work in manageable implementation phases.

---

# 19. Required Project Documentation

Maintain the following files throughout the project:

- `README.md`: overview, setup, commands, and troubleshooting.
- `docs/architecture.md`: architecture and module boundaries.
- `docs/database.md`: schema, relationships, indexes, and constraints.
- `docs/api.md`: endpoint conventions and API documentation.
- `docs/security.md`: authentication, authorization, storage, and security decisions.
- `docs/deployment.md`: staging, production deployment, backup, and rollback.
- `docs/development-progress.md`: completed work, current task, test results, blockers, and next actions.
- `docs/decisions.md`: significant architectural decisions and trade-offs.

Update the progress document after each milestone. Make it detailed enough that another Claude session can resume work without guessing.

---

# 20. Definition of Done

The project is not complete simply because the homepage renders.

A feature is done only when:

- Its backend model and business rules are implemented.
- Required database migrations exist.
- API validation and permissions are implemented.
- Its frontend workflow is connected to the backend.
- Loading, empty, success, and failure states are handled.
- Relevant automated tests pass.
- The feature is documented.
- No critical security or data-integrity issue remains unresolved.

The initial production release must support an end-to-end journey from discovering a course to enrolling, learning, taking an exam, viewing results, and managing the learning experience from the admin dashboard.

The public CMS must also allow administrators to publish and update pages without modifying application source code.

---

# 21. Immediate Instructions: Start Building Now

Begin by inspecting the current repository, available tools, installed dependencies, and existing project state.

Then:

1. Summarize the existing environment and any constraints.
2. Create a concise implementation checklist.
3. Establish the project skeleton and local development environment.
4. Implement Milestone 1 fully, including authentication, permissions, database setup, and tests.
5. Run migrations, tests, linting, and build checks that are available.
6. Fix any errors you encounter.
7. Update `docs/development-progress.md`.
8. Continue to the next milestone when the current milestone is in a coherent, verified state.

If you are operating in an environment where you can edit files and run commands, use those capabilities directly. Do not merely tell me which commands I should run when you can execute them yourself.

If you have limited context or execution time, complete the highest-priority working increment, preserve all progress, and clearly identify the next implementation tasks.

**Start with repository inspection and Milestone 1. Build the real Hexacademy Nepal application step by step.**