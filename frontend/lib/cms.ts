import "server-only";

import type { Metadata } from "next";
import { cache } from "react";

import { serverGet, serverGetOrNull } from "@/lib/api/server";
import type { Menu, MenuLink, MediaRef, Seo, SiteSettings } from "@/types/cms";

/** Values used only when the CMS API cannot be reached, so layouts still render. */
export const FALLBACK_SETTINGS: SiteSettings = {
  site_name: "Hexacademy Nepal",
  tagline: "",
  logo: null,
  logo_inverted: null,
  favicon: null,
  color_primary: "#102A43",
  color_accent: "#0A8BA7",
  color_secondary: "#14B8A6",
  contact_email: "",
  contact_phone: "",
  address: "",
  social_links: [],
  footer_text: "",
  default_meta_title: "",
  default_meta_description: "",
  default_og_image: null,
  allow_indexing: false,
  default_language: "en",
  announcement: null,
  auth_panel: { heading: "", text: "" },
};

/** Site settings for this request; falls back to defaults if the API is down. */
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  try {
    return await serverGet<SiteSettings>("/site-settings/");
  } catch {
    return FALLBACK_SETTINGS;
  }
});

export const getMenu = cache(async (location: Menu["location"]): Promise<MenuLink[]> => {
  try {
    const menu = await serverGetOrNull<Menu>(`/menus/${location}/`);
    return menu?.items ?? [];
  } catch {
    return [];
  }
});

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * CSS custom properties for the CMS brand colours. Values are validated on the
 * backend and re-checked here because they are written into a style attribute.
 */
export function brandStyle(settings: SiteSettings): React.CSSProperties {
  const style: Record<string, string> = {};
  if (HEX.test(settings.color_primary)) style["--brand-navy"] = settings.color_primary;
  if (HEX.test(settings.color_accent)) style["--brand-teal"] = settings.color_accent;
  if (HEX.test(settings.color_secondary)) style["--brand-mint"] = settings.color_secondary;
  return style as React.CSSProperties;
}

function ogImages(image: MediaRef | null | undefined) {
  if (!image) return undefined;
  return [{ url: image.url, width: image.width ?? undefined, height: image.height ?? undefined, alt: image.alt }];
}

/** Merge content-level SEO with site defaults into Next metadata. */
export function buildMetadata(
  settings: SiteSettings,
  opts: { title?: string; seo?: Partial<Seo>; path: string; type?: "website" | "article"; isHome?: boolean },
): Metadata {
  const seo = opts.seo ?? {};
  // The home page is titled after the site, not the page record ("Home").
  const title = opts.isHome
    ? seo.meta_title || settings.default_meta_title || settings.site_name
    : seo.meta_title || opts.title || settings.site_name;
  const description = seo.meta_description || settings.default_meta_description || undefined;
  const image = seo.og_image ?? settings.default_og_image;
  const index = settings.allow_indexing && !seo.noindex;
  return {
    // The home page title is used as-is; other titles get the site-name template.
    title: opts.isHome ? { absolute: title } : title,
    description,
    alternates: { canonical: seo.canonical_url || opts.path },
    robots: index ? undefined : { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: opts.path,
      siteName: settings.site_name,
      type: opts.type ?? "website",
      images: ogImages(image),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
