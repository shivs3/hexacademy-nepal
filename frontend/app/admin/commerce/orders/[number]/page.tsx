import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AdminOrderView } from "@/components/commerce/admin/order-view";
import { serverGetOrNull } from "@/lib/api/server";
import { requireStaff } from "@/lib/auth";
import { canOpenOrders, hasPerm } from "@/lib/permissions";
import type { AdminOrderDetail } from "@/types/commerce";

type Props = { params: Promise<{ number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Order ${(await params).number}` };
}

export default async function AdminOrderPage({ params }: Props) {
  const user = await requireStaff();
  if (!canOpenOrders(user)) redirect("/admin");
  const { number } = await params;
  const order = await serverGetOrNull<AdminOrderDetail>(`/admin/commerce/orders/${encodeURIComponent(number)}/`);
  if (!order) notFound();
  return (
    <AdminOrderView
      initial={order}
      canManage={hasPerm(user, "commerce.manage_orders")}
      canRefund={hasPerm(user, "commerce.manage_refunds")}
    />
  );
}
