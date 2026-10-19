import { ChevronLeft, ChevronRight, Download, ExternalLink, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { RichText } from "@/components/cms/rich-text";
import { CourseOutline } from "@/components/learning/course-outline";
import { LessonProgress } from "@/components/learning/lesson-progress";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { isApiError } from "@/lib/api/errors";
import { serverGet, serverGetOrNull } from "@/lib/api/server";
import { getCurrentUser } from "@/lib/auth";
import { formatMinutes, lessonPath } from "@/lib/catalog";
import { formatBytes } from "@/lib/utils";
import type { LessonView, PlayerOutline } from "@/types/learning";

type Props = { params: Promise<{ slug: string; lessonId: string }> };

type Loaded = { view: LessonView } | { denied: "not_enrolled" | "locked"; message: string };

const loadLesson = cache(async (id: number): Promise<Loaded | null> => {
  try {
    return { view: await serverGet<LessonView>(`/lessons/${id}/`) };
  } catch (err) {
    if (!isApiError(err)) throw err;
    if (err.status === 404) return null;
    if (err.status === 403 && (err.code === "not_enrolled" || err.code === "locked")) {
      return { denied: err.code, message: err.message };
    }
    throw err;
  }
});

function parseId(value: string): number | null {
  return /^\d{1,10}$/.test(value) ? Number(value) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseId((await params).lessonId);
  const loaded = id ? await loadLesson(id) : null;
  const title = loaded && "view" in loaded ? `${loaded.view.lesson.title} · ${loaded.view.lesson.course.title}` : "Lesson";
  return { title, robots: { index: false } };
}

export default async function LessonPage({ params }: Props) {
  const { slug, lessonId } = await params;
  const id = parseId(lessonId);
  if (!id) notFound();
  const [loaded, user] = await Promise.all([loadLesson(id), getCurrentUser()]);
  if (!loaded) notFound();
  const here = lessonPath(slug, id);

  if ("denied" in loaded) {
    const signIn = !user && loaded.denied === "not_enrolled";
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16">
        <EmptyState
          icon={Lock}
          title={loaded.denied === "locked" ? "This lesson is locked" : "This lesson is for enrolled learners"}
          description={signIn ? "Sign in to continue. If you are enrolled, the lesson will open." : loaded.message}
          action={
            <Button asChild>
              {signIn ? (
                <Link href={`/login?next=${encodeURIComponent(here)}`}>Sign in</Link>
              ) : loaded.denied === "locked" ? (
                <Link href={`/learn/${encodeURIComponent(slug)}`}>Go to your next lesson</Link>
              ) : (
                <Link href={`/courses/${encodeURIComponent(slug)}`}>View course</Link>
              )}
            </Button>
          }
        />
      </div>
    );
  }

  const { view } = loaded;
  const { lesson } = view;
  // A lesson id under the wrong course slug gets one canonical address.
  if (lesson.course.slug !== slug) redirect(lessonPath(lesson.course.slug, lesson.id));

  // Anonymous and non-enrolled visitors (free previews) get no learner outline.
  const outline = user ? await serverGetOrNull<PlayerOutline>(`/me/courses/${encodeURIComponent(slug)}/`) : null;
  const tracksProgress = view.enrolled && !view.staff_preview && lesson.is_published;
  const prevHref = view.previous_lesson_id ? lessonPath(slug, view.previous_lesson_id) : null;
  const nextHref = view.next_lesson_id ? lessonPath(slug, view.next_lesson_id) : null;
  const downloadBase = `/api/v1/lessons/${lesson.id}/resources`;

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {outline && (
        <aside className="border-b border-line bg-white lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <details className="group lg:hidden">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-navy">
              Course contents <span className="text-muted group-open:hidden">(show)</span>
              <span className="hidden text-muted group-open:inline">(hide)</span>
            </summary>
            <CourseOutline outline={outline} currentLessonId={lesson.id} />
          </details>
          <div className="hidden lg:block">
            <CourseOutline outline={outline} currentLessonId={lesson.id} />
          </div>
        </aside>
      )}

      <article className="mx-auto w-full min-w-0 max-w-4xl flex-1 px-4 py-8 sm:px-8">
        {view.staff_preview && (
          <Alert tone="warning" title="Staff preview" className="mb-6">
            You are viewing this lesson as staff. {lesson.is_published ? "" : "It is not published, so learners cannot see it. "}
            Progress is not recorded.
          </Alert>
        )}
        {!view.enrolled && !view.staff_preview && (
          <Alert tone="info" title="Free preview" className="mb-6">
            This lesson is open to everyone.{" "}
            <Link href={`/courses/${encodeURIComponent(slug)}`} className="font-medium underline">
              See the full course
            </Link>
          </Alert>
        )}

        <p className="text-sm text-muted">{lesson.module_title}</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight">{lesson.title}</h1>
        {lesson.duration_minutes > 0 && <p className="mt-2 text-sm text-muted">{formatMinutes(lesson.duration_minutes)}</p>}
        {lesson.summary && <p className="mt-4 text-lg text-muted">{lesson.summary}</p>}

        {lesson.video_embed_url && (
          <div className="mt-6 aspect-video overflow-hidden rounded-[var(--radius-card)] bg-navy">
            <iframe
              src={lesson.video_embed_url}
              title={`Video: ${lesson.title}`}
              className="h-full w-full"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}

        {lesson.body && <RichText html={lesson.body} className="mt-8" />}

        {lesson.resources.length > 0 && (
          <section aria-labelledby="resources" className="mt-10 rounded-[var(--radius-card)] border border-line bg-white p-5">
            <h2 id="resources" className="text-lg font-semibold">
              Resources
            </h2>
            <ul className="mt-3 divide-y divide-line">
              {lesson.resources.map((resource) =>
                resource.kind === "file" ? (
                  <li key={resource.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <Download className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    <a href={`${downloadBase}/${resource.id}/download/`} className="flex-1 font-medium text-teal-700 hover:underline" download>
                      {resource.title}
                    </a>
                    {resource.size_bytes !== null && <span className="text-muted">{formatBytes(resource.size_bytes)}</span>}
                  </li>
                ) : (
                  <li key={resource.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <ExternalLink className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    <a href={resource.url} target="_blank" rel="noopener noreferrer nofollow" className="flex-1 font-medium text-teal-700 hover:underline">
                      {resource.title}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ),
              )}
            </ul>
          </section>
        )}

        <nav aria-label="Lesson navigation" className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          {prevHref ? (
            <Button asChild variant="ghost">
              <Link href={prevHref}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-3">
            {tracksProgress && <LessonProgress key={lesson.id} lessonId={lesson.id} initialCompleted={view.completed} nextHref={nextHref} />}
            {nextHref && (!tracksProgress || view.completed) && (
              <Button asChild variant={tracksProgress ? "outline" : "primary"}>
                <Link href={nextHref}>
                  Next
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>
        </nav>
      </article>
    </div>
  );
}
