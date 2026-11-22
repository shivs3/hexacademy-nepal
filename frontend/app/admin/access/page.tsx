import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AssignAccess } from "@/components/commerce/admin/assign-access";
import { PageHeader } from "@/components/ui/feedback";
import { serverGetOrNull } from "@/lib/api/server";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import type { UserAccess } from "@/types/access";

export const metadata: Metadata = { title: "Assign access" };

type Props = { searchParams: Promise<{ user?: string }> };

export default async function AssignAccessPage({ searchParams }: Props) {
  const staff = await requireStaff();
  if (!hasPerm(staff, "learning.manage_enrollments")) redirect("/admin");
  // Opened from a person's access page: start with them chosen.
  const id = Number.parseInt((await searchParams).user ?? "", 10);
  const access = Number.isFinite(id) && id > 0 ? await serverGetOrNull<UserAccess>(`/admin/users/${id}/access/`) : null;
  const person = access?.user.is_active ? { id: access.user.id, full_name: access.user.full_name, email: access.user.email } : null;
  return (
    <>
      <PageHeader
        title="Assign access"
        description="Give people courses and exams directly, without a payment or request. Choose one or more people, tick what they should get, and assign it in one step."
      />
      <AssignAccess initialPerson={person} />
    </>
  );
}
