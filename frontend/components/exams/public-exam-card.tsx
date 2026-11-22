import { Clock, ListChecks } from "lucide-react";
import Link from "next/link";

import { PriceTag } from "@/components/courses/price-tag";
import { Badge } from "@/components/ui/feedback";
import { EXAM_KIND_LABEL, formatMarks } from "@/lib/assessments";
import type { PublicExam } from "@/types/assessments";

/** The exam's price: the offer price with the actual price struck through while an offer runs. */
export function ExamPrice({ exam, size = "md", className }: { exam: PublicExam; size?: "md" | "lg"; className?: string }) {
  if (exam.offer === "course") return <span className={`text-sm font-medium text-muted ${className ?? ""}`}>Included with the course</span>;
  return <PriceTag pricing={{ ...exam, currency: "NPR" }} size={size} className={className} />;
}

export function PublicExamCard({ exam, headingLevel = "h3" }: { exam: PublicExam; headingLevel?: "h2" | "h3" }) {
  const H = headingLevel;
  return (
    <article className="group relative flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-white p-5 transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        {exam.category && <span className="text-xs font-semibold uppercase tracking-wide text-teal-700">{exam.category.parent ? `${exam.category.parent.name} › ${exam.category.name}` : exam.category.name}</span>}
        <Badge tone={exam.kind === "formal" ? "navy" : "mint"}>{EXAM_KIND_LABEL[exam.kind]}</Badge>
      </div>
      <H className="mt-2 text-lg font-semibold leading-snug">
        <Link href={`/exams/${encodeURIComponent(exam.slug)}`} className="after:absolute after:inset-0 group-hover:text-teal-700">
          {exam.title}
        </Link>
      </H>
      {exam.summary && <p className="mt-2 line-clamp-3 text-sm text-muted">{exam.summary}</p>}
      {exam.course && <p className="mt-2 text-sm text-body">Part of {exam.course.title}</p>}
      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <p className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {exam.duration_minutes} min
          </span>
          <span className="flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            {exam.question_total} {exam.question_total === 1 ? "question" : "questions"} · {formatMarks(exam.total_marks)} marks
          </span>
        </p>
        <ExamPrice exam={exam} />
      </div>
    </article>
  );
}
