import type { BadgeTone } from "@/components/ui/feedback";
import { decimalToMinor } from "@/lib/catalog";
import type { MyOrder, OrderStatus, PaymentAction, PaymentStatus } from "@/types/commerce";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Awaiting payment", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  partially_refunded: { label: "Partly refunded", tone: "teal" },
  refunded: { label: "Refunded", tone: "neutral" },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  initiated: { label: "Started", tone: "neutral" },
  pending: { label: "Pending", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  refunded: { label: "Refunded", tone: "neutral" },
  duplicate: { label: "Duplicate", tone: "danger" },
  mismatch: { label: "Amount mismatch", tone: "danger" },
};

/** Payments still being decided by the provider; the return page keeps checking these. */
export function isUnsettled(status: PaymentStatus): boolean {
  return status === "initiated" || status === "pending";
}

/** Compares decimal strings exactly ("1500.00" vs "10.00"), never through floats. */
export function compareMoney(a: string, b: string): number {
  return (decimalToMinor(a) ?? 0) - (decimalToMinor(b) ?? 0);
}

/** The bank transfer the learner still has to report, if any. */
export function openTransfer(order: Pick<MyOrder, "payments">) {
  return order.payments.find((p) => p.provider === "bank_transfer" && p.status === "pending" && !p.submitted_at) ?? null;
}

export function transferUnderReview(order: Pick<MyOrder, "payments">) {
  return order.payments.find((p) => p.provider === "bank_transfer" && p.status === "pending" && p.submitted_at) ?? null;
}

/**
 * Sends the browser to the provider. Redirect providers get a plain
 * navigation; form providers (eSewa) get a POSTed form built from the
 * server-signed fields. Nothing here is signed or priced in the browser.
 */
export function goToProvider(action: PaymentAction, doc: Document = document): void {
  if (action.kind === "redirect") {
    doc.defaultView?.location.assign(action.url);
    return;
  }
  if (action.kind !== "form") return;
  const form = doc.createElement("form");
  form.method = "POST";
  form.action = action.url;
  form.style.display = "none";
  for (const [name, value] of Object.entries(action.fields)) {
    const input = doc.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  doc.body.appendChild(form);
  form.submit();
}

export function checkoutHref(courseSlug: string): string {
  return `/checkout?course=${encodeURIComponent(courseSlug)}`;
}
