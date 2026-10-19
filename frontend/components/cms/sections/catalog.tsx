import Link from "next/link";

import { CourseCard } from "@/components/courses/course-card";
import type { CourseCard as CourseCardData } from "@/types/catalog";
import type { SectionDataMap } from "@/types/cms";

import { CtaButton, type HeadingLevel, SectionContainer, SectionHeading } from "./shared";

/** Sections whose data the backend resolves from the catalog; drafts never reach these props. */

function CourseGrid({ courses }: { courses: CourseCardData[] }) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => (
        <li key={course.id}>
          <CourseCard course={course} />
        </li>
      ))}
    </ul>
  );
}

function CourseListSection({
  data,
  level,
  heading,
}: {
  data: SectionDataMap["course_collection"];
  level: HeadingLevel;
  heading?: string;
}) {
  // An empty course list renders nothing rather than an empty band on a public page.
  if (data.courses.length === 0) return null;
  return (
    <SectionContainer>
      <SectionHeading heading={heading ?? data.heading} intro={data.intro} level={level} />
      <CourseGrid courses={data.courses} />
      {data.cta_label && data.cta_url && (
        <div className="mt-10 text-center">
          <CtaButton label={data.cta_label} url={data.cta_url} variant="outline" />
        </div>
      )}
    </SectionContainer>
  );
}

export function FeaturedCoursesSection({ data, level = "h2" }: { data: SectionDataMap["featured_courses"]; level?: HeadingLevel }) {
  return <CourseListSection data={data} level={level} heading={data.heading || data.category?.name} />;
}

export function CourseCollectionSection({ data, level = "h2" }: { data: SectionDataMap["course_collection"]; level?: HeadingLevel }) {
  return <CourseListSection data={data} level={level} />;
}

export function CourseCategoriesSection({ data, level = "h2" }: { data: SectionDataMap["course_categories"]; level?: HeadingLevel }) {
  if (data.categories.length === 0) return null;
  return (
    <SectionContainer tone="white">
      <SectionHeading heading={data.heading} intro={data.intro} level={level} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.categories.map((category) => (
          <li key={category.slug}>
            <Link
              href={`/courses?category=${encodeURIComponent(category.slug)}`}
              className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-page p-5 transition-colors hover:border-teal/40 hover:bg-teal-50"
            >
              <span className="font-semibold text-navy">{category.name}</span>
              {category.description && <span className="mt-1 line-clamp-2 text-sm text-muted">{category.description}</span>}
              {data.show_counts && (
                <span className="mt-auto pt-3 text-xs font-medium text-teal-700">
                  {category.course_count} {category.course_count === 1 ? "course" : "courses"}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </SectionContainer>
  );
}

export function InstructorsSection({ data, level = "h2" }: { data: SectionDataMap["instructors"]; level?: HeadingLevel }) {
  if (data.instructors.length === 0) return null;
  return (
    <SectionContainer>
      <SectionHeading heading={data.heading} intro={data.intro} level={level} />
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {data.instructors.map((person) => (
          <li key={person.id} className="flex flex-col items-center rounded-[var(--radius-card)] border border-line bg-white p-6 text-center">
            {person.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatars come from object storage
              <img src={person.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-50 text-2xl font-semibold text-teal-700"
              >
                {person.full_name.charAt(0)}
              </span>
            )}
            <h3 className="mt-4 font-semibold">{person.full_name}</h3>
            {person.headline && <p className="mt-1 text-sm text-muted">{person.headline}</p>}
            {person.bio && <p className="mt-3 line-clamp-4 text-sm">{person.bio}</p>}
          </li>
        ))}
      </ul>
    </SectionContainer>
  );
}
