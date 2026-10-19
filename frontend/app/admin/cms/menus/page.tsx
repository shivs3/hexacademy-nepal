import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

import { MenusEditor } from "./menus-editor";

export const metadata: Metadata = { title: "Menus" };

export default async function MenusPage() {
  const user = await requireStaff();
  if (!hasPerm(user, "cms.manage_menus")) redirect("/admin");
  return (
    <>
      <PageHeader title="Menus" description="Navigation links in the site header, footer and legal bar. Changes go live when you save." />
      <MenusEditor />
    </>
  );
}
