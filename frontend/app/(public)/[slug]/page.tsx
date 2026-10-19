import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { SectionRenderer } from "@/components/cms/section-renderer";
import { serverGetOrNull } from "@/lib/api/server";
import { buildMetadata, getSiteSettings } from "@/lib/cms";
import type { PublicPage } from "@/types/cms";

type Props = { params: Promise<{ slug: string }> };

const getPage = cache((slug: string) => serverGetOrNull<PublicPage>(`/pages/${encodeURIComponent(slug)}/`));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [settings, page] = await Promise.all([getSiteSettings(), getPage(slug)]);
  if (!page) return { title: "Page not found", robots: { index: false } };
  return buildMetadata(settings, { title: page.title, seo: page.seo, path: page.path });
}

export default async function CmsPage({ params }: Props) {
  const { slug } = await params;
  const [settings, page] = await Promise.all([getSiteSettings(), getPage(slug)]);
  if (!page) notFound();
  // The home page has one canonical address.
  if (page.is_home) permanentRedirect("/");
  return <SectionRenderer sections={page.sections} settings={settings} />;
}
