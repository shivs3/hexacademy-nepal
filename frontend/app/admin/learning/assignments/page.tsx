import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AssignmentsList } from "@/components/learning/admin/assignments-list";
import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { canOpenAssignments, hasAnyPerm } from "@/lib/permissions";

export const metadata: Metadata = { title: "Assignments" };

export default async function AssignmentsPage() {
  const user = await requireStaff();
  if (!canOpenAssignments(user)) redirect("/admin");
  return (
    <>
      <PageHeader
        title="Assignments"
        description="Course work that learners hand in. Instructors and teaching assistants review and grade it; learners are notified of the result."
      />
      <AssignmentsList canCreate={hasAnyPerm(user, ["catalog.manage_catalog", "catalog.author_assigned_courses"])} />
    </>
  );
}
