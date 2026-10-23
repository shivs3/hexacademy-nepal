import type { Metadata } from "next";

import { VerifyForm } from "@/components/certificates/verify-form";
import { Card, CardBody } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Verify a certificate",
  description: "Check that a certificate we issued is genuine and still valid.",
};

export default function VerifyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-bold text-navy">Verify a certificate</h1>
      <p className="mt-2 text-muted">Enter the certificate number printed at the bottom of the certificate.</p>
      <Card className="mt-6">
        <CardBody>
          <VerifyForm />
        </CardBody>
      </Card>
    </div>
  );
}
