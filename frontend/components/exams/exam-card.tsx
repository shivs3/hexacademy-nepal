import { CalendarClock, Clock, ListChecks } from "lucide-react";
import Link from "next/link";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { AVAILABILITY_TEXT, EXAM_KIND_LABEL, attemptsLeftText, formatMarks } from "@/lib/assessments";
import { formatDateTime } from "@/lib/utils";
import type { Availability, LearnerExam } from "@/types/assessments";

const TONE: Record<Availability, "success" | "teal" | "neutral" | "warning"> = {
  available: "success",
  in_progress: "teal",
  not_open: "neutral",
  closed: "neutral",
  not_enrolled: "warning",
  no_attempts_left: "neutral",
};

export function ExamCard({ exam }: { exam: LearnerExam }) {
  return (
    <Card className="relative h-full transition-shadow hover:shadow-md">
      <CardBody className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={exam.kind === "formal" ? "navy" : "mint"}>{EXAM_KIND_LABEL[exam.kind]}</Badge>
          <Badge tone={TONE[exam.availability]}>{AVAILABILITY_TEXT[exam.availability]}</Badge>
        </div>
        <div>
          <h3 className="text-base font-semibold text-navy">
            <Link href={`/dashboard/exams/${exam.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {exam.title}
            </Link>
          </h3>
          {exam.course && <p className="text-sm text-muted">{exam.course.title}</p>}
        </div>
        <ul className="mt-auto flex flex-col gap-1 text-sm text-muted">
          <li className="flex items-center gap-2">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {exam.duration_minutes} min · {exam.question_total} questions · {formatMarks(exam.total_marks)} marks
          </li>
          <li className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" aria-hidden="true" />
            {attemptsLeftText(exam.max_attempts, exam.attempts_used)}
          </li>
          {(exam.opens_at || exam.closes_at) && (
            <li className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              {exam.availability === "not_open" && exam.opens_at ? `Opens ${formatDateTime(exam.opens_at)}` : exam.closes_at ? `Closes ${formatDateTime(exam.closes_at)}` : ""}
            </li>
          )}
        </ul>
      </CardBody>
    </Card>
  );
}
