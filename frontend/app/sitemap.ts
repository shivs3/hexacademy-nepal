import type { MetadataRoute } from "next";

import { serverGet } from "@/lib/api/server";
import { getSiteSettings, SITE_URL } from "@/lib/cms";
import type { SitemapData } from "@/types/cms";

// Generated per request from published CMS content.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getSiteSettings();
  if (!settings.allow_indexing) return [];
  const [data, courses, exams] = await Promise.all([
    serverGet<SitemapData>("/seo/sitemap/").catch(() => ({ pages: [], posts: [] })),
    serverGet<{ slug: string; updated_at: string }[]>("/seo/course-sitemap/").catch(() => []),
    serverGet<{ slug: string; updated_at: string }[]>("/seo/exam-sitemap/").catch(() => []),
  ]);
  const latestPost = data.posts.reduce<string | null>((max, p) => (!max || p.updated_at > max ? p.updated_at : max), null);
  const latestCourse = courses.reduce<string | null>((max, c) => (!max || c.updated_at > max ? c.updated_at : max), null);
  const catalogIndex = latestCourse ? [{ url: `${SITE_URL}/courses`, lastModified: latestCourse }] : [];
  const latestExam = exams.reduce<string | null>((max, e) => (!max || e.updated_at > max ? e.updated_at : max), null);
  const examIndex = latestExam ? [{ url: `${SITE_URL}/exams`, lastModified: latestExam }] : [];
  const blogIndex = latestPost ? [{ url: `${SITE_URL}/blog`, lastModified: latestPost }] : [];
  return [
    ...data.pages.map((p) => ({ url: `${SITE_URL}${p.path === "/" ? "" : p.path}`, lastModified: p.updated_at })),
    ...catalogIndex,
    ...courses.map((c) => ({ url: `${SITE_URL}/courses/${encodeURIComponent(c.slug)}`, lastModified: c.updated_at })),
    ...examIndex,
    ...exams.map((e) => ({ url: `${SITE_URL}/exams/${encodeURIComponent(e.slug)}`, lastModified: e.updated_at })),
    ...blogIndex,
    ...data.posts.map((p) => ({ url: `${SITE_URL}${p.path}`, lastModified: p.updated_at })),
  ];
}
