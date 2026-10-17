export type RoleSlug =
  | "super_admin"
  | "content_editor"
  | "instructor"
  | "teaching_assistant"
  | "finance_manager"
  | "support_staff"
  | "student";

export type Profile = {
  headline: string;
  bio: string;
  avatar: string | null;
  city: string;
  timezone: string;
  marketing_opt_in: boolean;
};

export type CurrentUser = {
  id: number;
  email: string;
  full_name: string;
  phone: string;
  email_verified: boolean;
  date_joined: string;
  roles: RoleSlug[];
  permissions: string[];
  is_superuser: boolean;
  is_staff_member: boolean;
  profile: Profile | null;
};

export type AdminUser = {
  id: number;
  email: string;
  full_name: string;
  phone: string;
  is_active: boolean;
  email_verified: boolean;
  date_joined: string;
  last_login: string | null;
  roles: RoleSlug[];
};

export type RoleInfo = { slug: RoleSlug; name: string; description: string };

export type Paginated<T> = {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  next: string | null;
  previous: string | null;
  results: T[];
};
