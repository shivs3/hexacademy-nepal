import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/feedback";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

import { UserDirectory } from "./user-directory";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const user = await requireStaff();
  if (!hasPerm(user, "accounts.view_user_directory")) redirect("/admin");
  return (
    <>
      <PageHeader title="Users" description="Search accounts, manage access and assign staff roles." />
      <UserDirectory
        currentUserId={user.id}
        canManageStatus={hasPerm(user, "accounts.manage_user_status")}
        canAssignRoles={hasPerm(user, "accounts.assign_roles")}
      />
    </>
  );
}
