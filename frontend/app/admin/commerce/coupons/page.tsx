import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CouponsList } from "@/components/commerce/admin/coupons-list";
import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export const metadata: Metadata = { title: "Coupons" };

export default async function CouponsPage() {
  const user = await requireStaff();
  if (!hasPerm(user, "commerce.manage_coupons")) redirect("/admin");
  return (
    <>
      <PageHeader
        title="Coupons"
        description="Discount codes learners enter at checkout. The server checks every rule again when the order is placed."
      />
      <CouponsList />
    </>
  );
}
