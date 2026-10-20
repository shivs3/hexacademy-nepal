import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { canOpenBank, hasAnyPerm, hasPerm } from "@/lib/permissions";

import { QuestionEditor } from "./question-editor";

export const metadata: Metadata = { title: "Question" };

type Props = { params: Promise<{ id: string }> };

export default async function QuestionPage({ params }: Props) {
  const user = await requireStaff();
  if (!canOpenBank(user)) redirect("/admin");
  const { id } = await params;
  if (id !== "new" && !/^\d+$/.test(id)) notFound();
  const manager = hasPerm(user, "assessments.manage_question_bank");
  if (id === "new" && !manager && !hasPerm(user, "assessments.author_course_assessments")) redirect("/admin/assessments/questions");
  // Whether this question may be edited comes from the API's `can_edit`; these only pick the widgets.
  return (
    <QuestionEditor
      questionId={id === "new" ? null : Number(id)}
      manager={manager}
      canPickMedia={hasAnyPerm(user, ["cms.manage_media", "cms.manage_pages", "cms.manage_blog", "cms.manage_site_settings"])}
      canUpload={hasPerm(user, "cms.manage_media")}
    />
  );
}
