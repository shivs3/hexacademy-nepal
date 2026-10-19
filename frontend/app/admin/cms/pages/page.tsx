import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

import { PagesList } from "./pages-list";

export const metadata: Metadata = { title: "Pages" };

export default async function PagesPage() {
  const user = await requireStaff();
  if (!hasPerm(user, "cms.manage_pages")) redirect("/admin");
  return (
    <>
      <PageHeader title="Pages" description="Website pages built from sections. Drafts stay private until published." />
      <PagesList />
    </>
  );
}
