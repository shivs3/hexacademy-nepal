import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TemplatesList } from "@/components/certificates/admin/templates-list";
import { CertificateTabs } from "@/components/certificates/admin/section-tabs";
import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export const metadata: Metadata = { title: "Certificate templates" };

export default async function Page() {
  const user = await requireStaff();
  const manage = hasPerm(user, "certificates.manage_certificates");
  if (!manage) redirect("/admin/certificates");
  return (
    <>
      <PageHeader title="Certificates" description="The wording printed on certificates." />
      <CertificateTabs canManage={manage} />
      <TemplatesList />
    </>
  );
}
