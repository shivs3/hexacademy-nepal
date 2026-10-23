import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { SessionDetail } from "@/components/live-classes/admin/session-detail";
import { requireStaff } from "@/lib/auth";
import { canOpenLiveClasses } from "@/lib/permissions";

export const metadata: Metadata = { title: "Class" };

type Props = { params: Promise<{ id: string }> };

export default async function ClassSessionPage({ params }: Props) {
  const user = await requireStaff();
  if (!canOpenLiveClasses(user)) redirect("/admin");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  // What may change comes from the API's `can_schedule` / `can_take_attendance`.
  return <SessionDetail sessionId={Number(id)} />;
}
