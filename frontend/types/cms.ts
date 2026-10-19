/** Public CMS payloads (mirrors apps/cms/serializers.py). */

export type MediaRef = {
  id: number;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  mime_type: string;
};

export type Seo = {
  meta_title: string;
  meta_description: string;
  canonical_url: string;
  og_image: MediaRef | null;
  noindex: boolean;
};

export type SocialLink = { platform: string; url: string };

export type SiteSettings = {
  site_name: string;
  tagline: string;
  logo: MediaRef | null;
  logo_inverted: MediaRef | null;
  favicon: MediaRef | null;
  color_primary: string;
  color_accent: string;
  color_secondary: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  social_links: SocialLink[];
  footer_text: string;
  default_meta_title: string;
  default_meta_description: string;
  default_og_image: MediaRef | null;
  allow_indexing: boolean;
  default_language: string;
  announcement: { text: string; link_label: string; link_url: string } | null;
  auth_panel: { heading: string; text: string };
};

export type MenuLink = { label: string; url: string; open_in_new_tab: boolean; children: MenuLink[] };
export type Menu = { location: "header" | "footer" | "legal"; title: string; items: MenuLink[] };

export type Video = { url: string; embed_url: string };

type Cta<P extends string> = { [K in `${P}_label` | `${P}_url`]: string };

export type SectionDataMap = {
  hero: {
    eyebrow: string;
    heading: string;
    subheading: string;
    image: MediaRef | null;
    theme: "light" | "dark";
  } & Cta<"primary_cta"> &
    Cta<"secondary_cta">;
  rich_text: { heading: string; body: string; width: "narrow" | "wide" };
  features: {
    heading: string;
    intro: string;
    columns: "2" | "3" | "4";
    items: { icon: string; title: string; text: string }[];
  };
  testimonials: {
    heading: string;
    intro: string;
    items: { quote: string; name: string; role: string; photo: MediaRef | null }[];
  };
  faq: { heading: string; intro: string; items: { question: string; answer: string }[] };
  stats: { heading: string; intro: string; items: { value: string; label: string; note: string }[] };
  image_text: {
    heading: string;
    body: string;
    image: MediaRef | null;
    image_position: "left" | "right";
  } & Cta<"cta">;
  video: { heading: string; intro: string; video_url: Video | null; caption: string };
  cta: {
    heading: string;
    text: string;
    button_label: string;
    button_url: string;
    theme: "light" | "dark" | "accent";
  } & Cta<"secondary">;
  newsletter: { heading: string; text: string; button_label: string; consent_text: string };
  contact: {
    heading: string;
    intro: string;
    show_email: boolean;
    show_phone: boolean;
    show_address: boolean;
    extra: string;
  };
};

export type SectionType = keyof SectionDataMap;

export type Section = {
  [T in SectionType]: { id: string; type: T; data: SectionDataMap[T] };
}[SectionType];

export type PublicPage = {
  title: string;
  slug: string;
  path: string;
  is_home: boolean;
  sections: Section[];
  seo: Seo;
  published_at: string | null;
  updated_at: string;
};

export type BlogCategoryRef = { name: string; slug: string };
export type BlogCategory = BlogCategoryRef & { description: string; post_count: number };

export type BlogAuthor = { id: number; name: string; headline: string; bio: string; avatar: string | null };

export type BlogPostSummary = {
  title: string;
  slug: string;
  excerpt: string;
  cover: MediaRef | null;
  author: BlogAuthor | null;
  categories: BlogCategoryRef[];
  published_at: string;
  reading_minutes: number;
};

export type BlogPost = BlogPostSummary & { body: string; updated_at: string; seo: Seo };

/** Staff preview of a saved post; drafts have no publication date yet. */
export type BlogPostPreview = Omit<BlogPost, "published_at"> & { published_at: string | null };

export type SitemapData = {
  pages: { path: string; updated_at: string }[];
  posts: { path: string; updated_at: string }[];
};
