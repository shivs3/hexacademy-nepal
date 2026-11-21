import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { UserAccessManager } from "@/components/commerce/admin/user-access-manager";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export const metadata: Metadata = { title: "User access" };

type Props = { params: Promise<{ id: string }> };

export default async function UserAccessPage({ params }: Props) {
  const user = await requireStaff();
  if (!hasPerm(user, "learning.manage_enrollments")) redirect("/admin");
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id) || id <= 0) notFound();
  return (
    <UserAccessManager
      userId={id}
      canManageBatches={hasPerm(user, "live_classes.manage_all_classes")}
      canSeeDirectory={hasPerm(user, "accounts.view_user_directory")}
    />
  );
}
