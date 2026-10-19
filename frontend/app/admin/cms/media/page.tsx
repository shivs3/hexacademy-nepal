import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasAnyPerm, hasPerm } from "@/lib/permissions";

import { MediaLibrary } from "./media-library";

export const metadata: Metadata = { title: "Media library" };

export default async function MediaPage() {
  const user = await requireStaff();
  if (!hasAnyPerm(user, ["cms.manage_media", "cms.manage_pages", "cms.manage_blog", "cms.manage_site_settings"])) redirect("/admin");
  return (
    <>
      <PageHeader title="Media library" description="Images and documents used across the website. Files are checked by content when uploaded." />
      <MediaLibrary canManage={hasPerm(user, "cms.manage_media")} />
    </>
  );
}
