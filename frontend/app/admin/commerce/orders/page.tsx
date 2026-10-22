import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OrdersList } from "@/components/commerce/admin/orders-list";
import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { canOpenOrders } from "@/lib/permissions";

export const metadata: Metadata = { title: "Orders" };

export default async function AdminOrdersPage() {
  const user = await requireStaff();
  if (!canOpenOrders(user)) redirect("/admin");
  return (
    <>
      <PageHeader title="Orders" description="Every checkout, with the payments the server verified. Amounts are in Nepali rupees." />
      <OrdersList />
    </>
  );
}
