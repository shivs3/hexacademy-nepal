import { BookOpen, MailWarning } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const [user, { welcome }] = await Promise.all([requireUser("/dashboard"), searchParams]);
  const firstName = user.full_name.split(" ")[0] || "there";

  return (
    <>
      <PageHeader title={welcome ? `Welcome, ${firstName}!` : `Hello, ${firstName}`} description="Your learning at a glance." />
      {!user.email_verified && (
        <Alert tone="warning" title="Verify your email address" className="mb-6">
          We sent a verification link to <strong>{user.email}</strong>. Verifying lets you receive class reminders and
          certificates.{" "}
          <Link href="/dashboard/profile" className="font-medium underline">
            Resend the link
          </Link>
        </Alert>
      )}
      <EmptyState
        icon={user.email_verified ? BookOpen : MailWarning}
        title="You are not enrolled in any courses yet"
        description="Once you enroll, your courses, live classes and exams will appear here."
        action={
          <Button asChild variant="outline">
            <Link href="/courses">Browse courses</Link>
          </Button>
        }
      />
    </>
  );
}
