# Database

PostgreSQL 17. The schema is managed only through Django migrations. Every model change ships with its migration, and CI fails on missing ones (`makemigrations --check`).

## Conventions

- Primary keys: `BigAutoField`. Public-facing identifiers that must not be guessable (certificate codes, order references) get a separate random column.
- Timestamps: `created_at` / `updated_at` via `common.models.TimeStampedModel`, stored in UTC and displayed in Asia/Kathmandu.
- Money: never floats. Catalog list prices are `DecimalField(10, 2)` in NPR (ADR-015). Order and payment amounts (M5) follow ADR-005.
- Deletion: `PROTECT` on financial and assessment history, `SET_NULL` on audit actors, and `CASCADE` only for owned child rows.
- Integrity rules (uniqueness, valid state combinations) are enforced with database constraints where practical, not only in Python.

## Current tables (M1)

### `accounts_user`
| Column | Notes |
| --- | --- |
| `email` | unique; plus unique index on `lower(email)`; normalised to lower case on save |
| `full_name`, `phone` | |
| `password` | Django PBKDF2 hash (never plaintext) |
| `is_active`, `is_staff`, `is_superuser` | `is_superuser` = super admin, CLI-granted only |
| `email_verified_at` | null until verified |
| `date_joined`, `last_login` | |

Custom permissions: `access_admin_panel`, `view_user_directory`, `manage_user_status`, `assign_roles`.

### `accounts_userprofile`
One-to-one with the user: `headline`, `bio`, `avatar`, `city`, `timezone` (default `Asia/Kathmandu`) and `marketing_opt_in`.

### `auth_group` / `accounts_user_groups`
One group per role (named after the role, e.g. `Content editor`), synced from `apps/accounts/roles.py` after each migrate.

### `audit_auditlog` (append-only)
`actor` (FK, SET_NULL) + `actor_email` snapshot, `action`, `target_type`/`target_id`/`target_repr`, `metadata` (JSON, with sensitive keys redacted), `ip_address`, `user_agent`, `request_id` and `created_at`. The model refuses updates and deletes. Indexed on `action`, `created_at` and `(target_type, target_id)`.

## CMS tables (M2)

```
SiteSettings (id=1) ──► MediaAsset (logo, logo_inverted, favicon, default_og_image)   SET_NULL
Page ──< PageVersion            (CASCADE; versions immutable)
Page ──► PageVersion            published_version, scheduled_version   RESTRICT
Page ──► MediaAsset             og_image   SET_NULL
Menu ──< MenuItem ──< MenuItem  (two levels, CASCADE) ──► Page (SET_NULL)
BlogPost >──< BlogCategory      (M2M)
BlogPost ──► User (author), MediaAsset (cover, og_image)   SET_NULL
```

| Table | Key columns and rules |
| --- | --- |
| `cms_mediaasset` | `file` (storage key, not bytes), `kind` (image/document, indexed), `mime_type` and `size_bytes` (both detected on the server), `width`/`height`, `checksum_sha256` (indexed), `title`, `alt_text`, `uploaded_by` |
| `cms_sitesettings` | Singleton: `CHECK (id = 1)`. Holds identity, brand colours, contact, `social_links` (validated JSON), footer, announcement window, SEO defaults, `default_language`, `allow_indexing` and sign-in panel text |
| `cms_page` | `slug` unique (max 120; reserved application routes refused). `status` draft/published/archived (indexed). `sections` holds the draft JSON, validated against the section registry. `is_home` is unique where true (one home page). `CHECK`: published ⇒ `published_version` set. `CHECK`: `scheduled_for` and `scheduled_version` are both set or both null. `scheduled_for` indexed. Includes the SEO columns |
| `cms_pageversion` | `(page, number)` unique. Holds `title`, `sections` and `seo` snapshots, plus `note` and `created_by`. The model refuses updates |
| `cms_menu` | `location` unique (header/footer/legal) |
| `cms_menuitem` | `label`, then either `page` (resolved to its current path) or `url` (validated). `position`, `open_in_new_tab`, `is_visible`. Index on `(menu, parent, position)` |
| `cms_blogcategory` | `name` unique (80), `slug` unique (90) |
| `cms_blogpost` | `slug` unique (140), `excerpt`, `body` (sanitised HTML), `status`, `published_at`. Index on `(status, published_at)`. `CHECK`: published ⇒ `published_at` set. A future `published_at` means the post is scheduled |
| `cms_newslettersubscriber` | `email` unique on `lower(email)`, `source`, `consented_at`, `unsubscribed_at` |

SEO columns, shared by pages and posts through the `SeoFields` abstract model: `meta_title`, `meta_description`, `canonical_url`, `og_image`, `noindex`.

Section JSON refers to media by id. When an asset is deleted, the foreign-key columns are set to NULL and an id left inside section JSON simply resolves to no image when rendered.

Custom permissions: `cms.manage_media`, `manage_site_settings`, `manage_pages`, `publish_pages`, `manage_menus`, `manage_blog`, `publish_blog` and `view_newsletter_subscribers`.

## Catalog and learning tables (M3)

```
Category ──< Category                    parent (one level in the UI), PROTECT
Course ──► Category                      SET_NULL
Course ──► MediaAsset                    thumbnail, og_image   SET_NULL
Course ──< CourseInstructor >── User     (CASCADE; role instructor / teaching_assistant)
Course ──< CourseModule ──< Lesson ──< LessonResource   (CASCADE)
Lesson ──► Course                        denormalised for access checks, kept equal to module.course
Enrollment ──► User (CASCADE), Course (PROTECT)
Enrollment ──< LessonProgress ──► Lesson (CASCADE)
Enrollment ──► Lesson                    last_lesson   SET_NULL
```

| Table | Key columns and rules |
| --- | --- |
| `catalog_category` | `name` (80), `slug` unique (90), `parent`, `description` (300), `position`. Unique `(parent, name)` with `NULLS NOT DISTINCT`. `CHECK`: not its own parent |
| `catalog_course` | `slug` unique (160), `title` (160), `subtitle` (220), `description` (sanitised HTML), `level`, `language`, `duration_text`, `learning_outcomes` / `prerequisites` (validated JSON string lists), `sequential`, `price` / `sale_price` (decimal 10,2), `sale_ends_at`, `is_featured`, `status` draft/published/archived (indexed), `published_at`, SEO columns. Indexes `(status, -published_at)` and `(category, status)`. `CHECK`s: price ≥ 0; sale price below price; published ⇒ `published_at` set |
| `catalog_courseinstructor` | `(course, user)` unique, `role`, `is_public`, `position` |
| `catalog_coursemodule` | `title` (160), `description` (500), `position`. Index `(course, position)` |
| `catalog_lesson` | `title` (160), `summary` (300), `body` (sanitised HTML with maths nodes), `video_url` (YouTube/Vimeo only), `duration_minutes` (0–1440), `is_preview`, `is_published`, `position`. Indexes `(module, position)` and `(course, is_published)` |
| `catalog_lessonresource` | `kind` file/link, `file` (private storage key) **or** `url` (`CHECK`: exactly one), `original_name`, `mime_type` and `size_bytes` (detected on the server), `position`. At most 30 per lesson (service rule) |
| `learning_enrollment` | `(user, course)` unique, so a learner can never be enrolled twice. `status` active/revoked (indexed), `source` free/purchase/admin, `granted_by`, `enrolled_at`, `completed_at`, `revoked_at` (`CHECK`: revoked ⇔ date set), `last_lesson`, `last_accessed_at` |
| `learning_lessonprogress` | `(enrollment, lesson)` unique, `first_viewed_at`, `completed_at` |

Revoking keeps the enrollment row and its progress, so restoring access loses nothing. Courses with enrollments cannot be deleted (`PROTECT`) and cannot return to draft, only be archived.

Custom permissions: `catalog.manage_catalog`, `publish_courses`, `author_assigned_courses`; `learning.manage_enrollments`, `view_learner_progress`.

## Assessment tables (M4)

```
Subject ──< Topic ──< Topic                 subtopics (two levels), CASCADE
Question ──► Subject (PROTECT), Topic (SET_NULL), Course (SET_NULL; null = shared bank), MediaAsset image (SET_NULL)
Question ──< QuestionOption                 CASCADE; is_correct is the private key
Question ──< QuestionVersion                CASCADE; immutable copy after each content change
Exam ──► Course                             PROTECT; null = open to every signed-in learner
Exam ──< ExamQuestion >── Question          question PROTECT (retire, never delete a used question)
ExamAttempt ──► Exam (PROTECT), User (CASCADE)
ExamAttempt ──< AttemptQuestion ──1 AttemptAnswer   CASCADE; AttemptQuestion.question SET_NULL
```

| Table | Key columns and rules |
| --- | --- |
| `assessments_subject` | `name`, `slug` unique, `description`, `position` |
| `assessments_topic` | `subject`, `parent` (subtopic), `name`, `slug`. Unique `(subject, slug)` |
| `assessments_question` | `kind` single/multiple/true_false, `status` draft/active/retired (indexed), `difficulty`, `prompt` (sanitised HTML with maths nodes), `explanation`, `tags` (text array, GIN index), `default_marks` (`CHECK` > 0), `default_negative_marks` (`CHECK` ≥ 0), `version`. Indexes `(subject, status)`, `(topic, status)` |
| `assessments_questionoption` | `text`, `image`, `is_correct`, `position`. Never serialised to learners |
| `assessments_questionversion` | `(question, version)` unique, `snapshot` JSON (content and key) |
| `assessments_exam` | `slug` unique, `title`, `instructions`, `kind` practice/formal, `status` draft/published/closed, `duration_minutes` (1–600), `opens_at` / `closes_at` (`CHECK`: closes after opens), `question_count` (null = all; `CHECK` > 0), shuffle flags, `negative_marking`, `pass_marks`, `max_attempts` (null = unlimited; `CHECK` > 0), `allow_revisit`, `result_release` immediate/after_close/manual, `results_published_at`, `show_answers`, `show_explanations`, `ranking_enabled`. Index `(status, course)` |
| `assessments_examquestion` | Unique `(exam, question)`, `position`, `marks` (`CHECK` > 0), `negative_marks` (`CHECK` ≥ 0) |
| `assessments_examattempt` | `number`, `status` in_progress/submitted/expired, `started_at`, `deadline` (indexed), `ended_at`, `graded_at`, `furthest_position`, `score`, `max_score`, correct/incorrect/unanswered counts, `passed`. Unique `(exam, user, number)`; **partial unique `(exam, user)` where in progress** (one open attempt); `CHECK`: in progress ⇔ `ended_at` and `graded_at` null |
| `assessments_attemptquestion` | The frozen snapshot: `position` (unique per attempt), `question_version`, `kind`, `subject_name`, `topic_name`, `content` (learner-visible JSON, options in display order), `answer_key` (sorted option ids), `explanation`, `marks`, `negative_marks` |
| `assessments_attemptanswer` | One per attempt question: `selected` (sorted ids), `flagged`, `saved_at`; `is_correct` and `awarded_marks` are written by grading only |

Marks are `Decimal(6, 2)`. Grading reads only the attempt's snapshot, so editing or retiring a question never changes an existing attempt. Exams with attempts cannot be deleted (`PROTECT`) or returned to draft.

Custom permissions: `assessments.manage_question_bank`, `manage_exams`, `author_course_assessments`.

## Backups

See [deployment.md](deployment.md#backups). Use `pg_dump` custom format daily, keep copies off-host, and test restores.
