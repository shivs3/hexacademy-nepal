import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { canOpenExams, hasAnyPerm, hasPerm } from "@/lib/permissions";

import { ExamsList } from "./exams-list";

export const metadata: Metadata = { title: "Exams" };

export default async function ExamsPage() {
  const user = await requireStaff();
  if (!canOpenExams(user)) redirect("/admin");
  const manager = hasPerm(user, "assessments.manage_exams");
  return (
    <>
      <PageHeader
        title="Exams"
        description={
          manager
            ? "Practice tests and formal exams. Timing, grading and results are controlled by the server."
            : "Exams of the courses you teach."
        }
      />
      <ExamsList manager={manager} canCreate={hasAnyPerm(user, ["assessments.manage_exams", "assessments.author_course_assessments"])} />
    </>
  );
}
