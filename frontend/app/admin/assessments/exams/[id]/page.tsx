import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { canOpenExams, hasPerm } from "@/lib/permissions";

import { ExamBuilder } from "./exam-builder";

export const metadata: Metadata = { title: "Exam" };

type Props = { params: Promise<{ id: string }> };

export default async function ExamPage({ params }: Props) {
  const user = await requireStaff();
  if (!canOpenExams(user)) redirect("/admin");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  // What may change comes from the API's `abilities`.
  return <ExamBuilder examId={Number(id)} manager={hasPerm(user, "assessments.manage_exams")} />;
}
