import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { canOpenCatalog, hasAnyPerm, hasPerm } from "@/lib/permissions";

import { CoursesList } from "./courses-list";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage() {
  const user = await requireStaff();
  if (!canOpenCatalog(user)) redirect("/admin");
  const manager = hasAnyPerm(user, ["catalog.manage_catalog", "catalog.publish_courses"]);
  return (
    <>
      <PageHeader
        title="Courses"
        description={manager ? "Every course in the catalog. Drafts stay private until published." : "Courses you teach. Drafts stay private until published."}
      />
      <CoursesList canCreate={hasAnyPerm(user, ["catalog.manage_catalog", "catalog.author_assigned_courses"])} canManage={hasPerm(user, "catalog.manage_catalog")} />
    </>
  );
}
