import { FileText, Megaphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/ui/feedback";
import { buildMetadata, getSiteSettings } from "@/lib/cms";
import { noticePreview } from "@/lib/notice-preview";
import { getNotices } from "@/lib/notices";
import { formatDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return buildMetadata(settings, { title: "Notices", seo: { meta_description: `Latest notices from ${settings.site_name}.` }, path: "/notices" });
}

export default async function NoticesPage() {
  const notices = await getNotices();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
      <header className="max-w-2xl">
        <h1 className="text-4xl font-bold">Notices</h1>
        <p className="mt-3 text-lg text-muted">Announcements and updates from the Hexacademy team.</p>
      </header>

      {notices.length === 0 ? (
        <EmptyState className="mt-10" icon={Megaphone} title="No notices right now" description="Check back later for announcements." />
      ) : (
        <ul className="mt-10 grid gap-4">
          {notices.map((n) => {
            const preview = noticePreview(n);
            return (
              <li key={n.id}>
                <Link
                  href={`/notices/${n.id}`}
                  className="flex gap-4 rounded-[var(--radius-card)] border border-line bg-white p-4 transition-colors hover:border-teal/40 hover:bg-teal-50/40"
                >
                  <span className="flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-page">
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element -- media host thumbnail
                      <img src={preview.url} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
                    ) : (
                      <FileText className="h-6 w-6 text-teal-700" aria-hidden="true" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <time dateTime={n.published_at} className="text-xs font-medium text-muted">
                      {formatDate(n.published_at)}
                    </time>
                    <span className="text-lg font-semibold text-navy">{n.title}</span>
                    {n.summary && <span className="line-clamp-3 text-sm text-ink">{n.summary}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
