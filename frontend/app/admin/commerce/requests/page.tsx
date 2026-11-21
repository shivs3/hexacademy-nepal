import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccessRequestsList } from "@/components/commerce/admin/access-requests-list";
import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { canHandleAccessRequests, hasPerm } from "@/lib/permissions";

export const metadata: Metadata = { title: "Access requests" };

type Props = { searchParams: Promise<{ status?: string }> };

export default async function AdminAccessRequestsPage({ searchParams }: Props) {
  const user = await requireStaff();
  if (!canHandleAccessRequests(user)) redirect("/admin");
  const { status } = await searchParams;
  return (
    <>
      <PageHeader
        title="Access requests"
        description="Checkout requests for paid courses and exams. Confirm the payment, then approve to add the item to the learner's account."
      />
      <AccessRequestsList
        initialStatus={typeof status === "string" ? status : "pending"}
        canManageUsers={hasPerm(user, "learning.manage_enrollments")}
      />
    </>
  );
}
