import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { canOpenCatalog, hasAnyPerm, hasPerm } from "@/lib/permissions";

import { CourseEditor } from "./course-editor";

export const metadata: Metadata = { title: "Edit course" };

type Props = { params: Promise<{ id: string }> };

export default async function EditCoursePage({ params }: Props) {
  const user = await requireStaff();
  if (!canOpenCatalog(user)) redirect("/admin");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  // What the user may change on this course comes from the API's `abilities`; these only pick the media widgets.
  return (
    <CourseEditor
      courseId={Number(id)}
      canPickMedia={hasAnyPerm(user, ["cms.manage_media", "cms.manage_pages", "cms.manage_blog", "cms.manage_site_settings"])}
      canUpload={hasPerm(user, "cms.manage_media")}
    />
  );
}
