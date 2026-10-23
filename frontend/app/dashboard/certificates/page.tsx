import type { Metadata } from "next";

import { MyCertificates } from "@/components/certificates/my-certificates";
import { PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Certificates" };

export default function CertificatesPage() {
  return (
    <>
      <PageHeader title="Certificates" description="Certificates you have earned, and what is left for the ones on offer." />
      <MyCertificates />
    </>
  );
}
