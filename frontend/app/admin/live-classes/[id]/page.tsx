import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { BatchDetail } from "@/components/live-classes/admin/batch-detail";
import { requireStaff } from "@/lib/auth";
import { canOpenLiveClasses } from "@/lib/permissions";

export const metadata: Metadata = { title: "Batch" };

type Props = { params: Promise<{ id: string }> };

export default async function BatchPage({ params }: Props) {
  const user = await requireStaff();
  if (!canOpenLiveClasses(user)) redirect("/admin");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  // What may change comes from the API's `can_schedule`.
  return <BatchDetail batchId={Number(id)} />;
}
