import { Award, BookOpen, MailWarning } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Alert, EmptyState, PageHeader } from "@/components/ui/feedback";
import { AttemptHistory } from "@/components/exams/attempt-history";
import { ExamCard } from "@/components/exams/exam-card";
import { EnrolledCourseCard } from "@/components/learning/enrolled-course-card";
import { SessionCard } from "@/components/live-classes/session-card";
import { serverGet, serverGetOrNull } from "@/lib/api/server";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { HistoryItem, LearnerExam } from "@/types/assessments";
import type { MyCertificate } from "@/types/certificates";
import type { MyEnrollment } from "@/types/learning";
import type { LearnerSession } from "@/types/live-classes";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const [user, { welcome }, enrollments, exams, attempts, classes, certificates] = await Promise.all([
    requireUser("/dashboard"),
    searchParams,
    serverGet<Paginated<MyEnrollment>>("/me/enrollments/", { page_size: 6 }),
    serverGet<Paginated<LearnerExam>>("/exams/", { page_size: 50 }),
    serverGet<Paginated<HistoryItem>>("/me/exam-attempts/", { page_size: 3 }),
    serverGet<Paginated<LearnerSession>>("/me/class-sessions/", { scope: "upcoming", page_size: 3 }),
    serverGetOrNull<MyCertificate[]>("/me/certificates/"),
  ]);
  const recentCertificates = (certificates ?? []).filter((c) => c.status === "valid").slice(0, 3);
  const upcomingExams = exams.results.filter((e) => e.availability === "in_progress" || e.availability === "available" || e.availability === "not_open").slice(0, 3);
  const inProgress = enrollments.results.filter((e) => !e.completed_at);
  const resume = inProgress.find((e) => e.last_accessed_at) ?? inProgress[0];
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
      {enrollments.count === 0 ? (
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
      ) : (
        <div className="flex flex-col gap-8">
          {resume && (
            <section aria-labelledby="continue">
              <h2 id="continue" className="mb-3 text-lg font-semibold">
                Continue learning
              </h2>
              <EnrolledCourseCard enrollment={resume} featured />
            </section>
          )}
          <section aria-labelledby="my-courses">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="my-courses" className="text-lg font-semibold">
                My courses
              </h2>
              {enrollments.count > enrollments.results.length && (
                <Link href="/dashboard/courses" className="text-sm font-medium text-teal-700 hover:underline">
                  View all {enrollments.count}
                </Link>
              )}
            </div>
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {enrollments.results.map((enrollment) => (
                <li key={enrollment.id}>
                  <EnrolledCourseCard enrollment={enrollment} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      {(classes.results.length > 0 || upcomingExams.length > 0 || attempts.results.length > 0 || recentCertificates.length > 0) && (
        <div className="mt-8 flex flex-col gap-8">
          {classes.results.length > 0 && (
            <section aria-labelledby="upcoming-classes">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="upcoming-classes" className="text-lg font-semibold">
                  Upcoming live classes
                </h2>
                <Link href="/dashboard/classes" className="text-sm font-medium text-teal-700 hover:underline">
                  All classes
                </Link>
              </div>
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {classes.results.map((session) => (
                  <li key={session.id}>
                    <SessionCard session={session} compact />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {upcomingExams.length > 0 && (
            <section aria-labelledby="upcoming-exams">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="upcoming-exams" className="text-lg font-semibold">
                  Upcoming exams
                </h2>
                <Link href="/dashboard/exams" className="text-sm font-medium text-teal-700 hover:underline">
                  All exams
                </Link>
              </div>
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {upcomingExams.map((exam) => (
                  <li key={exam.id}>
                    <ExamCard exam={exam} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {attempts.results.length > 0 && (
            <section aria-labelledby="recent-results">
              <h2 id="recent-results" className="mb-3 text-lg font-semibold">
                Recent results
              </h2>
              <AttemptHistory items={attempts.results} chart={false} />
            </section>
          )}
          {recentCertificates.length > 0 && (
            <section aria-labelledby="my-certificates">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="my-certificates" className="text-lg font-semibold">
                  Certificates
                </h2>
                <Link href="/dashboard/certificates" className="text-sm font-medium text-teal-700 hover:underline">
                  All certificates
                </Link>
              </div>
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {recentCertificates.map((c) => (
                  <li key={c.number} className="flex items-center gap-3 rounded-lg border border-line bg-card p-4">
                    <Award className="h-6 w-6 shrink-0 text-teal-700" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-navy">{c.course_title}</p>
                      <p className="text-xs text-muted">Issued {formatDate(c.issued_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
