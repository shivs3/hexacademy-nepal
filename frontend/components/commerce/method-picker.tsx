"use client";

import { Building2, FlaskConical, Wallet } from "lucide-react";

import { RichText } from "@/components/cms/rich-text";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { formatPrice } from "@/lib/catalog";
import { compareMoney } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import type { PaymentMethods, PaymentProvider } from "@/types/commerce";

const ICONS = { khalti: Wallet, esewa: Wallet, bank_transfer: Building2, sandbox: FlaskConical } as const;

const HINTS: Record<PaymentProvider, string> = {
  khalti: "Pay with your Khalti wallet, mobile banking or card. You will be sent to Khalti and brought back here.",
  esewa: "Pay with your eSewa wallet. You will be sent to eSewa and brought back here.",
  bank_transfer: "Transfer to our bank account, then tell us the reference. Access starts after our team confirms it.",
  sandbox: "Test gateway for development. No real money moves.",
};

/** Usable methods for this total, with the first usable one as the default. */
export function usableMethods(data: PaymentMethods | null, total: string) {
  return (data?.methods ?? []).filter((m) => compareMoney(total, m.min_amount) >= 0);
}

export function MethodPicker({
  data,
  error,
  total,
  value,
  onChange,
}: {
  data: PaymentMethods | null;
  error: string | null;
  total: string;
  value: PaymentProvider | null;
  onChange: (key: PaymentProvider) => void;
}) {
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Skeleton className="h-24 w-full" />;
  if (data.methods.length === 0) {
    return (
      <Alert tone="warning" title="Online payment is not available right now">
        Please contact us and we will help you enroll.
      </Alert>
    );
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-navy">Payment method</legend>
      {data.methods.map((m) => {
        const tooSmall = compareMoney(total, m.min_amount) < 0;
        const Icon = ICONS[m.key];
        const checked = value === m.key;
        return (
          <label
            key={m.key}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
              checked ? "border-teal bg-teal-50" : "border-line bg-white hover:border-teal/40",
              tooSmall && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="radio"
              name="payment-method"
              value={m.key}
              checked={checked}
              disabled={tooSmall}
              onChange={() => onChange(m.key)}
              className="mt-1 accent-[var(--color-teal)]"
            />
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
            <span className="flex flex-col gap-0.5 text-sm">
              <span className="font-medium text-navy">
                {m.label}
                {m.key === "sandbox" && <span className="ml-2 rounded bg-warning-50 px-1.5 py-0.5 text-xs text-warning">Test mode</span>}
              </span>
              <span className="text-muted">{tooSmall ? `Needs a total of at least ${formatPrice(m.min_amount)}.` : HINTS[m.key]}</span>
            </span>
          </label>
        );
      })}
      {value === "bank_transfer" && data.bank_transfer_instructions && (
        <div className="rounded-lg border border-line bg-page p-3">
          <p className="mb-1 text-sm font-medium text-navy">Bank details</p>
          <RichText html={data.bank_transfer_instructions} className="text-sm" />
        </div>
      )}
    </fieldset>
  );
}
