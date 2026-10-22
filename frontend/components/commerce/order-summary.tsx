import { formatPrice } from "@/lib/catalog";
import { compareMoney } from "@/lib/commerce";
import { cn } from "@/lib/utils";
import type { QuoteLine } from "@/types/commerce";

type Totals = { subtotal: string; discount: string; total: string; coupon_code?: string; refunded_amount?: string };

/** Line items and totals exactly as the server priced them. */
export function OrderSummary({ items, totals, className }: { items: QuoteLine[]; totals: Totals; className?: string }) {
  const hasDiscount = compareMoney(totals.discount, "0") > 0;
  const refunded = totals.refunded_amount && compareMoney(totals.refunded_amount, "0") > 0 ? totals.refunded_amount : null;
  return (
    <div className={cn("flex flex-col gap-3 text-sm", className)}>
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.course_slug} className="flex items-start justify-between gap-4 py-2">
            <span className="min-w-0">
              <span className="block font-medium text-navy">{item.title}</span>
              {compareMoney(item.list_price, item.unit_price) > 0 && (
                <span className="text-xs text-muted">
                  <span className="line-through">{formatPrice(item.list_price)}</span> sale price
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums">{formatPrice(item.unit_price)}</span>
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-1 border-t border-line pt-3">
        <Row label="Subtotal" value={formatPrice(totals.subtotal)} />
        {hasDiscount && (
          <Row label={totals.coupon_code ? `Coupon ${totals.coupon_code}` : "Discount"} value={`− ${formatPrice(totals.discount)}`} tone="success" />
        )}
        <Row label="Total" value={formatPrice(totals.total)} strong />
        {refunded && <Row label="Refunded" value={`− ${formatPrice(refunded)}`} />}
      </dl>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "success" }) {
  return (
    <div className={cn("flex justify-between gap-4", strong && "text-base font-semibold text-navy", tone === "success" && "text-success")}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
