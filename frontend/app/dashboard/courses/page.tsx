import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EnrolledCourseCard } from "@/components/learning/enrolled-course-card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { serverGet } from "@/lib/api/server";
import type { Paginated } from "@/types/accounts";
import type { MyEnrollment } from "@/types/learning";

export const metadata: Metadata = { title: "My courses" };

const PAGE_SIZE = 12;

export default async function MyCoursesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const raw = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Number.isFinite(raw) && raw > 0 ? raw : 1;
  const enrollments = await serverGet<Paginated<MyEnrollment>>("/me/enrollments/", { page, page_size: PAGE_SIZE }).catch(
    (err: { status?: number }) => {
      if (err.status === 404) return null; // beyond the last page
      throw err;
    },
  );

  return (
    <>
      <PageHeader title="My courses" description="Courses you are enrolled in, most recently studied first." />
      {!enrollments || enrollments.results.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={page > 1 ? "No more courses" : "You are not enrolled in any courses yet"}
          description="Browse the catalog to find a course."
          action={
            <Button asChild variant="outline">
              <Link href={page > 1 ? "/dashboard/courses" : "/courses"}>{page > 1 ? "Back to first page" : "Browse courses"}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {enrollments.results.map((enrollment) => (
              <li key={enrollment.id}>
                <EnrolledCourseCard enrollment={enrollment} />
              </li>
            ))}
          </ul>
          {enrollments.total_pages > 1 && (
            <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-4 text-sm">
              {page > 1 ? (
                <Link href={`/dashboard/courses?page=${page - 1}`} className="font-medium text-teal-700 hover:underline">
                  ← Previous
                </Link>
              ) : (
                <span className="text-muted/50">← Previous</span>
              )}
              <span className="text-muted">
                Page {enrollments.page} of {enrollments.total_pages}
              </span>
              {enrollments.next ? (
                <Link href={`/dashboard/courses?page=${page + 1}`} className="font-medium text-teal-700 hover:underline">
                  Next →
                </Link>
              ) : (
                <span className="text-muted/50">Next →</span>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
