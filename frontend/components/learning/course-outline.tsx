import { CheckCircle2, Circle, Lock, PlayCircle } from "lucide-react";
import Link from "next/link";

import { lessonPath } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import type { PlayerOutline } from "@/types/learning";

/** Player sidebar: modules and lessons with completion and lock state from the server. */
export function CourseOutline({ outline, currentLessonId }: { outline: PlayerOutline; currentLessonId: number }) {
  const { course, progress } = outline;
  return (
    <div className="flex flex-col">
      <div className="border-b border-line p-4">
        <Link href={`/courses/${course.slug}`} className="font-semibold text-navy hover:text-teal-700 hover:underline">
          {course.title}
        </Link>
        {progress && (
          <div className="mt-3">
            <div
              className="h-2 overflow-hidden rounded-full bg-page"
              role="progressbar"
              aria-label="Course progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
            >
              <div className="h-full rounded-full bg-mint transition-[width]" style={{ width: `${progress.percent}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {progress.completed_lessons} of {progress.total_lessons} lessons completed
            </p>
          </div>
        )}
        {outline.staff_preview && <p className="mt-2 text-xs font-medium text-warning">Staff preview: progress is not recorded.</p>}
      </div>
      <ol className="flex flex-col">
        {outline.modules.map((module, index) => (
          <li key={module.id} className="border-b border-line">
            <p className="bg-page px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Module {index + 1} · {module.title}
            </p>
            <ul>
              {module.lessons.map((lesson) => {
                const current = lesson.id === currentLessonId;
                const Icon = lesson.locked ? Lock : lesson.completed ? CheckCircle2 : current ? PlayCircle : Circle;
                const label = (
                  <>
                    <Icon
                      className={cn("mt-0.5 h-4 w-4 shrink-0", lesson.completed ? "text-success" : "text-muted")}
                      aria-hidden="true"
                    />
                    <span className="flex-1">
                      {lesson.title}
                      {!lesson.is_published && <span className="ml-1 text-xs text-warning">(unpublished)</span>}
                      <span className="sr-only">
                        {lesson.completed ? " (completed)" : ""}
                        {lesson.locked ? " (locked)" : ""}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={lesson.id}>
                    {lesson.locked ? (
                      <span className="flex gap-3 px-4 py-2.5 text-sm text-muted" title="Complete the previous lessons first">
                        {label}
                      </span>
                    ) : (
                      <Link
                        href={lessonPath(course.slug, lesson.id)}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "flex gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-teal-50",
                          current ? "bg-teal-50 font-medium text-navy" : "text-body",
                        )}
                      >
                        {label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
