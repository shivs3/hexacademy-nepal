"use client";

import { useCallback, useMemo, useState } from "react";

import { RichTextEditor } from "@/components/cms/admin/rich-text-editor";
import { RichText } from "@/components/cms/rich-text";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { useSaveShortcut, useUnsavedWarning } from "@/hooks/use-unsaved-warning";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { EXAM_KIND_LABEL, RELEASE_LABEL } from "@/lib/assessments";
import { toLocalInput } from "@/lib/utils";
import type { AdminExam, CourseOption, ExamKind, ResultRelease } from "@/types/assessments";

type Draft = {
  title: string;
  slug: string;
  instructions: string;
  course: number | null;
  kind: ExamKind;
  duration_minutes: string;
  opens_at: string; // datetime-local in the browser's zone
  closes_at: string;
  question_count: string;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  negative_marking: boolean;
  pass_marks: string;
  max_attempts: string;
  allow_revisit: boolean;
  result_release: ResultRelease;
  show_answers: boolean;
  show_explanations: boolean;
  ranking_enabled: boolean;
};

/** Mirrors services.SCORING_FIELDS: these freeze once the exam leaves draft. */
const SCORING_FIELDS = new Set(["course", "kind", "question_count", "negative_marking", "pass_marks", "duration_minutes", "shuffle_questions", "shuffle_options"]);

const local = (iso: string | null) => (iso ? toLocalInput(new Date(iso)) : "");
const isoOrNull = (value: string) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
};
const intOrNull = (value: string) => (value.trim() === "" ? null : /^\d+$/.test(value.trim()) ? Number(value.trim()) : value.trim());

function toDraft(e: AdminExam): Draft {
  return {
    title: e.title,
    slug: e.slug,
    instructions: e.instructions,
    course: e.course,
    kind: e.kind,
    duration_minutes: String(e.duration_minutes),
    opens_at: local(e.opens_at),
    closes_at: local(e.closes_at),
    question_count: e.question_count == null ? "" : String(e.question_count),
    shuffle_questions: e.shuffle_questions,
    shuffle_options: e.shuffle_options,
    negative_marking: e.negative_marking,
    pass_marks: e.pass_marks ?? "",
    max_attempts: e.max_attempts == null ? "" : String(e.max_attempts),
    allow_revisit: e.allow_revisit,
    result_release: e.result_release,
    show_answers: e.show_answers,
    show_explanations: e.show_explanations,
    ranking_enabled: e.ranking_enabled,
  };
}

function payload(d: Draft): Record<string, unknown> {
  return {
    title: d.title,
    slug: d.slug,
    instructions: d.instructions,
    course: d.course,
    kind: d.kind,
    duration_minutes: intOrNull(d.duration_minutes),
    opens_at: isoOrNull(d.opens_at),
    closes_at: isoOrNull(d.closes_at),
    question_count: intOrNull(d.question_count),
    shuffle_questions: d.shuffle_questions,
    shuffle_options: d.shuffle_options,
    negative_marking: d.negative_marking,
    pass_marks: d.pass_marks.trim() || null,
    max_attempts: intOrNull(d.max_attempts),
    allow_revisit: d.allow_revisit,
    result_release: d.result_release,
    show_answers: d.show_answers,
    show_explanations: d.show_explanations,
    ranking_enabled: d.ranking_enabled,
  };
}

function changes(d: Draft, exam: AdminExam): Record<string, unknown> {
  const now = payload(d);
  const before = payload(toDraft(exam));
  return Object.fromEntries(Object.entries(now).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])));
}

export function ExamSettings({ exam, manager, onSaved }: { exam: AdminExam; manager: boolean; onSaved: (exam: AdminExam) => void }) {
  const toast = useToast();
  const courses = useApiResource<CourseOption[]>("/admin/assessments/course-options/");
  const [draft, setDraft] = useState<Draft>(() => toDraft(exam));
  const [syncedFrom, setSyncedFrom] = useState(exam);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (exam !== syncedFrom) {
    // A status change or publish elsewhere on the page: keep unsaved edits to fields that did not change on the server.
    const fresh = toDraft(exam);
    const old = toDraft(syncedFrom);
    setSyncedFrom(exam);
    setDraft((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, JSON.stringify(v) === JSON.stringify(old[k as keyof Draft]) ? fresh[k as keyof Draft] : v])) as Draft);
  }

  const diff = useMemo(() => changes(draft, exam), [draft, exam]);
  const dirty = Object.keys(diff).length > 0;
  const canEdit = exam.abilities.edit;
  useUnsavedWarning(dirty && canEdit);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const locked = (field: string) => !canEdit || (exam.status !== "draft" && SCORING_FIELDS.has(field));

  const save = useCallback(async () => {
    if (!dirty || saving || !canEdit) return;
    setSaving(true);
    setErrors({});
    try {
      const saved = await api.patch<AdminExam>(`/admin/assessments/exams/${exam.id}/`, diff);
      setSyncedFrom(saved);
      setDraft(toDraft(saved));
      onSaved(saved);
      toast.success("Settings saved.");
    } catch (err) {
      setErrors(isApiError(err) ? err.fieldErrors() : {});
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, canEdit, exam.id, diff, onSaved, toast]);
  useSaveShortcut(save, canEdit);

  const randomDraw = draft.question_count !== "" && Number(draft.question_count) < exam.question_total;

  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-sm text-muted">Unsaved changes</span>}
          <Button onClick={save} loading={saving} disabled={!dirty}>
            Save settings
          </Button>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="exam-title" required error={errors.title}>
              <Input id="exam-title" value={draft.title} disabled={!canEdit} onChange={(e) => update({ title: e.target.value })} />
            </Field>
            <Field label="Address" htmlFor="exam-slug" required error={errors.slug} hint={`Learners open it at /dashboard/exams/${draft.slug || "…"}`}>
              <Input id="exam-slug" value={draft.slug} disabled={!canEdit} onChange={(e) => update({ slug: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Instructions" htmlFor="exam-instructions" required error={errors.instructions} hint="Shown before the learner starts. Say what is allowed and how marking works.">
                {canEdit ? (
                  <RichTextEditor id="exam-instructions" value={draft.instructions} onChange={(v) => update({ instructions: v })} invalid={Boolean(errors.instructions)} />
                ) : (
                  <RichText html={draft.instructions} />
                )}
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access and timing</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <Field label="Course" htmlFor="exam-course" error={errors.course} hint="Only learners enrolled in the course can take its exams.">
              <Select id="exam-course" value={draft.course ?? ""} disabled={locked("course")} onChange={(e) => update({ course: e.target.value ? Number(e.target.value) : null })}>
                {(manager || draft.course === null) && <option value="">{manager ? "No course (all signed-in learners)" : "Choose a course"}</option>}
                {courses.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                    {c.status !== "published" ? ` (${c.status})` : ""}
                  </option>
                ))}
                {exam.course && !courses.data?.some((c) => c.id === exam.course) && <option value={exam.course}>{exam.course_title}</option>}
              </Select>
            </Field>
            <Field label="Type" htmlFor="exam-kind" error={errors.kind}>
              <Select id="exam-kind" value={draft.kind} disabled={locked("kind")} onChange={(e) => update({ kind: e.target.value as ExamKind })}>
                {Object.entries(EXAM_KIND_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Duration (minutes)" htmlFor="exam-duration" required error={errors.duration_minutes}>
              <Input id="exam-duration" inputMode="numeric" value={draft.duration_minutes} disabled={locked("duration_minutes")} onChange={(e) => update({ duration_minutes: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Opens" htmlFor="exam-opens" error={errors.opens_at} hint="Empty: open as soon as it is published.">
                <Input id="exam-opens" type="datetime-local" value={draft.opens_at} disabled={!canEdit} onChange={(e) => update({ opens_at: e.target.value })} />
              </Field>
              <Field label="Closes" htmlFor="exam-closes" error={errors.closes_at} hint="Attempts must start before this.">
                <Input id="exam-closes" type="datetime-local" value={draft.closes_at} disabled={!canEdit} onChange={(e) => update({ closes_at: e.target.value })} />
              </Field>
            </div>
            <Field label="Attempts allowed" htmlFor="exam-attempts" error={errors.max_attempts} hint="Empty for unlimited.">
              <Input id="exam-attempts" inputMode="numeric" value={draft.max_attempts} disabled={!canEdit} onChange={(e) => update({ max_attempts: e.target.value })} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Questions and scoring</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <Field
              label="Questions per attempt"
              htmlFor="exam-count"
              error={errors.question_count}
              hint={`Empty: all ${exam.question_total} added questions. Fewer: each learner gets a random selection${randomDraw ? " (every question must carry the same marks)" : ""}.`}
            >
              <Input id="exam-count" inputMode="numeric" value={draft.question_count} disabled={locked("question_count")} onChange={(e) => update({ question_count: e.target.value })} />
            </Field>
            <Field label="Pass mark" htmlFor="exam-pass" error={errors.pass_marks} hint={`Out of ${exam.total_marks}. Empty: no pass or fail.`}>
              <Input id="exam-pass" inputMode="decimal" value={draft.pass_marks} disabled={locked("pass_marks")} onChange={(e) => update({ pass_marks: e.target.value })} />
            </Field>
            <Toggle id="exam-negative" label="Negative marking" hint="Wrong answers deduct each question's negative marks. Unanswered questions score zero." checked={draft.negative_marking} disabled={locked("negative_marking")} onChange={(v) => update({ negative_marking: v })} />
            <Toggle id="exam-shuffle-q" label="Shuffle question order" checked={draft.shuffle_questions} disabled={locked("shuffle_questions")} onChange={(v) => update({ shuffle_questions: v })} />
            <Toggle id="exam-shuffle-o" label="Shuffle options" hint="Each learner sees options in a different order." checked={draft.shuffle_options} disabled={locked("shuffle_options")} onChange={(v) => update({ shuffle_options: v })} />
            <Toggle id="exam-revisit" label="Allow going back to earlier questions" hint="When off, learners answer in order and cannot return." checked={draft.allow_revisit} disabled={!canEdit} onChange={(v) => update({ allow_revisit: v })} />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Release results" htmlFor="exam-release" error={errors.result_release}>
              <Select id="exam-release" value={draft.result_release} disabled={!canEdit} onChange={(e) => update({ result_release: e.target.value as ResultRelease })}>
                {Object.entries(RELEASE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-col gap-3">
              <Toggle id="exam-answers" label="Show correct answers in the review" checked={draft.show_answers} disabled={!canEdit} onChange={(v) => update({ show_answers: v })} />
              <Toggle id="exam-explanations" label="Show explanations" checked={draft.show_explanations} disabled={!canEdit} onChange={(v) => update({ show_explanations: v })} />
              <Toggle
                id="exam-ranking"
                label="Show a ranking"
                hint="Learners see their rank and the top scores. Other learners appear by initials only."
                checked={draft.ranking_enabled}
                disabled={!canEdit}
                onChange={(v) => update({ ranking_enabled: v })}
              />
            </div>
            {draft.kind === "formal" && draft.result_release === "immediate" && draft.show_answers && (
              <div className="sm:col-span-2">
                <Alert tone="warning">
                  Learners will see the correct answers as soon as they finish. For a formal exam, release results when the exam closes so answers do not reach learners who have not
                  started yet.
                </Alert>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Toggle({ id, label, hint, checked, disabled, onChange }: { id: string; label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <Label htmlFor={id} className="flex items-start gap-2 font-normal">
      <Checkbox id={id} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </Label>
  );
}
