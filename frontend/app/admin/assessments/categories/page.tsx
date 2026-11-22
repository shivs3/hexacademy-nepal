import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

import { ExamCategoriesManager } from "./exam-categories-manager";

export const metadata: Metadata = { title: "Exam categories" };

export default async function ExamCategoriesPage() {
  const user = await requireStaff();
  if (!hasPerm(user, "assessments.manage_exams")) redirect("/admin");
  return (
    <>
      <PageHeader
        title="Exam categories"
        description="Group exams on the public Exams page, for example Loksewa, entrance preparation or licence exams. Hidden categories also hide their exams from that page."
      />
      <ExamCategoriesManager />
    </>
  );
}
