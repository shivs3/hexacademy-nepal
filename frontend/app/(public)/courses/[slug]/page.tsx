import { BookOpen, Check, Clock, Globe, PlayCircle, Signal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { JsonLd } from "@/components/cms/json-ld";
import { MediaImage } from "@/components/cms/media-image";
import { RichText } from "@/components/cms/rich-text";
import { EnrollPanel } from "@/components/courses/enroll-panel";
import { PriceTag } from "@/components/courses/price-tag";
import { Badge } from "@/components/ui/feedback";
import { serverGetOrNull } from "@/lib/api/server";
import { getCurrentUser } from "@/lib/auth";
import { formatMinutes, lessonPath } from "@/lib/catalog";
import { buildMetadata, getSiteSettings, SITE_URL } from "@/lib/cms";
import { formatDate } from "@/lib/utils";
import { type CourseDetail, LANGUAGE_LABELS, LEVEL_LABELS } from "@/types/catalog";
import type { PlayerOutline } from "@/types/learning";

type Props = { params: Promise<{ slug: string }> };

const getCourse = cache((slug: string) => serverGetOrNull<CourseDetail>(`/courses/${encodeURIComponent(slug)}/`));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [settings, course] = await Promise.all([getSiteSettings(), getCourse(slug)]);
  if (!course) return { title: "Course not found", robots: { index: false } };
  const seo = { ...course.seo, meta_description: course.seo.meta_description || course.subtitle };
  return buildMetadata(settings, { title: course.title, seo, path: `/courses/${course.slug}` });
}

export default async function CoursePage({ params }: Props) {
  const { slug } = await params;
  const [settings, course, user] = await Promise.all([getSiteSettings(), getCourse(slug), getCurrentUser()]);
  if (!course) notFound();
  // The learner outline answers 403 for non-enrolled users; only an enrollment id means "enrolled".
  const outline = user ? await serverGetOrNull<PlayerOutline>(`/me/courses/${encodeURIComponent(course.slug)}/`) : null;
  const enrolled = Boolean(outline?.enrollment_id);
  const duration = course.duration_text || formatMinutes(course.total_minutes);

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.seo.meta_description || course.subtitle || course.title,
    url: `${SITE_URL}/courses/${course.slug}`,
    inLanguage: course.language,
    provider: { "@type": "Organization", name: settings.site_name, sameAs: SITE_URL },
    offers: {
      "@type": "Offer",
      category: course.is_free ? "Free" : "Paid",
      price: course.current_price,
      priceCurrency: course.currency,
    },
  };

  return (
    <article className="pb-20">
      <JsonLd data={jsonLd} />
      <header className="bg-navy text-white">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_360px]">
          <div>
            <nav aria-label="Breadcrumb" className="text-sm text-white/70">
              <Link href="/courses" className="hover:text-white hover:underline">
                Courses
              </Link>
              {course.category && (
                <>
                  {" / "}
                  <Link href={`/courses?category=${course.category.slug}`} className="hover:text-white hover:underline">
                    {course.category.name}
                  </Link>
                </>
              )}
            </nav>
            <h1 className="mt-4 text-4xl font-bold leading-tight text-white sm:text-5xl">{course.title}</h1>
            {course.subtitle && <p className="mt-4 text-lg text-white/80">{course.subtitle}</p>}
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80">
              <li className="flex items-center gap-2">
                <Signal className="h-4 w-4" aria-hidden="true" />
                {LEVEL_LABELS[course.level]}
              </li>
              <li className="flex items-center gap-2">
                <Globe className="h-4 w-4" aria-hidden="true" />
                {LANGUAGE_LABELS[course.language] ?? course.language}
              </li>
              <li className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                {course.lesson_count} {course.lesson_count === 1 ? "lesson" : "lessons"}
              </li>
              {duration && (
                <li className="flex items-center gap-2">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  {duration}
                </li>
              )}
            </ul>
            {course.team.length > 0 && (
              <p className="mt-4 text-sm text-white/80">
                Taught by <span className="font-medium text-white">{course.team.map((t) => t.full_name).join(", ")}</span>
              </p>
            )}
            <p className="mt-2 text-xs text-white/60">Last updated {formatDate(course.updated_at)}</p>
          </div>

          <aside className="self-start overflow-hidden rounded-[var(--radius-card)] bg-white text-body shadow-lg lg:row-span-2">
            {course.thumbnail && (
              <div className="aspect-[16/9] bg-page">
                <MediaImage image={course.thumbnail} alt="" className="h-full object-cover" sizes="360px" priority />
              </div>
            )}
            <div className="flex flex-col gap-4 p-6">
              <PriceTag pricing={course} size="lg" />
              <EnrollPanel
                slug={course.slug}
                isFree={course.is_free}
                signedIn={Boolean(user)}
                enrolled={enrolled}
                contactEmail={settings.contact_email}
              />
              {enrolled && outline?.progress && (
                <p className="text-sm text-muted">
                  {outline.progress.completed_lessons} of {outline.progress.total_lessons} lessons completed
                </p>
              )}
            </div>
          </aside>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-12 sm:px-6 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-12">
          {course.learning_outcomes.length > 0 && (
            <section aria-labelledby="outcomes" className="rounded-[var(--radius-card)] border border-line bg-white p-6">
              <h2 id="outcomes" className="text-2xl font-semibold">
                What you will learn
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {course.learning_outcomes.map((item) => (
                  <li key={item} className="flex gap-3 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="curriculum">
            <h2 id="curriculum" className="text-2xl font-semibold">
              Curriculum
            </h2>
            {course.sequential && <p className="mt-2 text-sm text-muted">Lessons unlock in order as you complete them.</p>}
            {course.curriculum.length === 0 ? (
              <p className="mt-4 text-muted">The curriculum is being prepared.</p>
            ) : (
              <ol className="mt-4 flex flex-col gap-4">
                {course.curriculum.map((module, index) => (
                  <li key={module.id} className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
                    <div className="border-b border-line bg-page px-5 py-3">
                      <h3 className="font-semibold">
                        <span className="text-muted">Module {index + 1}: </span>
                        {module.title}
                      </h3>
                      {module.description && <p className="mt-1 text-sm text-muted">{module.description}</p>}
                    </div>
                    <ul className="divide-y divide-line">
                      {module.lessons.map((lesson) => (
                        <li key={lesson.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                          <PlayCircle className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                          {lesson.is_preview || enrolled ? (
                            <Link href={lessonPath(course.slug, lesson.id)} className="flex-1 font-medium text-teal-700 hover:underline">
                              {lesson.title}
                            </Link>
                          ) : (
                            <span className="flex-1">{lesson.title}</span>
                          )}
                          {lesson.is_preview && !enrolled && <Badge tone="teal">Preview</Badge>}
                          {lesson.duration_minutes > 0 && <span className="text-muted">{formatMinutes(lesson.duration_minutes)}</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {course.description && (
            <section aria-labelledby="about">
              <h2 id="about" className="text-2xl font-semibold">
                About this course
              </h2>
              <RichText html={course.description} className="mt-4" />
            </section>
          )}

          {course.prerequisites.length > 0 && (
            <section aria-labelledby="prerequisites">
              <h2 id="prerequisites" className="text-2xl font-semibold">
                Before you start
              </h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
                {course.prerequisites.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {course.team.length > 0 && (
            <section aria-labelledby="team">
              <h2 id="team" className="text-2xl font-semibold">
                {course.team.length === 1 ? "Your instructor" : "Your instructors"}
              </h2>
              <ul className="mt-4 flex flex-col gap-4">
                {course.team.map((person) => (
                  <li key={person.id} className="flex gap-4 rounded-[var(--radius-card)] border border-line bg-white p-5">
                    {person.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- avatars come from object storage
                      <img src={person.avatar_url} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-50 text-lg font-semibold text-teal-700"
                      >
                        {person.full_name.charAt(0)}
                      </span>
                    )}
                    <div>
                      <p className="font-semibold text-navy">{person.full_name}</p>
                      {person.headline && <p className="text-sm text-muted">{person.headline}</p>}
                      {person.bio && <p className="mt-2 whitespace-pre-line text-sm">{person.bio}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
