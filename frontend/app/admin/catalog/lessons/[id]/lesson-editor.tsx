"use client";

import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { LoadError } from "@/components/cms/admin/list-parts";
import { RichTextEditor } from "@/components/cms/admin/rich-text-editor";
import { ResourceManager } from "@/components/courses/admin/resource-manager";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert, Badge, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { useSaveShortcut, useUnsavedWarning } from "@/hooks/use-unsaved-warning";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { lessonPath } from "@/lib/catalog";
import { formatDateTime } from "@/lib/utils";
import type { AdminCourse, AdminLesson, AdminResource } from "@/types/catalog-admin";

type Draft = {
  title: string;
  summary: string;
  body: string;
  video_url: string;
  duration_minutes: string;
  is_preview: boolean;
  is_published: boolean;
};

function toDraft(l: AdminLesson): Draft {
  return {
    title: l.title,
    summary: l.summary,
    body: l.body,
    video_url: l.video_url,
    duration_minutes: String(l.duration_minutes),
    is_preview: l.is_preview,
    is_published: l.is_published,
  };
}

function payload(d: Draft) {
  const minutes = Number.parseInt(d.duration_minutes, 10);
  return { ...d, video_url: d.video_url.trim(), duration_minutes: Number.isFinite(minutes) ? minutes : 0 };
}

export function LessonEditor({ lessonId }: { lessonId: number }) {
  const toast = useToast();
  const router = useRouter();
  const lessonRes = useApiResource<AdminLesson>(`/admin/catalog/lessons/${lessonId}/`);
  const [lesson, setLesson] = useState<AdminLesson | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The course carries the abilities (edit or view only) and the names for navigation.
  const courseRes = useApiResource<AdminCourse>(lesson ? `/admin/catalog/courses/${lesson.course}/` : null);

  if (lessonRes.data && lesson === null) {
    setLesson(lessonRes.data);
    setDraft(toDraft(lessonRes.data));
  }

  const dirty = useMemo(
    () => Boolean(lesson && draft && JSON.stringify(payload(draft)) !== JSON.stringify(payload(toDraft(lesson)))),
    [lesson, draft],
  );
  useUnsavedWarning(dirty);
  const course = courseRes.data;
  const canEdit = Boolean(course?.abilities.edit);
  const courseStatus = course?.status;

  const save = useCallback(async () => {
    if (!draft || !lesson || !dirty) return;
    setSaving(true);
    setFormError(null);
    try {
      const saved = await api.patch<AdminLesson>(`/admin/catalog/lessons/${lessonId}/`, payload(draft));
      setLesson(saved);
      setDraft(toDraft(saved));
      setErrors({});
      toast.success(saved.is_published && courseStatus === "published" ? "Lesson saved. The changes are live." : "Lesson saved.");
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? "Some fields need attention." : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [courseStatus, dirty, draft, lesson, lessonId, toast]);
  useSaveShortcut(save, dirty && canEdit);

  async function remove() {
    if (!lesson) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/catalog/lessons/${lessonId}/`);
      toast.success("Lesson deleted.");
      router.push(`/admin/catalog/courses/${lesson.course}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const setResources = useCallback((resources: AdminResource[]) => setLesson((l) => (l ? { ...l, resources } : l)), []);

  if (lessonRes.error && !lesson) return <LoadError message={lessonRes.error} onRetry={lessonRes.reload} />;
  if (!lesson || !draft) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const live = lesson.is_published && course?.status === "published";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/admin/catalog/courses/${lesson.course}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-navy">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {course ? course.title : "Back to course"}
        </Link>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{draft.title || "Untitled lesson"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {lesson.is_published ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>}
            {lesson.is_preview && <Badge tone="teal">Free preview</Badge>}
            {dirty && <Badge tone="warning">Unsaved edits</Badge>}
            {course && (
              <a href={lessonPath(course.slug, lesson.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-teal-700">
                Open in course player
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={!dirty} loading={saving}>
              Save lesson
            </Button>
            <Button variant="outline" size="icon" className="text-danger" onClick={() => setConfirmDelete(true)} aria-label="Delete lesson">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {courseRes.error && <LoadError message={courseRes.error} onRetry={courseRes.reload} />}
      {course && !canEdit && <Alert tone="info">You can view this lesson. Only the course&apos;s instructors and catalog managers can change it.</Alert>}
      {canEdit && live && <Alert tone="info">This lesson is live: saved changes are visible to learners immediately.</Alert>}
      {formError && <Alert tone="danger">{formError}</Alert>}

      <fieldset disabled={!canEdit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <Field label="Title" htmlFor="lesson-title" error={errors.title} required>
                <Input value={draft.title} maxLength={160} onChange={(e) => update({ title: e.target.value })} />
              </Field>
              <Field label="Summary" htmlFor="lesson-summary" error={errors.summary} hint="Optional. One or two sentences shown above the lesson.">
                <Input value={draft.summary} maxLength={300} onChange={(e) => update({ summary: e.target.value })} />
              </Field>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lesson-body">Lesson content</Label>
                <RichTextEditor
                  id="lesson-body"
                  value={draft.body}
                  invalid={!!errors.body}
                  onChange={(body) => update({ body })}
                  placeholderLabel="Write the lesson. Use the formula button for equations…"
                />
                {errors.body && <p className="text-xs text-danger">{errors.body}</p>}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Resources</CardTitle>
            </CardHeader>
            <CardBody>
              <ResourceManager lessonId={lesson.id} resources={lesson.resources} canEdit={canEdit} onChange={setResources} />
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Video</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Field label="Video link" htmlFor="lesson-video" error={errors.video_url} hint="A YouTube or Vimeo link. Leave blank for a reading lesson.">
                <Input type="url" inputMode="url" value={draft.video_url} maxLength={500} placeholder="https://…" onChange={(e) => update({ video_url: e.target.value })} />
              </Field>
              {lesson.video_embed_url && draft.video_url.trim() === lesson.video_url && (
                <div className="aspect-video overflow-hidden rounded-md bg-navy">
                  <iframe
                    src={lesson.video_embed_url}
                    title="Lesson video preview"
                    className="h-full w-full"
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              )}
              <Field label="Duration (minutes)" htmlFor="lesson-duration" error={errors.duration_minutes} hint="Shown in the curriculum and used for the course length.">
                <Input type="number" inputMode="numeric" min={0} max={1440} value={draft.duration_minutes} onChange={(e) => update({ duration_minutes: e.target.value })} />
              </Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Visibility</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Label className="flex items-start gap-2 font-normal">
                <Checkbox checked={draft.is_published} onChange={(e) => update({ is_published: e.target.checked })} className="mt-0.5" />
                <span>
                  Published
                  <span className="block text-xs text-muted">Enrolled learners see published lessons once the course itself is published.</span>
                </span>
              </Label>
              <Label className="flex items-start gap-2 font-normal">
                <Checkbox checked={draft.is_preview} onChange={(e) => update({ is_preview: e.target.checked })} className="mt-0.5" />
                <span>
                  Free preview
                  <span className="block text-xs text-muted">Anyone can open this lesson from the course page, without enrolling.</span>
                </span>
              </Label>
              {errors.is_preview && <p className="text-xs text-danger">{errors.is_preview}</p>}
            </CardBody>
          </Card>
          <p className="text-xs text-muted">Last updated {formatDateTime(lesson.updated_at)}</p>
        </div>
      </fieldset>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this lesson?"
        description="Its content and files are deleted. Lessons that learners have started cannot be deleted; unpublish them instead."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}
