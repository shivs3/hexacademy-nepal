import { CalendarClock, FileText, ImageIcon, Newspaper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardBody } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/feedback";
import { serverGetOrNull } from "@/lib/api/server";
import { requireStaff } from "@/lib/auth";
import { getSiteSettings } from "@/lib/cms";
import { hasAnyPerm, hasPerm } from "@/lib/permissions";
import type { CmsOverview } from "@/types/cms-admin";

export const metadata: Metadata = { title: "Website" };

export default async function CmsOverviewPage() {
  const user = await requireStaff();
  if (!hasAnyPerm(user, ["cms.manage_pages", "cms.manage_blog", "cms.manage_media"])) redirect("/admin");
  const [overview, settings] = await Promise.all([serverGetOrNull<CmsOverview>("/admin/cms/overview/"), getSiteSettings()]);

  const cards = [
    hasPerm(user, "cms.manage_pages") && {
      href: "/admin/cms/pages",
      icon: FileText,
      label: "Pages",
      value: overview?.pages_published,
      detail: overview ? `${overview.pages_draft} draft${overview.pages_draft === 1 ? "" : "s"}` : "",
      unit: "published",
    },
    hasPerm(user, "cms.manage_pages") && {
      href: "/admin/cms/pages",
      icon: CalendarClock,
      label: "Scheduled",
      value: overview?.pages_scheduled,
      detail: "pages waiting to publish",
      unit: "",
    },
    hasPerm(user, "cms.manage_blog") && {
      href: "/admin/cms/blog",
      icon: Newspaper,
      label: "Blog posts",
      value: overview?.posts_published,
      detail: overview ? `${overview.posts_draft} draft${overview.posts_draft === 1 ? "" : "s"}` : "",
      unit: "published",
    },
    {
      href: "/admin/cms/media",
      icon: ImageIcon,
      label: "Media files",
      value: overview?.media,
      detail: "in the library",
      unit: "",
    },
  ].filter((c) => c !== false);

  return (
    <>
      <PageHeader
        title="Website"
        description="Manage the public site's pages, blog, media and navigation."
        actions={
          <Link href="/" target="_blank" className="text-sm font-medium text-teal-700 hover:underline">
            View site
          </Link>
        }
      />
      {!settings.allow_indexing && (
        <Alert tone="warning" className="mb-4">
          Search engines are asked not to index the site.
          {hasPerm(user, "cms.manage_site_settings") && (
            <>
              {" "}
              <Link href="/admin/cms/settings" className="font-medium underline">
                Change this in site settings
              </Link>{" "}
              when you are ready to launch.
            </>
          )}
        </Alert>
      )}
      {!overview && <Alert tone="danger" className="mb-4">The website statistics could not be loaded.</Alert>}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ href, icon: Icon, label, value, detail, unit }) => (
          <li key={label}>
            <Link href={href} className="block h-full rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-teal">
              <Card className="h-full transition-colors hover:border-teal/40">
                <CardBody className="flex flex-col gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-muted">
                    <Icon className="h-4 w-4 text-teal" aria-hidden="true" />
                    {label}
                  </span>
                  <span className="text-3xl font-semibold text-navy">
                    {value ?? "—"}
                    {unit && <span className="ml-1.5 text-sm font-normal text-muted">{unit}</span>}
                  </span>
                  <span className="text-xs text-muted">{detail}</span>
                </CardBody>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
