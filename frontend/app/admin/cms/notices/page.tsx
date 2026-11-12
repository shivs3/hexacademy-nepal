import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

import { NoticesList } from "./notices-list";

export const metadata: Metadata = { title: "Notices" };

export default async function NoticesAdminPage() {
  const user = await requireStaff();
  if (!hasPerm(user, "cms.manage_notices")) redirect("/admin");
  return (
    <>
      <PageHeader
        title="Notices"
        description="Messages that pop up on the website and are listed at /notices. Attach an image or a PDF; visitors read it inside the site."
        actions={
          <Link href="/admin/cms/notices/new" className={buttonVariants()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New notice
          </Link>
        }
      />
      <NoticesList />
    </>
  );
}
