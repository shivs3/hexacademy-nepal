"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Textarea } from "@/components/ui/input";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { decimalToMinor, formatPrice } from "@/lib/catalog";
import { compareMoney } from "@/lib/commerce";
import type { AdminPayment } from "@/types/commerce";

/** Runs a dialog action, keeping the dialog open with the server's message if it fails. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await action();
    } catch (err) {
      const fe = isApiError(err) ? err.fieldErrors() : {};
      setFields(fe);
      setError(Object.keys(fe).length ? null : errorMessage(err));
      setBusy(false);
    }
  }
  return { busy, error, fields, setError, run };
}

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

export function NoteDialog({
  title,
  description,
  label,
  confirmLabel,
  tone,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  label: string;
  confirmLabel: string;
  tone?: "danger";
  onClose: () => void;
  onSubmit: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const { busy, error, fields, setError, run } = useSubmit();
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button type="submit" form="note-dialog-form" variant={tone === "danger" ? "danger" : "primary"} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        id="note-dialog-form"
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!note.trim()) return setError(`${label} is required.`);
          void run(() => onSubmit(note.trim()));
        }}
      >
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label={label} htmlFor="dialog-note" error={fields.note} required>
          <Textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </Field>
      </form>
    </Dialog>
  );
}

export type RefundBody = { amount: string; reason: string; provider_reference: string; revoke_access: boolean };

/**
 * Records a refund already paid out through the provider's merchant portal or
 * the bank. This integration does not move refund money itself; finance pays
 * it back there and notes the reference here.
 */
export function RefundDialog({
  refundable,
  onClose,
  onSubmit,
}: {
  refundable: string;
  onClose: () => void;
  onSubmit: (body: RefundBody) => Promise<void>;
}) {
  const [amount, setAmount] = useState(refundable);
  const [reason, setReason] = useState("");
  const [providerRef, setProviderRef] = useState("");
  const [revoke, setRevoke] = useState(false);
  const [local, setLocal] = useState<Record<string, string>>({});
  const { busy, error, fields, run } = useSubmit();
  const full = MONEY.test(amount) && compareMoney(amount, refundable) === 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problems: Record<string, string> = {};
    if (!MONEY.test(amount) || (decimalToMinor(amount) ?? 0) <= 0) problems.amount = "Enter an amount such as 1500 or 1500.50.";
    else if (compareMoney(amount, refundable) > 0) problems.amount = `At most ${formatPrice(refundable)} can be refunded.`;
    if (!reason.trim()) problems.reason = "Give a reason for the refund.";
    setLocal(problems);
    if (Object.keys(problems).length) return;
    void run(() => onSubmit({ amount, reason: reason.trim(), provider_reference: providerRef.trim(), revoke_access: revoke }));
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title="Record a refund"
      description="Pay the money back through the provider's merchant portal or your bank first, then record it here."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button type="submit" form="refund-form" variant="danger" loading={busy}>
            Record refund
          </Button>
        </>
      }
    >
      <form id="refund-form" className="flex flex-col gap-4" noValidate onSubmit={submit}>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Amount (NPR)" htmlFor="refund-amount" error={local.amount ?? fields.amount} hint={`Up to ${formatPrice(refundable)}.`} required>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.trim())} />
        </Field>
        <Field label="Reason" htmlFor="refund-reason" error={local.reason ?? fields.reason} required>
          <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Field label="Provider or bank reference" htmlFor="refund-ref" error={fields.provider_reference} hint="Optional, for reconciliation.">
          <Input maxLength={100} value={providerRef} onChange={(e) => setProviderRef(e.target.value)} />
        </Field>
        <div className="flex items-start gap-2">
          <Checkbox id="refund-revoke" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} />
          <Label htmlFor="refund-revoke" className="font-normal">
            Revoke course access{" "}
            <span className="block text-xs text-muted">
              {full ? "Usual for a full refund." : "Usually left unticked for a partial refund."}
            </span>
          </Label>
        </div>
      </form>
    </Dialog>
  );
}

export function ApproveTransferDialog({
  payment,
  onClose,
  onSubmit,
}: {
  payment: AdminPayment;
  onClose: () => void;
  onSubmit: (body: { amount_received: string; note: string }) => Promise<void>;
}) {
  const [received, setReceived] = useState("");
  const [note, setNote] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const { busy, error, fields, run } = useSubmit();

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title="Approve bank transfer"
      description={`Check your bank statement for ${payment.bank_reference} from ${payment.payer_name}, then enter the amount that actually arrived.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button type="submit" form="approve-form" loading={busy}>
            Approve and enroll
          </Button>
        </>
      }
    >
      <form
        id="approve-form"
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!MONEY.test(received)) return setLocal("Enter the amount received, such as 1500.");
          setLocal(null);
          void run(() => onSubmit({ amount_received: received, note: note.trim() }));
        }}
      >
        {error && <Alert tone="danger">{error}</Alert>}
        <Field
          label="Amount received (NPR)"
          htmlFor="approve-amount"
          error={local ?? fields.amount_received}
          hint={`Expected ${formatPrice(payment.amount)}. A different amount is refused; reject the transfer and contact the learner instead.`}
          required
        >
          <Input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value.trim())} autoFocus />
        </Field>
        <Field label="Note" htmlFor="approve-note" error={fields.note} hint="Optional, kept in the audit log.">
          <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
