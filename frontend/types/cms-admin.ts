import type { MediaRef } from "./cms";

/** Staff-only CMS shapes (apps/cms/admin_serializers.py). */

export type MediaKind = "image" | "document";

export type MediaAsset = {
  id: number;
  url: string;
  kind: MediaKind;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  title: string;
  alt_text: string;
  uploaded_by_name: string;
  created_at: string;
};

export type PageStatus = "draft" | "published" | "archived";

export type AdminPageSummary = {
  id: number;
  title: string;
  slug: string;
  path: string;
  is_home: boolean;
  status: PageStatus;
  published_version_number: number | null;
  latest_version_number: number | null;
  has_unpublished_changes: boolean;
  published_at: string | null;
  scheduled_for: string | null;
  updated_at: string;
  updated_by_name: string;
};

/** Stored (unresolved) section: images are media ids. */
export type DraftSection = {
  id: string;
  type: string;
  hidden: boolean;
  data: Record<string, unknown>;
};

export type AdminPage = AdminPageSummary & {
  sections: DraftSection[];
  meta_title: string;
  meta_description: string;
  canonical_url: string;
  og_image: number | null;
  og_image_detail: MediaRef | null;
  noindex: boolean;
  scheduled_version_number: number | null;
  created_at: string;
};

export type PageVersion = {
  number: number;
  title: string;
  note: string;
  created_at: string;
  created_by_name: string;
  is_published: boolean;
};

export type FieldKind =
  | "text"
  | "textarea"
  | "richtext"
  | "link"
  | "image"
  | "video"
  | "select"
  | "boolean"
  | "integer"
  | "list"
  | "ref"
  | "refs";

export type FieldDescriptor = {
  name: string;
  kind: FieldKind;
  label: string;
  required: boolean;
  max_length?: number;
  default?: unknown;
  max_items?: number;
  min_items?: number;
  min_value?: number;
  max_value?: number;
  help?: string;
  choices?: { value: string; label: string }[];
  fields?: FieldDescriptor[];
  /** Reference type for "ref"/"refs" fields (e.g. "course"). */
  ref?: string;
};

export type ReferenceOption = { id: number; label: string; description: string };

export type SectionTypeInfo = {
  type: string;
  label: string;
  description: string;
  fields: FieldDescriptor[];
};

export type SocialPlatform = "facebook" | "instagram" | "linkedin" | "youtube" | "x" | "tiktok" | "github" | "whatsapp";

export type AdminSiteSettings = {
  site_name: string;
  tagline: string;
  logo: number | null;
  logo_inverted: number | null;
  favicon: number | null;
  color_primary: string;
  color_accent: string;
  color_secondary: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  social_links: { platform: SocialPlatform; url: string }[];
  footer_text: string;
  default_meta_title: string;
  default_meta_description: string;
  default_og_image: number | null;
  allow_indexing: boolean;
  default_language: "en" | "ne";
  announcement_enabled: boolean;
  announcement_text: string;
  announcement_link_label: string;
  announcement_link_url: string;
  announcement_starts_at: string | null;
  announcement_ends_at: string | null;
  auth_panel_heading: string;
  auth_panel_text: string;
  logo_detail: MediaRef | null;
  logo_inverted_detail: MediaRef | null;
  favicon_detail: MediaRef | null;
  default_og_image_detail: MediaRef | null;
  updated_at: string;
};

export type MenuLocation = "header" | "footer" | "legal";

export type AdminMenuItem = {
  id?: number;
  label: string;
  page: number | null;
  page_title?: string;
  page_status?: string;
  url: string;
  open_in_new_tab: boolean;
  is_visible: boolean;
  children: AdminMenuItem[];
};

export type AdminMenu = {
  location: MenuLocation;
  location_label: string;
  title: string;
  updated_at: string;
  items: AdminMenuItem[];
};

export type PostStatus = "draft" | "published" | "archived";

export type AdminPostSummary = {
  id: number;
  title: string;
  slug: string;
  status: PostStatus;
  published_at: string | null;
  is_scheduled: boolean;
  author_name: string;
  updated_at: string;
};

export type AdminPost = AdminPostSummary & {
  excerpt: string;
  body: string;
  cover: number | null;
  cover_detail: MediaRef | null;
  author: number | null;
  categories: number[];
  meta_title: string;
  meta_description: string;
  canonical_url: string;
  og_image: number | null;
  og_image_detail: MediaRef | null;
  noindex: boolean;
  created_at: string;
};

export type AdminBlogCategory = {
  id: number;
  name: string;
  slug: string;
  description: string;
  post_count: number;
};

export type AuthorOption = { id: number; full_name: string; email: string };

export type NewsletterSubscriber = {
  id: number;
  email: string;
  source: string;
  consented_at: string;
  unsubscribed_at: string | null;
};

export type CmsOverview = {
  pages_published: number;
  pages_draft: number;
  pages_scheduled: number;
  posts_published: number;
  posts_draft: number;
  media: number;
};
