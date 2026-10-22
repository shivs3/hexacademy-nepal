import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderDetail } from "@/components/commerce/order-detail";
import { serverGetOrNull } from "@/lib/api/server";
import type { MyOrder } from "@/types/commerce";

type Props = { params: Promise<{ number: string }>; searchParams: Promise<{ new?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Order ${(await params).number}` };
}

export default async function MyOrderPage({ params, searchParams }: Props) {
  const [{ number }, { new: fresh }] = await Promise.all([params, searchParams]);
  const order = await serverGetOrNull<MyOrder>(`/me/orders/${encodeURIComponent(number)}/`);
  if (!order) notFound();
  return <OrderDetail initial={order} justCreated={fresh === "1"} />;
}
