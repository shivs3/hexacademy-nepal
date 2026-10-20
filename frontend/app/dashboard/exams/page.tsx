import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ExamCard } from "@/components/exams/exam-card";
import { AttemptHistory } from "@/components/exams/attempt-history";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { serverGet } from "@/lib/api/server";
import type { Paginated } from "@/types/accounts";
import type { HistoryItem, LearnerExam } from "@/types/assessments";

export const metadata: Metadata = { title: "Exams" };

export default async function MyExamsPage() {
  const [exams, history] = await Promise.all([
    serverGet<Paginated<LearnerExam>>("/exams/", { page_size: 50 }),
    serverGet<Paginated<HistoryItem>>("/me/exam-attempts/", { page_size: 30 }),
  ]);
  const open = exams.results.filter((e) => e.availability === "available" || e.availability === "in_progress" || e.availability === "not_open");
  const other = exams.results.filter((e) => !open.includes(e));

  return (
    <>
      <PageHeader title="Exams" description="Practice tests and exams for your courses. The timer runs on our server, so your answers are saved as you go." />
      {exams.count === 0 && history.count === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No exams for you yet"
          description="Exams appear here when a course you are enrolled in publishes one."
          action={
            <Button asChild variant="outline">
              <Link href="/dashboard/courses">My courses</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-10">
          {open.length > 0 && (
            <section aria-labelledby="open-exams">
              <h2 id="open-exams" className="mb-3 text-lg font-semibold">
                Open and upcoming
              </h2>
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {open.map((exam) => (
                  <li key={exam.id}>
                    <ExamCard exam={exam} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {history.results.length > 0 && (
            <section aria-labelledby="history">
              <h2 id="history" className="mb-3 text-lg font-semibold">
                Your attempts
              </h2>
              <AttemptHistory items={history.results} />
            </section>
          )}
          {other.length > 0 && (
            <section aria-labelledby="other-exams">
              <h2 id="other-exams" className="mb-3 text-lg font-semibold">
                Other exams
              </h2>
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {other.map((exam) => (
                  <li key={exam.id}>
                    <ExamCard exam={exam} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
