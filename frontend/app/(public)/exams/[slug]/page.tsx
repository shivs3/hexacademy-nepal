import { CalendarClock, Clock, ListChecks, Repeat, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { RichText } from "@/components/cms/rich-text";
import { ExamPrice } from "@/components/exams/public-exam-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { serverGetOrNull } from "@/lib/api/server";
import { EXAM_KIND_LABEL, formatMarks, publicExamAction } from "@/lib/assessments";
import { getCurrentUser } from "@/lib/auth";
import { buildMetadata, getSiteSettings } from "@/lib/cms";
import { formatDateTime } from "@/lib/utils";
import type { LearnerExam, PublicExamDetail } from "@/types/assessments";

type Props = { params: Promise<{ slug: string }> };

const getExam = cache((slug: string) => serverGetOrNull<PublicExamDetail>(`/exam-catalog/${encodeURIComponent(slug)}/`));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [settings, exam] = await Promise.all([getSiteSettings(), getExam(slug)]);
  if (!exam) return { title: "Exam not found", robots: { index: false } };
  return buildMetadata(settings, {
    title: exam.title,
    seo: { meta_description: exam.summary || `${EXAM_KIND_LABEL[exam.kind]}: ${exam.duration_minutes} minutes, ${exam.question_total} questions.` },
    path: `/exams/${exam.slug}`,
  });
}

export default async function PublicExamPage({ params }: Props) {
  const { slug } = await params;
  const [exam, user] = await Promise.all([getExam(slug), getCurrentUser()]);
  if (!exam) notFound();
  // The learner view answers 404 when the exam isn't offered to this user (a course exam they aren't enrolled in).
  const learner = user ? await serverGetOrNull<LearnerExam>(`/exams/${encodeURIComponent(exam.slug)}/`) : null;
  const action = publicExamAction(exam, Boolean(user), learner);

  const facts = [
    { icon: Clock, text: `${exam.duration_minutes} minutes` },
    { icon: ListChecks, text: `${exam.question_total} ${exam.question_total === 1 ? "question" : "questions"}, ${formatMarks(exam.total_marks)} marks` },
    ...(exam.pass_marks ? [{ icon: Target, text: `${formatMarks(exam.pass_marks)} marks to pass` }] : []),
    { icon: Repeat, text: exam.max_attempts ? `${exam.max_attempts} ${exam.max_attempts === 1 ? "attempt" : "attempts"}` : "Unlimited attempts" },
  ];
  const rules = [
    exam.negative_marking ? "Wrong answers lose marks. Unanswered questions score zero." : "Wrong answers do not lose marks.",
    exam.allow_revisit ? "You can move between questions and change answers until you submit." : "Questions are answered in order. Once you move on you cannot go back.",
    "The timer starts when you begin and keeps running if you close the page. Answers save automatically.",
    `Results: ${exam.result_release_label.toLowerCase()}.`,
  ];

  return (
    <article className="pb-20">
      <header className="bg-navy text-white">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_340px]">
          <div>
            <nav aria-label="Breadcrumb" className="text-sm text-white/70">
              <Link href="/exams" className="hover:text-white hover:underline">
                Exams
              </Link>
              {exam.category?.parent && (
                <>
                  {" / "}
                  <Link href={`/exams?category=${encodeURIComponent(exam.category.parent.slug)}`} className="hover:text-white hover:underline">
                    {exam.category.parent.name}
                  </Link>
                </>
              )}
              {exam.category && (
                <>
                  {" / "}
                  <Link href={`/exams?category=${encodeURIComponent(exam.category.slug)}`} className="hover:text-white hover:underline">
                    {exam.category.name}
                  </Link>
                </>
              )}
            </nav>
            <div className="mt-4">
              <Badge tone={exam.kind === "formal" ? "navy" : "mint"} className="bg-white/10 text-white">
                {EXAM_KIND_LABEL[exam.kind]}
              </Badge>
            </div>
            <h1 className="mt-3 text-4xl font-bold leading-tight text-white sm:text-5xl">{exam.title}</h1>
            {exam.summary && <p className="mt-4 text-lg text-white/80">{exam.summary}</p>}
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80">
              {facts.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>
            {exam.course && (
              <p className="mt-4 text-sm text-white/80">
                Part of{" "}
                <Link href={`/courses/${encodeURIComponent(exam.course.slug)}`} className="font-medium text-white underline-offset-2 hover:underline">
                  {exam.course.title}
                </Link>
              </p>
            )}
          </div>

          <aside className="self-start rounded-[var(--radius-card)] bg-white p-6 text-body shadow-lg">
            <ExamPrice exam={exam} size="lg" />
            {(exam.opens_at || exam.closes_at) && (
              <ul className="mt-3 space-y-1 text-sm text-muted">
                {exam.opens_at && (
                  <li className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" aria-hidden="true" />
                    Opens {formatDateTime(exam.opens_at)}
                  </li>
                )}
                {exam.closes_at && (
                  <li className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" aria-hidden="true" />
                    Closes {formatDateTime(exam.closes_at)}
                  </li>
                )}
              </ul>
            )}
            <Button asChild className="mt-5 w-full">
              <Link href={action.href}>{action.label}</Link>
            </Button>
            {action.note && <p className="mt-3 text-sm text-muted">{action.note}</p>}
            {action.secondary && (
              <p className="mt-2 text-sm">
                <Link href={action.secondary.href} className="text-teal-700 hover:underline">
                  Or get it with the course: {action.secondary.label}
                </Link>
              </p>
            )}
          </aside>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-12 sm:px-6 lg:grid-cols-[1fr_340px]">
        <section aria-labelledby="exam-rules">
          <h2 id="exam-rules" className="text-2xl font-semibold">
            Before you start
          </h2>
          {exam.instructions && <RichText html={exam.instructions} className="mt-4" />}
          <ul className="mt-4 list-disc space-y-2 pl-5 text-body">
            {rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}
