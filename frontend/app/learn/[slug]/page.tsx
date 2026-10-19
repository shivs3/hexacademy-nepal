import { notFound, redirect } from "next/navigation";

import { serverGetOrNull } from "@/lib/api/server";
import { requireUser } from "@/lib/auth";
import { lessonPath } from "@/lib/catalog";
import type { PlayerOutline } from "@/types/learning";

type Props = { params: Promise<{ slug: string }> };

/** Resume a course: the server's next lesson, else the first lesson that is open. */
export default async function ResumeCoursePage({ params }: Props) {
  const { slug } = await params;
  await requireUser(`/learn/${slug}`);
  const outline = await serverGetOrNull<PlayerOutline>(`/me/courses/${encodeURIComponent(slug)}/`);
  if (!outline) redirect(`/courses/${encodeURIComponent(slug)}`);
  const lessons = outline.modules.flatMap((m) => m.lessons);
  const target = outline.progress?.next_lesson_id ?? lessons.find((l) => !l.locked)?.id;
  if (!target) notFound();
  redirect(lessonPath(slug, target));
}
