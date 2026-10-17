"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";

export function VerificationCard({ email, verified }: { email: string; verified: boolean }) {
  const toast = useToast();
  const [sending, setSending] = useState(false);

  async function resend() {
    setSending(true);
    try {
      const res = await api.post<{ detail: string }>("/auth/verify-email/resend/");
      toast.success(res.detail);
    } catch (err) {
      toast.error(isApiError(err) && err.code === "throttled" ? "Please wait before requesting another email." : errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle>Email</CardTitle>
        {verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <p className="break-all text-sm text-body">{email}</p>
        {!verified && (
          <Button variant="outline" onClick={resend} loading={sending}>
            Resend verification email
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
