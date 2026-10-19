import { Eye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicChrome } from "@/components/cms/public-chrome";
import { SectionRenderer } from "@/components/cms/section-renderer";
import { serverGetOrNull } from "@/lib/api/server";
import { requireStaff } from "@/lib/auth";
import { getSiteSettings } from "@/lib/cms";
import type { PublicPage } from "@/types/cms";

export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> };

/**
 * Staff-only preview of a draft or historical page version. The session
 * cookie is forwarded to Django, which checks the CMS permission; nothing
 * here is cached or publicly reachable.
 */
export default async function PagePreview({ params, searchParams }: Props) {
  await requireStaff();
  const [{ id }, { version }] = await Promise.all([params, searchParams]);
  if (!/^\d+$/.test(id) || (version && !/^\d+$/.test(version))) notFound();
  const [settings, page] = await Promise.all([
    getSiteSettings(),
    serverGetOrNull<PublicPage>(`/admin/cms/pages/${id}/preview/`, { version }),
  ]);
  if (!page) notFound();

  const banner = (
    <div className="sticky top-0 z-40 bg-warning text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Eye className="h-4 w-4" aria-hidden="true" />
          Preview of “{page.title}”{version ? ` — version ${version}` : " — latest draft"}. Not visible to the public.
        </p>
        <Link href={`/admin/cms/pages/${id}`} className="font-semibold underline underline-offset-2">
          Back to editor
        </Link>
      </div>
    </div>
  );

  return (
    <PublicChrome banner={banner}>
      {page.sections.length ? (
        <SectionRenderer sections={page.sections} settings={settings} />
      ) : (
        <p className="mx-auto max-w-xl px-4 py-24 text-center text-muted">This version has no visible sections.</p>
      )}
    </PublicChrome>
  );
}
