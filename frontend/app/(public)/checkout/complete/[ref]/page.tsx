import type { Metadata } from "next";

import { PaymentResult } from "@/components/commerce/payment-result";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Payment status", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ref: string }> };

export default async function PaymentCompletePage({ params }: Props) {
  const { ref } = await params;
  await requireUser(`/checkout/complete/${encodeURIComponent(ref)}`);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold text-navy">Payment status</h1>
      <PaymentResult reference={ref} />
    </div>
  );
}
