import { BookOpen, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { MediaImage } from "@/components/cms/media-image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { lessonPath } from "@/lib/catalog";
import { cn, formatDate } from "@/lib/utils";
import type { MyEnrollment } from "@/types/learning";

export function EnrolledCourseCard({ enrollment, featured = false }: { enrollment: MyEnrollment; featured?: boolean }) {
  const { course, progress } = enrollment;
  const resumeId = progress.next_lesson_id ?? enrollment.last_lesson_id;
  const href = resumeId ? lessonPath(course.slug, resumeId) : `/learn/${encodeURIComponent(course.slug)}`;
  const done = Boolean(enrollment.completed_at);
  const started = progress.completed_lessons > 0 || Boolean(enrollment.last_accessed_at);

  return (
    <article
      className={cn(
        "flex h-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-white",
        featured ? "flex-col sm:flex-row" : "flex-col",
      )}
    >
      <div className={cn("bg-page", featured ? "aspect-[16/9] sm:aspect-auto sm:w-64 sm:shrink-0" : "aspect-[16/9]")}>
        {course.thumbnail ? (
          <MediaImage image={course.thumbnail} alt="" className="h-full object-cover" sizes="(min-width: 768px) 33vw, 100vw" />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-navy to-teal-700" aria-hidden="true">
            <BookOpen className="h-8 w-8 text-white/70" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          {course.status === "archived" && <Badge className="mb-2">Archived course</Badge>}
          <h3 className="font-semibold leading-snug text-navy">{course.title}</h3>
          {featured && course.subtitle && <p className="mt-1 text-sm text-muted">{course.subtitle}</p>}
        </div>
        <div>
          <div
            className="h-2 overflow-hidden rounded-full bg-page"
            role="progressbar"
            aria-label={`${course.title} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <div className="h-full rounded-full bg-mint" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
            {done ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                Completed {formatDate(enrollment.completed_at!)}
              </>
            ) : (
              `${progress.completed_lessons} of ${progress.total_lessons} lessons · ${progress.percent}%`
            )}
          </p>
        </div>
        <div className="mt-auto">
          <Button asChild size="sm" variant={featured ? "primary" : "outline"}>
            <Link href={href}>{done ? "Review course" : started ? "Continue" : "Start course"}</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
