import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

import { SubjectsManager } from "./subjects-manager";

export const metadata: Metadata = { title: "Subjects & topics" };

export default async function SubjectsPage() {
  const user = await requireStaff();
  if (!hasPerm(user, "assessments.manage_question_bank")) redirect("/admin");
  return (
    <>
      <PageHeader
        title="Subjects & topics"
        description="Organise the question bank. Results are broken down by topic, and imports match subjects and topics by name or address."
      />
      <SubjectsManager />
    </>
  );
}
