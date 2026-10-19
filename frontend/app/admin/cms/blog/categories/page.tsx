import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

import { CategoriesManager } from "./categories-manager";

export const metadata: Metadata = { title: "Blog categories" };

export default async function BlogCategoriesPage() {
  const user = await requireStaff();
  if (!hasPerm(user, "cms.manage_blog")) redirect("/admin");
  return (
    <>
      <Link href="/admin/cms/blog" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-navy">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All posts
      </Link>
      <PageHeader title="Blog categories" description="Group posts by topic. Visitors can filter the blog by category." />
      <CategoriesManager />
    </>
  );
}
