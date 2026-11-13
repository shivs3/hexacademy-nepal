"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";

/** The server refuses buying, enrolling and formal exams with this code until the email is verified. */
export const EMAIL_UNVERIFIED = "email_unverified";

export function isUnverifiedError(err: unknown): boolean {
  return isApiError(err) && err.code === EMAIL_UNVERIFIED;
}

type Sent = { tone: "success" | "danger"; text: string } | null;

/** Explains why an action is blocked and lets the learner ask for a new link in place. */
export function VerifyEmailNotice({
  email,
  title = "Verify your email address",
  children,
  className,
}: {
  email?: string;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Sent>(null);

  async function resend() {
    setSending(true);
    setSent(null);
    try {
      const res = await api.post<{ detail: string }>("/auth/verify-email/resend/");
      setSent({ tone: "success", text: `${res.detail} Open the link in it, then come back to this page.` });
    } catch (err) {
      setSent({
        tone: "danger",
        text: isApiError(err) && err.code === "throttled" ? "Please wait a while before asking for another email." : errorMessage(err),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <Alert tone="warning" title={title} className={className}>
      <div className="flex flex-col gap-3">
        <p>
          {children ?? "You need a verified email address to buy courses, enroll and take formal exams."}
          {email && (
            <>
              {" "}
              We sent a link to <strong className="break-all">{email}</strong>; check your spam folder too.
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" onClick={resend} loading={sending}>
            Send a new link
          </Button>
          {sent && <p className={sent.tone === "success" ? "text-success" : "text-danger"}>{sent.text}</p>}
        </div>
      </div>
    </Alert>
  );
}
