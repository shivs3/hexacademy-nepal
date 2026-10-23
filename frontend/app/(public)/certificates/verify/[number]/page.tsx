import { BadgeCheck, ShieldAlert, ShieldX } from "lucide-react";
import type { Metadata } from "next";

import { VerifyForm } from "@/components/certificates/verify-form";
import { Card, CardBody } from "@/components/ui/card";
import { serverGetOrNull } from "@/lib/api/server";
import { normalizeNumber } from "@/lib/certificates";
import { getSiteSettings } from "@/lib/cms";
import { formatDate } from "@/lib/utils";
import type { VerifiedCertificate } from "@/types/certificates";

type Props = { params: Promise<{ number: string }> };

// Verification pages name a person, so they are never indexed.
export const metadata: Metadata = {
  title: "Certificate verification",
  robots: { index: false, follow: false },
};

export default async function VerifyResultPage({ params }: Props) {
  const number = normalizeNumber(decodeURIComponent((await params).number));
  const [settings, cert] = await Promise.all([
    getSiteSettings(),
    serverGetOrNull<VerifiedCertificate>(`/certificates/verify/${encodeURIComponent(number)}/`),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-bold text-navy">Certificate verification</h1>
      <Card className="mt-6">
        <CardBody className="flex flex-col gap-4">
          {!cert ? (
            <Result icon={ShieldAlert} tone="text-warning" title="No certificate found">
              We have no certificate numbered <span className="font-mono">{number}</span>. Check the number and try again.
            </Result>
          ) : cert.status === "revoked" ? (
            <Result icon={ShieldX} tone="text-danger" title="This certificate has been revoked">
              Certificate <span className="font-mono">{cert.number}</span> was issued to {cert.recipient_name} for {cert.course_title} but was revoked
              on {formatDate(cert.revoked_at, { dateStyle: "long" })}. It is no longer valid.
            </Result>
          ) : (
            <>
              <Result icon={BadgeCheck} tone="text-success" title="Valid certificate">
                This certificate was issued by {settings.site_name} and is valid.
              </Result>
              <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted">Certificate</dt>
                <dd className="font-medium">{cert.heading}</dd>
                <dt className="text-muted">Awarded to</dt>
                <dd className="font-medium">{cert.recipient_name}</dd>
                <dt className="text-muted">Course</dt>
                <dd className="font-medium">{cert.course_title}</dd>
                <dt className="text-muted">Issued on</dt>
                <dd className="font-medium">{formatDate(cert.issued_at, { dateStyle: "long" })}</dd>
                <dt className="text-muted">Number</dt>
                <dd className="font-mono">{cert.number}</dd>
              </dl>
            </>
          )}
        </CardBody>
      </Card>
      <h2 className="mt-10 text-lg font-semibold">Check another certificate</h2>
      <div className="mt-3">
        <VerifyForm />
      </div>
    </div>
  );
}

function Result({ icon: Icon, tone, title, children }: { icon: typeof BadgeCheck; tone: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3" role="status">
      <Icon className={`h-8 w-8 shrink-0 ${tone}`} aria-hidden="true" />
      <div>
        <p className="text-lg font-semibold text-navy">{title}</p>
        <p className="mt-1 text-sm text-body">{children}</p>
      </div>
    </div>
  );
}
