import { BookOpen, Clock } from "lucide-react";
import Link from "next/link";

import { MediaImage } from "@/components/cms/media-image";
import { Badge } from "@/components/ui/feedback";
import { formatMinutes } from "@/lib/catalog";
import { type CourseCard as CourseCardData, LEVEL_LABELS } from "@/types/catalog";

import { PriceTag } from "./price-tag";

export function CourseCard({ course, headingLevel = "h3" }: { course: CourseCardData; headingLevel?: "h2" | "h3" }) {
  const H = headingLevel;
  const duration = course.duration_text || formatMinutes(course.total_minutes);
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-white transition-shadow hover:shadow-md">
      {course.thumbnail ? (
        <div className="aspect-[16/9] overflow-hidden bg-page">
          <MediaImage image={course.thumbnail} alt="" className="h-full object-cover" sizes="(min-width: 1024px) 33vw, 100vw" />
        </div>
      ) : (
        <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-navy to-teal-700" aria-hidden="true">
          <BookOpen className="h-10 w-10 text-white/70" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          {course.category && <span className="text-xs font-semibold uppercase tracking-wide text-teal-700">{course.category.name}</span>}
          <Badge>{LEVEL_LABELS[course.level]}</Badge>
        </div>
        <H className="mt-2 text-lg font-semibold leading-snug">
          <Link href={`/courses/${course.slug}`} className="after:absolute after:inset-0 group-hover:text-teal-700">
            {course.title}
          </Link>
        </H>
        {course.subtitle && <p className="mt-2 line-clamp-2 text-sm text-muted">{course.subtitle}</p>}
        {course.instructors.length > 0 && <p className="mt-2 text-sm text-body">{course.instructors.join(", ")}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <p className="flex items-center gap-3 text-xs text-muted">
            <span>
              {course.lesson_count} {course.lesson_count === 1 ? "lesson" : "lessons"}
            </span>
            {duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {duration}
              </span>
            )}
          </p>
          <PriceTag pricing={course} />
        </div>
      </div>
    </article>
  );
}
