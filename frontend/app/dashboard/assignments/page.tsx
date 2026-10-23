import type { Metadata } from "next";

import { MyAssignments } from "@/components/learning/assignments/my-assignments";
import { PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Assignments" };

export default function AssignmentsPage() {
  return (
    <>
      <PageHeader title="Assignments" description="Work set in your courses. Due times are Nepal time." />
      <MyAssignments />
    </>
  );
}
