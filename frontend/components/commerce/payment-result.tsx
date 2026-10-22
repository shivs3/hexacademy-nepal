"use client";

import { CheckCircle2, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { checkoutHref, isUnsettled } from "@/lib/commerce";
import type { VerifyResult } from "@/types/commerce";

import { OrderSummary } from "./order-summary";

const POLL_MS = 3000;
const MAX_CHECKS = 10;

/**
 * The page providers send the learner back to. Query parameters from the
 * redirect are ignored: the server asks the provider itself and only that
 * answer decides whether the order is paid.
 */
export function PaymentResult({ reference }: { reference: string }) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [round, setRound] = useState(0);
  const checks = useRef(0);

  useEffect(() => {
    checks.current = 0;
  }, [reference]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const check = () => {
      checks.current += 1;
      api
        .post<VerifyResult>(`/payments/${encodeURIComponent(reference)}/verify/`)
        .then((next) => {
          if (cancelled) return;
          setResult(next);
          setError(null);
          if (isUnsettled(next.payment.status) && next.order.status === "pending") {
            if (checks.current < MAX_CHECKS) timer = setTimeout(check, POLL_MS);
            else setGaveUp(true);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(errorMessage(err));
        });
    };
    check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reference, round]);

  function retryChecks() {
    checks.current = 0;
    setGaveUp(false);
    setError(null);
    setRound((r) => r + 1);
  }

  if (error && !result) {
    return (
      <Alert tone="danger" title="We could not check this payment">
        {error}{" "}
        <button type="button" className="font-medium underline" onClick={retryChecks}>
          Try again
        </button>
      </Alert>
    );
  }
  if (!result) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-3" aria-busy="true">
          <p className="text-sm text-muted">Confirming your payment with the provider…</p>
          <Skeleton className="h-24 w-full" />
        </CardBody>
      </Card>
    );
  }

  const { payment, order } = result;
  const paid = order.status === "paid" || order.status === "partially_refunded";
  const waiting = !paid && isUnsettled(payment.status) && order.status === "pending";
  const firstCourse = order.items[0]?.course_slug;
  const orderHref = `/dashboard/orders/${encodeURIComponent(order.number)}`;

  return (
    <Card>
      <CardBody className="flex flex-col gap-6">
        {paid ? (
          <Status icon={CheckCircle2} tone="text-success" title="Payment confirmed">
            You are enrolled. Your receipt is in your order history.
          </Status>
        ) : waiting ? (
          <Status icon={Clock} tone="text-warning" title="Waiting for the provider">
            {gaveUp
              ? "The provider has not confirmed this payment yet. We keep checking in the background and will enroll you as soon as it is confirmed."
              : "This usually takes a few seconds. Please keep this page open."}
          </Status>
        ) : (
          <Status icon={XCircle} tone="text-danger" title={`Payment ${payment.status_label.toLowerCase()}`}>
            No money was taken for this attempt, or the provider did not confirm it.
            {payment.status === "mismatch" || payment.status === "duplicate"
              ? " Our finance team has been alerted and will contact you."
              : " You can try again."}
          </Status>
        )}

        <OrderSummary items={order.items} totals={order} />
        <p className="text-xs text-muted">
          Order {order.number} · payment reference {payment.reference}
        </p>

        <div className="flex flex-wrap gap-2">
          {paid && firstCourse && (
            <Button asChild>
              <Link href={`/learn/${encodeURIComponent(firstCourse)}`}>Start learning</Link>
            </Button>
          )}
          {waiting && gaveUp && (
            <Button variant="outline" onClick={retryChecks}>
              Check again
            </Button>
          )}
          {!paid && !waiting && order.can_pay && firstCourse && (
            <Button asChild>
              <Link href={checkoutHref(firstCourse)}>Try again</Link>
            </Button>
          )}
          <Button asChild variant={paid ? "outline" : "ghost"}>
            <Link href={orderHref}>View order</Link>
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function Status({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: typeof CheckCircle2;
  tone: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3" role="status">
      <Icon className={`mt-0.5 h-6 w-6 shrink-0 ${tone}`} aria-hidden="true" />
      <div>
        <h2 className="text-lg font-semibold text-navy">{title}</h2>
        <p className="text-sm text-muted">{children}</p>
      </div>
    </div>
  );
}
