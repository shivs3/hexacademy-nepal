import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

import { CourseCategoriesManager } from "./categories-manager";

export const metadata: Metadata = { title: "Course categories" };

export default async function CourseCategoriesPage() {
  const user = await requireStaff();
  if (!hasPerm(user, "catalog.manage_catalog")) redirect("/admin");
  return (
    <>
      <PageHeader title="Course categories" description="Organise the catalog. Visitors filter courses by category; one level of subcategories is supported." />
      <CourseCategoriesManager />
    </>
  );
}
