import { Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

import { PostsList } from "./posts-list";

export const metadata: Metadata = { title: "Blog" };

export default async function BlogAdminPage() {
  const user = await requireStaff();
  if (!hasPerm(user, "cms.manage_blog")) redirect("/admin");
  return (
    <>
      <PageHeader
        title="Blog"
        description="Articles and news. Drafts stay private until published."
        actions={
          <Link href="/admin/cms/blog/categories" className={buttonVariants({ variant: "outline" })}>
            <Tags className="h-4 w-4" aria-hidden="true" />
            Categories
          </Link>
        }
      />
      <PostsList />
    </>
  );
}
