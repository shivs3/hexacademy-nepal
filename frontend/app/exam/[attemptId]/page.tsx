import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ExamPlayer } from "@/components/exams/player/exam-player";
import { serverGetOrNull } from "@/lib/api/server";
import { requireUser } from "@/lib/auth";
import type { Attempt } from "@/types/assessments";

export const metadata: Metadata = { title: "Exam in progress" };

type Props = { params: Promise<{ attemptId: string }> };

export default async function ExamAttemptPage({ params }: Props) {
  const { attemptId } = await params;
  await requireUser(`/exam/${attemptId}`);
  if (!/^\d+$/.test(attemptId)) notFound();
  // The API only returns the signed-in learner's own attempts.
  const attempt = await serverGetOrNull<Attempt>(`/attempts/${attemptId}/`);
  if (!attempt) notFound();
  if (attempt.status !== "in_progress" || attempt.questions.length === 0) redirect(`/dashboard/exams/results/${attempt.id}`);
  return <ExamPlayer initial={attempt} />;
}
