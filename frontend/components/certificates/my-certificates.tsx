"use client";

import { Award, Check, Circle, Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LoadError } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, EmptyState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { CERTIFICATE_BADGE, myPdfUrl, progressLabel } from "@/lib/certificates";
import { formatDate } from "@/lib/utils";
import type { CertificateEligibility, MyCertificate } from "@/types/certificates";

export function MyCertificates() {
  const earned = useApiResource<MyCertificate[]>("/me/certificates/");
  const progress = useApiResource<CertificateEligibility[]>("/me/certificates/progress/");

  if (earned.error) return <LoadError message={earned.error} onRetry={earned.reload} />;
  if (!earned.data) return <Skeleton className="h-40" />;

  const working = progress.data ?? [];
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="earned">
        <h2 id="earned" className="mb-3 text-lg font-semibold">
          Earned
        </h2>
        {earned.data.length === 0 ? (
          <EmptyState
            icon={Award}
            title="No certificates yet"
            description="When you meet a course's certificate requirements, your certificate is issued automatically and appears here."
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {earned.data.map((c) => (
              <li key={c.number}>
                <CertificateCard certificate={c} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {progress.error && <LoadError message={progress.error} onRetry={progress.reload} />}
      {working.length > 0 && (
        <section aria-labelledby="in-progress">
          <h2 id="in-progress" className="mb-3 text-lg font-semibold">
            In progress
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {working.map((row) => (
              <li key={row.course.id}>
                <ProgressCard
                  row={row}
                  onIssued={() => {
                    earned.reload();
                    progress.reload();
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CertificateCard({ certificate: c }: { certificate: MyCertificate }) {
  const badge = CERTIFICATE_BADGE[c.status];
  return (
    <Card className="h-full">
      <CardBody className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <Award className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-semibold text-navy">{c.course_title}</h3>
              <p className="text-sm text-muted">Issued {formatDate(c.issued_at, { dateStyle: "long" })}</p>
            </div>
          </div>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        <p className="font-mono text-sm">{c.number}</p>
        {c.status === "revoked" && (
          <p className="text-sm text-danger">This certificate was revoked. Contact support if you think this is a mistake.</p>
        )}
        <div className="mt-auto flex flex-wrap gap-2">
          <Button asChild size="sm">
            <a href={myPdfUrl(c.number)}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Download PDF
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/certificates/verify/${c.number}`}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Verification page
            </Link>
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function ProgressCard({ row, onIssued }: { row: CertificateEligibility; onIssued: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function claim() {
    setBusy(true);
    try {
      const result = await api.post<CertificateEligibility>(`/me/courses/${encodeURIComponent(row.course.slug)}/certificate/`);
      if (result.certificate) {
        toast.success("Your certificate has been issued.");
        onIssued();
      } else {
        toast.error("Not all requirements are met yet.");
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="h-full">
      <CardBody className="flex h-full flex-col gap-3">
        <div>
          <h3 className="font-semibold text-navy">
            <Link href={`/learn/${encodeURIComponent(row.course.slug)}`} className="hover:underline">
              {row.course.title}
            </Link>
          </h3>
          <p className="text-sm text-muted">{progressLabel(row.requirements)}</p>
        </div>
        <ul className="flex flex-col gap-1.5 text-sm">
          {row.requirements.map((r) => (
            <li key={r.key} className="flex items-center gap-2">
              {r.met ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Circle className="h-4 w-4 text-muted" aria-hidden="true" />}
              <span className={r.met ? "" : "text-muted"}>{r.label}</span>
              <span className="sr-only">{r.met ? "(done)" : "(not yet)"}</span>
            </li>
          ))}
        </ul>
        {row.eligible && (
          <div className="mt-auto">
            <Button size="sm" onClick={claim} loading={busy}>
              Get my certificate
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
