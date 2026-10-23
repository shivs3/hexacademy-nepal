import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AssignmentDetail } from "@/components/learning/admin/assignment-detail";
import { requireStaff } from "@/lib/auth";
import { canOpenAssignments } from "@/lib/permissions";

export const metadata: Metadata = { title: "Assignment" };

type Props = { params: Promise<{ id: string }> };

export default async function AssignmentPage({ params }: Props) {
  const user = await requireStaff();
  if (!canOpenAssignments(user)) redirect("/admin");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  // Edit and grade controls follow the API's `can_edit` / `can_grade`.
  return <AssignmentDetail assignmentId={Number(id)} />;
}
