import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RichText } from "@/components/cms/rich-text";
import { StartExamButton } from "@/components/exams/start-exam-button";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge, PageHeader } from "@/components/ui/feedback";
import { serverGetOrNull } from "@/lib/api/server";
import { ATTEMPT_STATUS, AVAILABILITY_TEXT, EXAM_KIND_LABEL, attemptsLeftText, formatMarks } from "@/lib/assessments";
import { formatDateTime } from "@/lib/utils";
import type { LearnerExamDetail } from "@/types/assessments";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const exam = await serverGetOrNull<LearnerExamDetail>(`/exams/${(await params).slug}/`);
  return { title: exam?.title ?? "Exam" };
}

export default async function ExamDetailPage({ params }: Props) {
  const { slug } = await params;
  const exam = await serverGetOrNull<LearnerExamDetail>(`/exams/${slug}/`);
  if (!exam) notFound();

  const rules = [
    `${exam.duration_minutes} minutes from the moment you start. The timer keeps running if you close the page.`,
    `${exam.question_total} question${exam.question_total === 1 ? "" : "s"}, ${formatMarks(exam.total_marks)} marks in total${exam.pass_marks ? `; ${formatMarks(exam.pass_marks)} to pass` : ""}.`,
    exam.negative_marking ? "Wrong answers lose marks. Unanswered questions score zero." : "Wrong answers do not lose marks.",
    exam.allow_revisit ? "You can move between questions and change answers until you submit." : "Questions are answered in order. Once you move on you cannot go back.",
    "Answers save automatically. When time runs out, what you have saved is submitted for you.",
    exam.release_note || "Your result is shown as soon as you finish.",
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/exams" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All exams
      </Link>
      <PageHeader
        title={exam.title}
        description={exam.course ? exam.course.title : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={exam.kind === "formal" ? "navy" : "mint"}>{EXAM_KIND_LABEL[exam.kind]}</Badge>
            <Badge>{AVAILABILITY_TEXT[exam.availability]}</Badge>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Instructions</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              {exam.instructions && <RichText html={exam.instructions} />}
              <ul className="list-disc space-y-1 pl-5 text-sm text-body">
                {rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {exam.my_attempts.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Your attempts</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-line">
                {exam.my_attempts.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm">
                      <span className="font-medium text-navy">Attempt {a.number}</span>
                      <span className="block text-xs text-muted">{formatDateTime(a.started_at)}</span>
                    </span>
                    <span className="flex items-center gap-2 text-sm">
                      <Badge tone={ATTEMPT_STATUS[a.status].tone}>{ATTEMPT_STATUS[a.status].label}</Badge>
                      {a.score !== null && (
                        <span className="tabular-nums">
                          {formatMarks(a.score)} / {formatMarks(a.max_score)}
                        </span>
                      )}
                      {a.status === "in_progress" ? (
                        <Button asChild size="sm">
                          <Link href={`/exam/${a.id}`}>Resume</Link>
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/exams/results/${a.id}`}>{a.results_released ? "View result" : "Details"}</Link>
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card className="self-start">
          <CardBody className="flex flex-col gap-3">
            <p className="text-sm text-muted">{attemptsLeftText(exam.max_attempts, exam.attempts_used)}</p>
            {exam.opens_at && <p className="text-sm text-muted">Opens {formatDateTime(exam.opens_at)}</p>}
            {exam.closes_at && <p className="text-sm text-muted">Closes {formatDateTime(exam.closes_at)}</p>}
            {exam.availability === "available" || exam.availability === "in_progress" ? (
              <StartExamButton slug={exam.slug} resumeId={exam.open_attempt_id} />
            ) : exam.availability === "not_enrolled" && exam.course ? (
              <>
                <Alert tone="info">Enroll in the course to take this exam.</Alert>
                <Button asChild variant="outline">
                  <Link href={`/courses/${exam.course.slug}`}>View course</Link>
                </Button>
              </>
            ) : (
              <Alert tone="info">{AVAILABILITY_TEXT[exam.availability]}.</Alert>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
