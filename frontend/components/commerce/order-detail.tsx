"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert, Badge, PageHeader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatPrice } from "@/lib/catalog";
import { ORDER_STATUS, PAYMENT_STATUS, openTransfer, transferUnderReview } from "@/lib/commerce";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { MyOrder, PaymentMethods, PaymentProvider } from "@/types/commerce";

import { BankTransferForm } from "./bank-transfer-form";
import { MethodPicker, usableMethods } from "./method-picker";
import { OrderSummary } from "./order-summary";
import { startPayment } from "./pay";

export function OrderDetail({ initial, justCreated }: { initial: MyOrder; justCreated: boolean }) {
  const toast = useToast();
  const [order, setOrder] = useState(initial);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const status = ORDER_STATUS[order.status];
  const transfer = openTransfer(order);
  const reviewing = transferUnderReview(order);
  const receipt = order.status === "paid" || order.status === "partially_refunded" || order.status === "refunded";
  const canCancel = order.can_pay && !reviewing;

  async function reload() {
    setOrder(await api.get<MyOrder>(`/me/orders/${encodeURIComponent(order.number)}/`));
  }

  async function cancel() {
    setCancelling(true);
    try {
      setOrder(await api.post<MyOrder>(`/me/orders/${encodeURIComponent(order.number)}/cancel/`));
      setCancelOpen(false);
      toast.success("Order cancelled.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <PageHeader
        title={receipt ? "Receipt" : "Order"}
        description={`Order ${order.number} · placed ${formatDateTime(order.created_at)}`}
        actions={
          <div className="flex gap-2 print:hidden">
            {receipt && (
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                Print receipt
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href="/dashboard/orders">All orders</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          {reviewing && (
            <Alert tone="info" title="Your transfer is being checked">
              You reported reference {reviewing.bank_reference}
              {reviewing.transferred_on ? ` on ${formatDate(reviewing.transferred_on)}` : ""}. You will be enrolled as soon as our team
              matches it with our bank statement.
            </Alert>
          )}
          {order.payments.some((p) => p.provider === "bank_transfer" && p.status === "failed" && p.review_note) && (
            <Alert tone="warning" title="We could not match your transfer">
              {order.payments.find((p) => p.provider === "bank_transfer" && p.status === "failed" && p.review_note)?.review_note}
            </Alert>
          )}
          {transfer ? (
            <BankTransferForm
              reference={transfer.reference}
              amount={transfer.amount}
              justCreated={justCreated}
              defaultName={order.buyer_name}
              onSubmitted={reload}
            />
          ) : (
            order.can_pay && !reviewing && <PayNow order={order} />
          )}

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardBody>
              {order.payments.length === 0 ? (
                <p className="text-sm text-muted">No payment attempts yet.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {order.payments.map((p) => (
                    <li key={p.reference} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <span className="font-medium text-navy">{p.provider_label}</span>
                        <span className="block text-xs text-muted">
                          {p.reference} · {formatDateTime(p.created_at)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <Badge tone={PAYMENT_STATUS[p.status].tone}>{p.status_label}</Badge>
                        <span className="tabular-nums">{formatPrice(p.amount)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit">
          <CardBody className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-navy">Summary</h2>
              <Badge tone={reviewing ? "teal" : status.tone}>{reviewing ? "Transfer under review" : order.status_label}</Badge>
            </div>
            <OrderSummary items={order.items} totals={order} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted">
              <dt>Billed to</dt>
              <dd className="text-right">
                {order.buyer_name}
                <br />
                {order.buyer_email}
              </dd>
              {order.paid_at && (
                <>
                  <dt>Paid</dt>
                  <dd className="text-right">{formatDateTime(order.paid_at)}</dd>
                </>
              )}
              {order.can_pay && order.expires_at && !reviewing && (
                <>
                  <dt>Pay by</dt>
                  <dd className="text-right">{formatDateTime(order.expires_at)}</dd>
                </>
              )}
            </dl>
            {receipt && order.items[0] && (
              <Button asChild className="print:hidden">
                <Link href={`/learn/${encodeURIComponent(order.items[0].course_slug)}`}>Go to course</Link>
              </Button>
            )}
            {canCancel && (
              <Button variant="ghost" className="print:hidden" onClick={() => setCancelOpen(true)}>
                Cancel order
              </Button>
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this order?"
        description="Any coupon on it is released. You can start a new checkout later."
        confirmLabel="Cancel order"
        tone="danger"
        loading={cancelling}
        onConfirm={cancel}
      />
    </>
  );
}

function PayNow({ order }: { order: MyOrder }) {
  const methods = useApiResource<PaymentMethods>("/payments/methods/");
  const [chosen, setChosen] = useState<PaymentProvider | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usable = usableMethods(methods.data, order.total);
  const method = usable.find((m) => m.key === chosen)?.key ?? usable[0]?.key ?? null;

  async function pay() {
    if (!method) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await startPayment(order.number, method);
      // A bank transfer stays on this page; reload so the transfer form appears.
      if (outcome === "manual") window.location.reload();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete your payment</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <MethodPicker data={methods.data} error={methods.error} total={order.total} value={method} onChange={setChosen} />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button onClick={pay} loading={busy} disabled={!method} className="self-start">
          Pay {formatPrice(order.total)}
        </Button>
      </CardBody>
    </Card>
  );
}
