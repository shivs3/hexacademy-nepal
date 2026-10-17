import type { Metadata } from "next";

import { Badge, PageHeader } from "@/components/ui/feedback";
import { Card, CardBody } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "Overview" };

const roleNames: Record<string, string> = {
  content_editor: "Content editor",
  instructor: "Instructor",
  teaching_assistant: "Teaching assistant",
  finance_manager: "Finance manager",
  support_staff: "Support staff",
  student: "Student",
};

export default async function AdminHome() {
  const user = await requireStaff();
  return (
    <>
      <PageHeader title="Staff dashboard" description="Tools available to you depend on your assigned roles." />
      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Signed in as {user.email} with roles:</span>
          {user.is_superuser && <Badge tone="navy">Super admin</Badge>}
          {user.roles
            .filter((r) => r !== "super_admin")
            .map((r) => (
              <Badge key={r} tone="teal">
                {roleNames[r] ?? r}
              </Badge>
            ))}
        </CardBody>
      </Card>
    </>
  );
}
