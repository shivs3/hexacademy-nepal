# Database

PostgreSQL 17. The schema is managed only through Django migrations. Every model change ships with its migration, and CI fails on missing ones (`makemigrations --check`).

## Conventions

- Primary keys: `BigAutoField`. Public-facing identifiers that must not be guessable (certificate codes, order references) get a separate random column.
- Timestamps: `created_at` / `updated_at` via `common.models.TimeStampedModel`, stored in UTC and displayed in Asia/Kathmandu.
- Money: `BigIntegerField` in paisa plus a `currency` column (ADR-005).
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

## Backups

See [deployment.md](deployment.md#backups). Use `pg_dump` custom format daily, keep copies off-host, and test restores.
