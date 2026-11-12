import { ArrowLeft, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RichText } from "@/components/cms/rich-text";
import { buildMetadata, getSiteSettings } from "@/lib/cms";
import { getNotice } from "@/lib/notices";
import { formatBytes, formatDate } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  return /^\d{1,9}$/.test(raw) ? Number(raw) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseId((await params).id);
  const [settings, notice] = await Promise.all([getSiteSettings(), id ? getNotice(id) : null]);
  if (!notice) return { title: "Notice not found", robots: { index: false } };
  return buildMetadata(settings, {
    title: notice.title,
    seo: notice.summary ? { meta_description: notice.summary } : {},
    path: `/notices/${notice.id}`,
    type: "article",
  });
}

export default async function NoticePage({ params }: Props) {
  const id = parseId((await params).id);
  const notice = id ? await getNotice(id) : null;
  if (!notice) notFound();
  const file = notice.attachment;

  return (
    <article className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <Link href="/notices" className="inline-flex items-center gap-1 text-sm text-muted hover:text-navy">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All notices
      </Link>

      <header className="mt-4">
        <time dateTime={notice.published_at} className="text-sm font-medium text-muted">
          {formatDate(notice.published_at)}
        </time>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{notice.title}</h1>
        {notice.summary && <p className="mt-3 whitespace-pre-line text-lg text-muted">{notice.summary}</p>}
      </header>

      {file?.kind === "image" && (
        <figure className="mt-8 overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- full-size notice image from the media host */}
          <img src={file.url} alt={file.alt || notice.title} width={file.width ?? undefined} height={file.height ?? undefined} className="h-auto w-full" />
        </figure>
      )}

      {notice.pages.length > 0 && (
        <div className="mt-8 flex flex-col gap-4">
          {notice.pages.map((p) => (
            <figure key={p.number} className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- rendered PDF page */}
              <img
                src={p.url}
                alt={notice.pages.length > 1 ? `${notice.title} — page ${p.number} of ${notice.pages.length}` : notice.title}
                width={p.width}
                height={p.height}
                loading={p.number > 1 ? "lazy" : undefined}
                className="h-auto w-full"
              />
            </figure>
          ))}
        </div>
      )}

      {file?.kind === "document" && (
        <p className="mt-4">
          <a href={file.url} download={file.original_name} className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline">
            <Download className="h-4 w-4" aria-hidden="true" />
            Download the PDF ({formatBytes(file.size_bytes)})
          </a>
        </p>
      )}

      {notice.body && <RichText html={notice.body} className="mt-8" />}
    </article>
  );
}
