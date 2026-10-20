import { ArrowLeft, Hourglass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AnswerReview } from "@/components/exams/results/answer-review";
import { RankingTable } from "@/components/exams/results/ranking-table";
import { ResultSummaryCards } from "@/components/exams/results/result-summary";
import { TopicBreakdown } from "@/components/exams/results/topic-breakdown";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { serverGetOrNull } from "@/lib/api/server";
import { ATTEMPT_STATUS } from "@/lib/assessments";
import { formatDateTime } from "@/lib/utils";
import type { AttemptResult } from "@/types/assessments";

export const metadata: Metadata = { title: "Exam result" };

type Props = { params: Promise<{ attemptId: string }> };

export default async function AttemptResultPage({ params }: Props) {
  const { attemptId } = await params;
  if (!/^\d+$/.test(attemptId)) notFound();
  const result = await serverGetOrNull<AttemptResult>(`/attempts/${attemptId}/result/`);
  if (!result) notFound();
  const { attempt, exam } = result;
  if (attempt.status === "in_progress") redirect(`/exam/${attempt.id}`);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/dashboard/exams/${exam.slug}`} className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to exam
      </Link>
      <PageHeader
        title={exam.title}
        description={`Attempt ${attempt.number} · ${ATTEMPT_STATUS[attempt.status].label}${attempt.ended_at ? ` ${formatDateTime(attempt.ended_at)}` : ""}`}
      />

      {!result.released || !result.summary ? (
        <EmptyState
          icon={Hourglass}
          title="Your answers are in"
          description={result.release_note || "Results for this exam have not been released yet."}
          action={
            <Button asChild variant="outline">
              <Link href="/dashboard/exams">All exams</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ResultSummaryCards summary={result.summary} />
          {result.topics.length > 0 && <TopicBreakdown topics={result.topics} />}
          {result.ranking && <RankingTable ranking={result.ranking} />}
          {result.review.length > 0 && <AnswerReview items={result.review} showAnswers={exam.show_answers} showExplanations={exam.show_explanations} />}
        </>
      )}
    </div>
  );
}
