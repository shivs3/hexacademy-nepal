import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth";

import { ChangePasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";
import { VerificationCard } from "./verification-card";

export const metadata: Metadata = { title: "Profile & security" };

export default async function ProfilePage() {
  const user = await requireUser("/dashboard/profile");
  return (
    <>
      <PageHeader title="Profile & security" description="Manage your personal details and password." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ProfileForm user={user} />
        <div className="flex flex-col gap-6">
          <VerificationCard email={user.email} verified={user.email_verified} />
          <ChangePasswordForm />
        </div>
      </div>
    </>
  );
}
