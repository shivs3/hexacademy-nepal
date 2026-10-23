"use client";

import { useState } from "react";

import { RichTextEditor } from "@/components/cms/admin/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Select } from "@/components/ui/input";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { fromNepalInput, toNepalInput } from "@/lib/live-classes";
import type { AdminAssignment, AssignmentCourseOption } from "@/types/assignments";

type Draft = {
  course: string;
  lesson: string;
  title: string;
  instructions: string;
  due_at: string;
  allow_late: boolean;
  accepts_text: boolean;
  accepts_file: boolean;
  max_points: string;
  is_published: boolean;
};

function toDraft(a: AdminAssignment | null): Draft {
  return {
    course: a ? String(a.course.id) : "",
    lesson: a?.lesson ? String(a.lesson.id) : "",
    title: a?.title ?? "",
    instructions: a?.instructions ?? "",
    due_at: a?.due_at ? toNepalInput(a.due_at) : "",
    allow_late: a?.allow_late ?? false,
    accepts_text: a?.accepts_text ?? true,
    accepts_file: a?.accepts_file ?? true,
    max_points: String(a?.max_points ?? 100),
    is_published: a?.is_published ?? false,
  };
}

export function checkAssignment(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.course) e.course = "Choose a course.";
  if (!d.title.trim()) e.title = "Enter a title.";
  if (d.due_at && !fromNepalInput(d.due_at)) e.due_at = "Enter a date and time.";
  if (!/^\d+$/.test(d.max_points) || Number(d.max_points) < 1 || Number(d.max_points) > 1000) e.max_points = "A whole number from 1 to 1000.";
  if (!d.accepts_text && !d.accepts_file) e.accepts_text = "Accept a written answer, a file, or both.";
  return e;
}

export function AssignmentDialog({
  assignment,
  onClose,
  onSaved,
}: {
  assignment: AdminAssignment | null;
  onClose: () => void;
  onSaved: (a: AdminAssignment) => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(assignment));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const courses = useApiResource<AssignmentCourseOption[]>("/admin/learning/assignment-courses/");
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const lessons = courses.data?.find((c) => String(c.id) === draft.course)?.lessons ?? (assignment?.lesson ? [assignment.lesson] : []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const found = checkAssignment(draft);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    const body = {
      ...(assignment ? {} : { course: Number(draft.course) }),
      lesson: draft.lesson ? Number(draft.lesson) : null,
      title: draft.title.trim(),
      instructions: draft.instructions,
      due_at: draft.due_at ? fromNepalInput(draft.due_at) : null,
      allow_late: draft.allow_late,
      accepts_text: draft.accepts_text,
      accepts_file: draft.accepts_file,
      max_points: Number(draft.max_points),
      is_published: draft.is_published,
    };
    setSaving(true);
    try {
      const saved = assignment
        ? await api.patch<AdminAssignment>(`/admin/learning/assignments/${assignment.id}/`, body)
        : await api.post<AdminAssignment>("/admin/learning/assignments/", body);
      onSaved(saved);
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      const nonField = fields.non_field_errors;
      delete fields.non_field_errors;
      setErrors(fields);
      setFormError(nonField ?? (Object.keys(fields).length ? null : errorMessage(err)));
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !saving && onClose()}
      title={assignment ? `Edit ${assignment.title}` : "New assignment"}
      description="Learners enrolled in the course see published assignments in their dashboard."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="assignment-form" loading={saving}>
            {assignment ? "Save assignment" : "Create assignment"}
          </Button>
        </>
      }
    >
      <form id="assignment-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
        {formError && (
          <div className="sm:col-span-2">
            <Alert tone="danger">{formError}</Alert>
          </div>
        )}
        {assignment ? (
          <p className="text-sm text-muted sm:col-span-2">
            Course: <span className="font-medium text-navy">{assignment.course.title}</span>
          </p>
        ) : (
          <Field label="Course" htmlFor="assignment-course" error={errors.course ?? courses.error ?? undefined} required>
            {courses.data ? (
              <Select value={draft.course} onChange={(e) => update({ course: e.target.value, lesson: "" })}>
                <option value="">Choose a course…</option>
                {courses.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                    {c.status !== "published" ? ` (${c.status})` : ""}
                  </option>
                ))}
              </Select>
            ) : (
              <Skeleton className="h-10 w-full" />
            )}
          </Field>
        )}
        <Field label="Lesson" htmlFor="assignment-lesson" error={errors.lesson} hint="Optional. Shown as context to learners." className={assignment ? "sm:col-span-2" : undefined}>
          <Select value={draft.lesson} onChange={(e) => update({ lesson: e.target.value })} disabled={!draft.course}>
            <option value="">Whole course</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title" htmlFor="assignment-title" error={errors.title} required className="sm:col-span-2">
          <Input value={draft.title} maxLength={160} onChange={(e) => update({ title: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Instructions" htmlFor="assignment-instructions" error={errors.instructions}>
            <RichTextEditor id="assignment-instructions" value={draft.instructions} onChange={(html) => update({ instructions: html })} minimal />
          </Field>
        </div>
        <Field label="Due (Nepal time)" htmlFor="assignment-due" error={errors.due_at} hint="Optional.">
          <Input type="datetime-local" value={draft.due_at} onChange={(e) => update({ due_at: e.target.value })} />
        </Field>
        <Field label="Points" htmlFor="assignment-points" error={errors.max_points} required>
          <Input inputMode="numeric" value={draft.max_points} onChange={(e) => update({ max_points: e.target.value.trim() })} />
        </Field>
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium text-navy">Learners can hand in</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="assignment-accepts-text" checked={draft.accepts_text} onChange={(e) => update({ accepts_text: e.target.checked })} />
              <Label htmlFor="assignment-accepts-text" className="font-normal">A written answer</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="assignment-accepts-file" checked={draft.accepts_file} onChange={(e) => update({ accepts_file: e.target.checked })} />
              <Label htmlFor="assignment-accepts-file" className="font-normal">A file</Label>
            </div>
          </div>
          {errors.accepts_text && <p className="text-sm text-danger">{errors.accepts_text}</p>}
        </fieldset>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <div className="flex items-center gap-2">
            <Checkbox id="assignment-allow-late" checked={draft.allow_late} onChange={(e) => update({ allow_late: e.target.checked })} />
            <Label htmlFor="assignment-allow-late" className="font-normal">Accept late work (marked late)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="assignment-published" checked={draft.is_published} onChange={(e) => update({ is_published: e.target.checked })} />
            <Label htmlFor="assignment-published" className="font-normal">Published: visible to enrolled learners</Label>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
