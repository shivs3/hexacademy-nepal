import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Site settings" };

export default async function SiteSettingsPage() {
  const user = await requireStaff();
  if (!hasPerm(user, "cms.manage_site_settings")) redirect("/admin");
  return (
    <>
      <PageHeader title="Site settings" description="Branding, contact details, announcements and search defaults for the public website." />
      <SettingsForm canUpload={hasPerm(user, "cms.manage_media")} />
    </>
  );
}
