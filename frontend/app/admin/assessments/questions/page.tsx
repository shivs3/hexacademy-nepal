import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { canOpenBank, hasPerm } from "@/lib/permissions";

import { QuestionsList } from "./questions-list";

export const metadata: Metadata = { title: "Question bank" };

export default async function QuestionBankPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const [user, { subject }] = await Promise.all([requireStaff(), searchParams]);
  if (!canOpenBank(user)) redirect("/admin");
  const manager = hasPerm(user, "assessments.manage_question_bank");
  const author = manager || hasPerm(user, "assessments.author_course_assessments");
  return (
    <>
      <PageHeader
        title="Question bank"
        description={
          manager
            ? "Every question in the bank. Answer keys stay on the server and are never sent to learners before results are released."
            : "Shared questions you can use in exams, and the questions of courses you teach."
        }
      />
      <QuestionsList manager={manager} canAuthor={author} initialSubject={subject && /^\d+$/.test(subject) ? subject : ""} />
    </>
  );
}
