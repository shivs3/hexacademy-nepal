import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RevenueReportView } from "@/components/commerce/admin/revenue-report";
import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export const metadata: Metadata = { title: "Revenue" };

export default async function RevenuePage() {
  const user = await requireStaff();
  if (!hasPerm(user, "commerce.view_revenue")) redirect("/admin");
  return (
    <>
      <PageHeader
        title="Revenue"
        description="Verified payments only, by the Nepal calendar day they were confirmed. Refunds count on the day they were recorded."
      />
      <RevenueReportView />
    </>
  );
}
