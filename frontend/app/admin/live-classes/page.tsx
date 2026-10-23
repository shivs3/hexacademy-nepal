import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BatchesList } from "@/components/live-classes/admin/batches-list";
import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { canOpenLiveClasses, hasAnyPerm } from "@/lib/permissions";

export const metadata: Metadata = { title: "Live classes" };

export default async function LiveClassesPage() {
  const user = await requireStaff();
  if (!canOpenLiveClasses(user)) redirect("/admin");
  return (
    <>
      <PageHeader
        title="Live classes"
        description="Batches of learners and their Google Meet or Zoom classes. Learners get the meeting link only from their dashboard, when the class opens."
      />
      <BatchesList canCreate={hasAnyPerm(user, ["live_classes.manage_all_classes", "live_classes.teach_assigned_classes"])} />
    </>
  );
}
