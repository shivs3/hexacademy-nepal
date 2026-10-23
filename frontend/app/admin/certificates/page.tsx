import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CertificatesList } from "@/components/certificates/admin/certificates-list";
import { CertificateTabs } from "@/components/certificates/admin/section-tabs";
import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { canOpenCertificates, hasPerm } from "@/lib/permissions";

export const metadata: Metadata = { title: "Certificates" };

export default async function Page() {
  const user = await requireStaff();
  const manage = hasPerm(user, "certificates.manage_certificates");
  if (!canOpenCertificates(user)) redirect("/admin");
  return (
    <>
      <PageHeader
        title="Certificates"
        description="Every certificate issued. Anyone can check a certificate number on the public verification page."
      />
      <CertificateTabs canManage={manage} />
      <CertificatesList canManage={manage} />
    </>
  );
}
