"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { OrderSummary } from "@/components/commerce/order-summary";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge, PageHeader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatPrice } from "@/lib/catalog";
import { ORDER_STATUS, PAYMENT_STATUS, compareMoney, isUnsettled } from "@/lib/commerce";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { AdminOrderDetail, AdminPayment } from "@/types/commerce";

import { ApproveTransferDialog, NoteDialog, RefundDialog } from "./order-dialogs";

type Open =
  | { kind: "cancel" }
  | { kind: "resolve" }
  | { kind: "refund" }
  | { kind: "approve"; payment: AdminPayment }
  | { kind: "reject"; payment: AdminPayment }
  | null;

const GATEWAYS = new Set(["khalti", "esewa", "sandbox"]);

export function AdminOrderView({ initial, canManage, canRefund }: { initial: AdminOrderDetail; canManage: boolean; canRefund: boolean }) {
  const toast = useToast();
  const [order, setOrder] = useState(initial);
  const [open, setOpen] = useState<Open>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const path = `/admin/commerce/orders/${encodeURIComponent(order.number)}/`;
  const refundable = (order.status === "paid" || order.status === "partially_refunded") && compareMoney(order.refundable_amount, "0") > 0;

  async function reload() {
    setOrder(await api.get<AdminOrderDetail>(path));
  }

  async function recheck(payment: AdminPayment) {
    setChecking(payment.reference);
    try {
      const next = await api.post<AdminPayment>(`/admin/commerce/payments/${payment.id}/recheck/`);
      await reload();
      toast.success(`Provider says: ${next.status_label}.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setChecking(null);
    }
  }

  const done = (message: string) => async (next?: AdminOrderDetail) => {
    if (next) setOrder(next);
    else await reload();
    setOpen(null);
    toast.success(message);
  };

  return (
    <>
      <PageHeader
        title={`Order ${order.number}`}
        description={`${order.user.full_name} · ${order.user.email} · placed ${formatDateTime(order.created_at)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canRefund && refundable && (
              <Button variant="outline" onClick={() => setOpen({ kind: "refund" })}>
                Record refund
              </Button>
            )}
            {canManage && order.status === "pending" && (
              <Button variant="ghost" onClick={() => setOpen({ kind: "cancel" })}>
                Cancel order
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href="/admin/commerce/orders">All orders</Link>
            </Button>
          </div>
        }
      />

      {order.needs_review && (
        <Alert tone="danger" title="Needs review" className="mb-6">
          <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{order.review_reason || "A payment on this order did not match what we expected."}</span>
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setOpen({ kind: "resolve" })}>
                Mark resolved
              </Button>
            )}
          </span>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              {order.payments.length === 0 && <p className="text-sm text-muted">The learner has not started a payment.</p>}
              {order.payments.map((p) => (
                <PaymentCard
                  key={p.id}
                  payment={p}
                  canManage={canManage}
                  checking={checking === p.reference}
                  onRecheck={() => recheck(p)}
                  onApprove={() => setOpen({ kind: "approve", payment: p })}
                  onReject={() => setOpen({ kind: "reject", payment: p })}
                />
              ))}
            </CardBody>
          </Card>

          {order.refunds.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Refunds</CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="divide-y divide-line text-sm">
                  {order.refunds.map((r) => (
                    <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        <span className="font-medium text-navy">{r.reason}</span>
                        <span className="block text-xs text-muted">
                          {formatDateTime(r.created_at)} · {r.processed_by_name || "—"}
                          {r.provider_reference && ` · ref ${r.provider_reference}`}
                          {r.revoked_access && " · access revoked"}
                        </span>
                      </span>
                      <span className="tabular-nums">− {formatPrice(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardBody className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-navy">Summary</h2>
              <Badge tone={ORDER_STATUS[order.status].tone}>{order.status_label}</Badge>
            </div>
            <OrderSummary items={order.items} totals={order} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted">
              {order.paid_at && <Meta label="Paid" value={formatDateTime(order.paid_at)} />}
              {order.status === "pending" && order.expires_at && <Meta label="Expires" value={formatDateTime(order.expires_at)} />}
              {order.cancelled_at && <Meta label="Closed" value={formatDateTime(order.cancelled_at)} />}
              {refundable && <Meta label="Refundable" value={formatPrice(order.refundable_amount)} />}
            </dl>
          </CardBody>
        </Card>
      </div>

      {open?.kind === "cancel" && (
        <NoteDialog
          title="Cancel this order?"
          description="The learner can no longer pay for it. Any coupon reservation is released."
          label="Reason"
          confirmLabel="Cancel order"
          tone="danger"
          onClose={() => setOpen(null)}
          onSubmit={async (note) => done("Order cancelled.")(await api.post<AdminOrderDetail>(`${path}cancel/`, { note }))}
        />
      )}
      {open?.kind === "resolve" && (
        <NoteDialog
          title="Mark the review as resolved"
          description="Describe what you did, for example a refund issued or a confirmation from the provider."
          label="Resolution"
          confirmLabel="Mark resolved"
          onClose={() => setOpen(null)}
          onSubmit={async (note) => done("Review resolved.")(await api.post<AdminOrderDetail>(`${path}resolve-review/`, { note }))}
        />
      )}
      {open?.kind === "refund" && (
        <RefundDialog
          refundable={order.refundable_amount}
          onClose={() => setOpen(null)}
          onSubmit={async (body) => done("Refund recorded.")(await api.post<AdminOrderDetail>(`${path}refund/`, body))}
        />
      )}
      {open?.kind === "approve" && (
        <ApproveTransferDialog
          payment={open.payment}
          onClose={() => setOpen(null)}
          onSubmit={async (body) => {
            await api.post(`/admin/commerce/payments/${open.payment.id}/approve-transfer/`, body);
            await done("Transfer approved. The learner is enrolled.")();
          }}
        />
      )}
      {open?.kind === "reject" && (
        <NoteDialog
          title="Reject this transfer?"
          description="The learner sees your reason and can report the transfer again or pay another way."
          label="Reason shown to the learner"
          confirmLabel="Reject transfer"
          tone="danger"
          onClose={() => setOpen(null)}
          onSubmit={async (note) => {
            await api.post(`/admin/commerce/payments/${open.payment.id}/reject-transfer/`, { note });
            await done("Transfer rejected.")();
          }}
        />
      )}
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="text-right">{value}</dd>
    </>
  );
}

function PaymentCard({
  payment: p,
  canManage,
  checking,
  onRecheck,
  onApprove,
  onReject,
}: {
  payment: AdminPayment;
  canManage: boolean;
  checking: boolean;
  onRecheck: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const transferWaiting = p.provider === "bank_transfer" && p.status === "pending" && p.submitted_at;
  const problem = p.status === "mismatch" || p.status === "duplicate";
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-navy">
            {p.provider_label} · {formatPrice(p.amount)}
          </p>
          <p className="text-xs text-muted">
            {p.reference} · started {formatDateTime(p.created_at)}
            {p.verified_at && ` · verified ${formatDateTime(p.verified_at)}`}
          </p>
        </div>
        <Badge tone={PAYMENT_STATUS[p.status].tone}>
          {problem && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
          {p.status_label}
        </Badge>
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
        {p.provider_reference && <Detail label="Provider reference" value={p.provider_reference} />}
        {p.provider_transaction_id && <Detail label="Transaction ID" value={p.provider_transaction_id} />}
        {p.provider_status && <Detail label="Provider status" value={p.provider_status} />}
        {p.last_checked_at && <Detail label="Last checked" value={formatDateTime(p.last_checked_at)} />}
        {p.submitted_at && (
          <>
            <Detail label="Payer" value={p.payer_name} />
            <Detail label="Bank reference" value={p.bank_reference} />
            <Detail label="Transferred on" value={formatDate(p.transferred_on)} />
            {p.payer_note && <Detail label="Learner note" value={p.payer_note} />}
          </>
        )}
        {p.reviewed_at && <Detail label="Reviewed" value={`${formatDateTime(p.reviewed_at)} by ${p.reviewed_by_name || "—"}`} />}
        {p.review_note && <Detail label="Review note" value={p.review_note} />}
      </dl>

      {canManage && (transferWaiting || GATEWAYS.has(p.provider)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {transferWaiting && (
            <>
              <Button size="sm" onClick={onApprove}>
                Approve transfer
              </Button>
              <Button size="sm" variant="outline" onClick={onReject}>
                Reject
              </Button>
            </>
          )}
          {GATEWAYS.has(p.provider) && (isUnsettled(p.status) || p.status === "completed") && (
            <Button size="sm" variant="outline" onClick={onRecheck} loading={checking}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Check with provider
            </Button>
          )}
        </div>
      )}

      {p.events.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted hover:text-navy">Event log ({p.events.length})</summary>
          <ol className="mt-2 flex flex-col gap-1 border-l border-line pl-3">
            {p.events.map((e) => (
              <li key={e.id}>
                <span className="font-medium text-navy">{e.kind_label}</span>{" "}
                <span className="text-muted">
                  {formatDateTime(e.created_at)} · {e.source}
                  {e.status_after && ` → ${e.status_after}`}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="break-all text-body">{value}</dd>
    </>
  );
}
