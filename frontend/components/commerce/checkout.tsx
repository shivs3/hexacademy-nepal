"use client";

import { Lock, Tag, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { compareMoney } from "@/lib/commerce";
import type { MyOrder, PaymentMethods, PaymentProvider, Quote } from "@/types/commerce";

import { MethodPicker, usableMethods } from "./method-picker";
import { OrderSummary } from "./order-summary";
import { startPayment } from "./pay";

const COUPON_CODES = new Set([
  "coupon_invalid",
  "coupon_expired",
  "coupon_not_applicable",
  "coupon_min_subtotal",
  "coupon_exhausted",
  "coupon_user_limit",
]);

export function Checkout({ courseSlug }: { courseSlug: string }) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [chosen, setChosen] = useState<PaymentProvider | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const methods = useApiResource<PaymentMethods>("/payments/methods/");

  useEffect(() => {
    const controller = new AbortController();
    api
      .post<Quote>("/orders/quote/", { courses: [courseSlug] }, { signal: controller.signal })
      .then(setQuote)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setQuoteError(errorMessage(err));
      });
    return () => controller.abort();
  }, [courseSlug]);

  const total = quote?.total ?? "0";
  const usable = usableMethods(methods.data, total);
  // The learner's pick if still usable for this total, otherwise the first usable method.
  const method = usable.find((m) => m.key === chosen)?.key ?? usable[0]?.key ?? null;
  const free = quote !== null && compareMoney(total, "0") === 0;

  async function applyCoupon(code: string) {
    setApplying(true);
    setCouponError(null);
    try {
      const next = await api.post<Quote>("/orders/quote/", { courses: [courseSlug], coupon_code: code });
      setQuote(next);
      setCoupon(code ? next.coupon_code : "");
      if (!code) setCouponInput("");
    } catch (err) {
      if (isApiError(err) && COUPON_CODES.has(err.code)) setCouponError(err.message);
      else setCouponError(errorMessage(err));
    } finally {
      setApplying(false);
    }
  }

  async function pay() {
    setPaying(true);
    setPayError(null);
    try {
      // Prices are recomputed by the server here; the quote above is only a preview.
      const order = await api.post<MyOrder>("/orders/", { courses: [courseSlug], coupon_code: coupon });
      if (order.status === "paid") {
        router.push(`/learn/${encodeURIComponent(courseSlug)}`);
        router.refresh();
        return;
      }
      if (!method) throw new Error("Choose a payment method.");
      const outcome = await startPayment(order.number, method);
      if (outcome === "manual") router.push(`/dashboard/orders/${encodeURIComponent(order.number)}?new=1`);
      // Otherwise the browser is on its way to the provider; keep the button busy.
    } catch (err) {
      setPayError(err instanceof Error && !isApiError(err) ? err.message : errorMessage(err));
      setPaying(false);
    }
  }

  if (quoteError) {
    return (
      <Alert tone="danger" title="This course cannot be bought right now">
        {quoteError}{" "}
        <Link href={`/courses/${encodeURIComponent(courseSlug)}`} className="font-medium underline">
          Back to the course
        </Link>
      </Alert>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardBody className="flex flex-col gap-6">
          {free ? (
            <Alert tone="success" title="Nothing to pay">
              Your coupon covers the full price. Confirm to start learning.
            </Alert>
          ) : (
            <MethodPicker data={methods.data} error={methods.error} total={total} value={method} onChange={setChosen} />
          )}
          {payError && <Alert tone="danger">{payError}</Alert>}
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={pay} loading={paying} disabled={!quote || (!free && !method)}>
              <Lock className="h-4 w-4" aria-hidden="true" />
              {free ? "Confirm enrollment" : method === "bank_transfer" ? "Continue to bank transfer" : "Continue to payment"}
            </Button>
            <p className="text-xs text-muted">
              Your enrollment starts once the payment provider confirms the payment to us directly. Prices are in Nepali rupees.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card className="h-fit">
        <CardBody className="flex flex-col gap-4">
          <h2 className="font-semibold text-navy">Order summary</h2>
          {quote ? <OrderSummary items={quote.items} totals={quote} /> : <Skeleton className="h-28 w-full" />}
          {coupon ? (
            <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success-50 px-3 py-2 text-sm text-success">
              <span className="flex items-center gap-2">
                <Tag className="h-4 w-4" aria-hidden="true" />
                {coupon} applied
              </span>
              <Button variant="ghost" size="sm" onClick={() => applyCoupon("")} disabled={applying || paying} aria-label="Remove coupon">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (couponInput.trim()) void applyCoupon(couponInput.trim());
              }}
            >
              <Field label="Coupon code" htmlFor="coupon" error={couponError ?? undefined} className="flex-1">
                <Input value={couponInput} onChange={(e) => setCouponInput(e.target.value)} autoComplete="off" maxLength={40} />
              </Field>
              <Button type="submit" variant="outline" loading={applying} disabled={!quote || !couponInput.trim()}>
                Apply
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
