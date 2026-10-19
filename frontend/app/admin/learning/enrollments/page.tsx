import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { canOpenEnrollments, hasPerm } from "@/lib/permissions";

import { EnrollmentsList } from "./enrollments-list";

export const metadata: Metadata = { title: "Enrollments" };

export default async function EnrollmentsPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const user = await requireStaff();
  if (!canOpenEnrollments(user)) redirect("/admin");
  const course = (await searchParams).course;
  const canManage = hasPerm(user, "learning.manage_enrollments");
  return (
    <>
      <PageHeader
        title="Enrollments"
        description={
          canManage
            ? "Who can open which course, and how far they have got. Grant access for offline payments or scholarships."
            : "Learners of the courses you teach and how far they have got."
        }
      />
      <EnrollmentsList canManage={canManage} initialCourse={course && /^\d+$/.test(course) ? course : ""} />
    </>
  );
}
