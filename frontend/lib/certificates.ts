import type { BadgeTone } from "@/components/ui/feedback";
import type { CertificateStatus, Requirement } from "@/types/certificates";

export const CERTIFICATE_BADGE: Record<CertificateStatus, { label: string; tone: BadgeTone }> = {
  valid: { label: "Valid", tone: "success" },
  revoked: { label: "Revoked", tone: "danger" },
};

/** Certificate numbers are printed upper-case; accept what people type. */
export function normalizeNumber(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export const NUMBER_PATTERN = /^HXN-\d{4}-[0-9A-HJKMNP-TV-Z]{8}$/;

export function myPdfUrl(number: string): string {
  return `/api/v1/me/certificates/${encodeURIComponent(number)}/pdf/`;
}

export function progressLabel(requirements: Requirement[]): string {
  const met = requirements.filter((r) => r.met).length;
  return `${met} of ${requirements.length} requirements met`;
}
