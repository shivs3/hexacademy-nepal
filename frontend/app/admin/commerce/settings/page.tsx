import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PaymentSettingsForm } from "@/components/commerce/admin/payment-settings-form";
import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export const metadata: Metadata = { title: "Payment settings" };

export default async function PaymentSettingsPage() {
  const user = await requireStaff();
  if (!hasPerm(user, "commerce.manage_payment_settings")) redirect("/admin");
  return (
    <>
      <PageHeader
        title="Payment settings"
        description="Which payment methods learners see. Gateway credentials live in the server environment and are never shown here."
      />
      <PaymentSettingsForm />
    </>
  );
}
