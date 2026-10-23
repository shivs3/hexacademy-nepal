import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AssignmentView } from "@/components/learning/assignments/assignment-view";

export const metadata: Metadata = { title: "Assignment" };

type Props = { params: Promise<{ id: string }> };

export default async function AssignmentPage({ params }: Props) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <AssignmentView assignmentId={Number(id)} />;
}
