import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SandboxGateway } from "@/components/commerce/sandbox-gateway";
import { serverGetOrNull } from "@/lib/api/server";
import { requireUser } from "@/lib/auth";
import type { SandboxCharge } from "@/types/commerce";

export const metadata: Metadata = { title: "Test payment gateway", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ref: string }> };

/** Development-only stand-in for a real gateway. The API answers 404 when the sandbox is off. */
export default async function SandboxGatewayPage({ params }: Props) {
  const { ref } = await params;
  await requireUser(`/checkout/sandbox/${encodeURIComponent(ref)}`);
  const charge = await serverGetOrNull<SandboxCharge>(`/payments/sandbox/${encodeURIComponent(ref)}/`);
  if (!charge) notFound();
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6">
      <SandboxGateway charge={charge} />
    </div>
  );
}
