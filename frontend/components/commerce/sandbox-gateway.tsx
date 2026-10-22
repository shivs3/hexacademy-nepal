"use client";

import { FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatPrice } from "@/lib/catalog";
import type { SandboxCharge } from "@/types/commerce";

/**
 * Plays the part of an external gateway in development. Choosing an outcome
 * only changes the sandbox's own record; the return page then verifies it
 * through the same server-side path a real provider uses.
 */
export function SandboxGateway({ charge }: { charge: SandboxCharge }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"complete" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = charge.status !== "initiated";
  const back = `/checkout/complete/${encodeURIComponent(charge.reference)}`;

  async function choose(outcome: "complete" | "cancel") {
    setBusy(outcome);
    setError(null);
    try {
      await api.post(`/payments/sandbox/${encodeURIComponent(charge.reference)}/`, { outcome });
      router.push(back);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-6 w-6 text-warning" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-semibold text-navy">Test payment gateway</h1>
            <p className="text-sm text-muted">Development only. No real money moves.</p>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Order</dt>
          <dd>{charge.order_number}</dd>
          <dt className="text-muted">For</dt>
          <dd>{charge.items.join(", ")}</dd>
          <dt className="text-muted">Amount</dt>
          <dd className="font-semibold text-navy">{formatPrice(charge.amount)}</dd>
        </dl>
        {error && <Alert tone="danger">{error}</Alert>}
        {done ? (
          <Alert tone="info">
            This test charge is already {charge.status}.{" "}
            <a href={back} className="font-medium underline">
              Return to the shop
            </a>
          </Alert>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => choose("complete")} loading={busy === "complete"} disabled={busy !== null}>
              Simulate successful payment
            </Button>
            <Button variant="outline" onClick={() => choose("cancel")} loading={busy === "cancel"} disabled={busy !== null}>
              Cancel payment
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
