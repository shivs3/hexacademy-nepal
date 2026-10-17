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

## Backups

See [deployment.md](deployment.md#backups). Use `pg_dump` custom format daily, keep copies off-host, and test restores.
