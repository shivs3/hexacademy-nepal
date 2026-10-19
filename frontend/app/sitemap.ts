import type { MetadataRoute } from "next";

import { serverGet } from "@/lib/api/server";
import { getSiteSettings, SITE_URL } from "@/lib/cms";
import type { SitemapData } from "@/types/cms";

// Generated per request from published CMS content.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getSiteSettings();
  if (!settings.allow_indexing) return [];
  const data = await serverGet<SitemapData>("/seo/sitemap/").catch(() => ({ pages: [], posts: [] }));
  const latestPost = data.posts.reduce<string | null>((max, p) => (!max || p.updated_at > max ? p.updated_at : max), null);
  const blogIndex = latestPost ? [{ url: `${SITE_URL}/blog`, lastModified: latestPost }] : [];
  return [
    ...data.pages.map((p) => ({ url: `${SITE_URL}${p.path === "/" ? "" : p.path}`, lastModified: p.updated_at })),
    ...blogIndex,
    ...data.posts.map((p) => ({ url: `${SITE_URL}${p.path}`, lastModified: p.updated_at })),
  ];
}
