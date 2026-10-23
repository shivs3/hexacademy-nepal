import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RulesList } from "@/components/certificates/admin/rules-list";
import { CertificateTabs } from "@/components/certificates/admin/section-tabs";
import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export const metadata: Metadata = { title: "Certificate rules" };

export default async function Page() {
  const user = await requireStaff();
  const manage = hasPerm(user, "certificates.manage_certificates");
  if (!manage) redirect("/admin/certificates");
  return (
    <>
      <PageHeader
        title="Certificates"
        description="Choose which courses issue certificates and what learners must achieve. The server checks every requirement itself."
      />
      <CertificateTabs canManage={manage} />
      <RulesList />
    </>
  );
}
