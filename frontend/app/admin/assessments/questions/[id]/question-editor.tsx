"use client";

import { ArrowDown, ArrowLeft, ArrowUp, History, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { LoadError } from "@/components/cms/admin/list-parts";
import { ImageInput } from "@/components/cms/admin/media-picker";
import { RichTextEditor } from "@/components/cms/admin/rich-text-editor";
import { RichText } from "@/components/cms/rich-text";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Alert, Badge, PageHeader, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { useSaveShortcut, useUnsavedWarning } from "@/hooks/use-unsaved-warning";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { DIFFICULTY_LABEL, KIND_LABEL, QUESTION_STATUS, optionLetter } from "@/lib/assessments";
import { cn, formatDateTime } from "@/lib/utils";
import type { AdminOption, AdminQuestion, AdminSubject, CourseOption, Difficulty, QuestionKind, QuestionStatus, QuestionVersion } from "@/types/assessments";
import type { MediaRef } from "@/types/cms";

const MAX_OPTIONS = 8;

type Draft = {
  subject: number | null;
  topic: number | null;
  course: number | null;
  kind: QuestionKind;
  status: QuestionStatus;
  difficulty: Difficulty;
  prompt: string;
  image: number | null;
  image_detail: MediaRef | null;
  explanation: string;
  default_marks: string;
  default_negative_marks: string;
  tags: string;
  options: AdminOption[];
};

const blankOption = (): AdminOption => ({ text: "", image: null, image_detail: null, is_correct: false });
const trueFalse = (): AdminOption[] => [
  { text: "<p>True</p>", image: null, image_detail: null, is_correct: true },
  { text: "<p>False</p>", image: null, image_detail: null, is_correct: false },
];

function emptyDraft(): Draft {
  return {
    subject: null,
    topic: null,
    course: null,
    kind: "single",
    status: "draft",
    difficulty: "medium",
    prompt: "",
    image: null,
    image_detail: null,
    explanation: "",
    default_marks: "1",
    default_negative_marks: "0",
    tags: "",
    options: [blankOption(), blankOption(), blankOption(), blankOption()],
  };
}

function toDraft(q: AdminQuestion): Draft {
  return {
    subject: q.subject,
    topic: q.topic,
    course: q.course,
    kind: q.kind,
    status: q.status,
    difficulty: q.difficulty,
    prompt: q.prompt,
    image: q.image,
    image_detail: q.image_detail,
    explanation: q.explanation,
    default_marks: q.default_marks,
    default_negative_marks: q.default_negative_marks,
    tags: q.tags.join(", "),
    options: q.options.map((o) => ({ ...o })),
  };
}

function payload(d: Draft): Record<string, unknown> {
  return {
    subject: d.subject,
    topic: d.topic,
    course: d.course,
    kind: d.kind,
    status: d.status,
    difficulty: d.difficulty,
    prompt: d.prompt,
    image: d.image,
    explanation: d.explanation,
    default_marks: d.default_marks.trim(),
    default_negative_marks: d.default_negative_marks.trim() || "0",
    tags: d.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    options: d.options.map((o) => ({ text: o.text, image: o.image, is_correct: o.is_correct })),
  };
}

/** Only changed fields are sent, so an unchanged course is not re-checked against the author's rights. */
function changes(d: Draft, server: AdminQuestion): Record<string, unknown> {
  const now = payload(d);
  const before = payload(toDraft(server));
  return Object.fromEntries(Object.entries(now).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])));
}

/** Problems the server would also reject; shown before saving so the author can fix them in place. */
export function draftProblems(d: Draft): string[] {
  const problems: string[] = [];
  if (!d.subject) problems.push("Choose a subject.");
  if (!d.prompt.replace(/<[^>]*>/g, "").trim() && !d.prompt.includes("data-latex") && !d.image) problems.push("Write the question.");
  const correct = d.options.filter((o) => o.is_correct).length;
  if (d.kind === "multiple" ? correct < 1 : correct !== 1) {
    problems.push(d.kind === "multiple" ? "Mark at least one option as correct." : "Mark exactly one option as correct.");
  }
  d.options.forEach((o, i) => {
    if (!o.text.replace(/<[^>]*>/g, "").trim() && !o.text.includes("data-latex") && !o.image) problems.push(`Option ${optionLetter(i)} is empty.`);
  });
  if (!/^\d+(\.\d{1,2})?$/.test(d.default_marks.trim()) || Number(d.default_marks) < 0.25) problems.push("Marks must be at least 0.25.");
  if (d.default_negative_marks.trim() && !/^\d+(\.\d{1,2})?$/.test(d.default_negative_marks.trim())) problems.push("Negative marks must be a number such as 0.25.");
  return problems;
}

export function QuestionEditor({
  questionId,
  manager,
  canPickMedia,
  canUpload,
}: {
  questionId: number | null;
  manager: boolean;
  canPickMedia: boolean;
  canUpload: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const isNew = questionId === null;
  const { data: server, error, reload, setData } = useApiResource<AdminQuestion>(isNew ? null : `/admin/assessments/questions/${questionId}/`);
  const subjects = useApiResource<AdminSubject[]>("/admin/assessments/subjects/");
  const courses = useApiResource<CourseOption[]>("/admin/assessments/course-options/");
  const [draft, setDraft] = useState<Draft | null>(isNew ? emptyDraft() : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [syncedFrom, setSyncedFrom] = useState<AdminQuestion | null>(null);
  if (server && server !== syncedFrom) {
    setSyncedFrom(server);
    setDraft(toDraft(server));
  }

  const canEdit = isNew || Boolean(server?.can_edit);
  const dirty = Boolean(draft && (isNew ? draft.prompt || draft.options.some((o) => o.text) : server && Object.keys(changes(draft, server)).length > 0));
  useUnsavedWarning(dirty && canEdit);

  const update = useCallback((patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d)), []);

  const save = useCallback(async () => {
    if (!draft || saving || !canEdit) return;
    const found = draftProblems(draft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    setErrors({});
    try {
      if (isNew) {
        const created = await api.post<AdminQuestion>("/admin/assessments/questions/", payload(draft));
        toast.success("Question saved.");
        router.replace(`/admin/assessments/questions/${created.id}`);
      } else if (server) {
        const body = changes(draft, server);
        if (Object.keys(body).length === 0) return;
        const updated = await api.patch<AdminQuestion>(`/admin/assessments/questions/${server.id}/`, body);
        setData(updated);
        toast.success(updated.version > server.version ? `Saved as version ${updated.version}.` : "Question saved.");
      }
    } catch (err) {
      setErrors(isApiError(err) ? err.fieldErrors() : {});
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [draft, saving, canEdit, isNew, server, router, toast, setData]);
  useSaveShortcut(save, canEdit);

  async function remove() {
    if (!server) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/assessments/questions/${server.id}/`);
      toast.success("Question deleted.");
      router.push("/admin/assessments/questions");
    } catch (err) {
      toast.error(errorMessage(err));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!draft) return <Skeleton className="h-96" />;

  const subject = subjects.data?.find((s) => s.id === draft.subject);
  const readOnly = !canEdit;

  function setKind(kind: QuestionKind) {
    if (!draft) return;
    let options = draft.options;
    if (kind === "true_false") options = trueFalse();
    else if (draft.kind === "true_false") options = [blankOption(), blankOption(), blankOption(), blankOption()];
    else if (kind === "single" && options.filter((o) => o.is_correct).length > 1) {
      let seen = false;
      options = options.map((o) => {
        const keep = o.is_correct && !seen;
        if (o.is_correct) seen = true;
        return { ...o, is_correct: keep };
      });
    }
    update({ kind, options });
  }

  function setOption(index: number, patch: Partial<AdminOption>) {
    if (!draft) return;
    update({ options: draft.options.map((o, i) => (i === index ? { ...o, ...patch } : o)) });
  }

  function markCorrect(index: number) {
    if (!draft) return;
    if (draft.kind === "multiple") setOption(index, { is_correct: !draft.options[index].is_correct });
    else update({ options: draft.options.map((o, i) => ({ ...o, is_correct: i === index })) });
  }

  function moveOption(index: number, delta: number) {
    if (!draft) return;
    const target = index + delta;
    if (target < 0 || target >= draft.options.length) return;
    const options = [...draft.options];
    [options[index], options[target]] = [options[target], options[index]];
    update({ options });
  }

  const statusInfo = server ? QUESTION_STATUS[server.status] : null;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/assessments/questions" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Question bank
      </Link>
      <PageHeader
        title={isNew ? "New question" : `Question #${server?.id}`}
        description={
          server ? `Version ${server.version} · updated ${formatDateTime(server.updated_at)} · used in ${server.used_in_exams} exam${server.used_in_exams === 1 ? "" : "s"}` : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {statusInfo && <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>}
            {server && canEdit && (
              <Button variant="outline" onClick={() => setShowHistory(true)}>
                <History className="h-4 w-4" aria-hidden="true" />
                History
              </Button>
            )}
            {server && canEdit && (
              <Button variant="outline" onClick={() => setConfirmDelete(true)} disabled={server.used_in_exams > 0} title={server.used_in_exams > 0 ? "Retire it instead: exams use this question." : undefined}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
            )}
            {canEdit && (
              <Button onClick={save} loading={saving} disabled={!isNew && !dirty}>
                {isNew ? "Save question" : "Save changes"}
              </Button>
            )}
          </div>
        }
      />

      {readOnly && (
        <Alert tone="info">You can use this question in exams but not change it. Shared questions are edited by question-bank managers.</Alert>
      )}
      {server && canEdit && server.used_in_exams > 0 && (
        <Alert tone="info">
          Exams already taken keep the version learners saw. Changes apply to attempts started after you save.
        </Alert>
      )}
      {problems.length > 0 && (
        <Alert tone="warning" title="Fix these before saving">
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Question</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Field label="Question text" htmlFor="q-prompt" required error={errors.prompt}>
                {readOnly ? (
                  <RichText html={draft.prompt} />
                ) : (
                  <RichTextEditor id="q-prompt" value={draft.prompt} onChange={(v) => update({ prompt: v })} invalid={Boolean(errors.prompt)} minimal />
                )}
              </Field>
              {(canPickMedia || draft.image) && (
                <Field label="Image" htmlFor="q-image" hint="Images are public files: never put the answer in an image's file name or caption." error={errors.image}>
                  <ImageInput
                    id="q-image"
                    value={draft.image}
                    detail={draft.image_detail}
                    onChange={(image, ref) => update({ image, image_detail: ref })}
                    canUpload={canUpload}
                    readOnly={readOnly || !canPickMedia}
                  />
                </Field>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Options</CardTitle>
              <p className="text-sm text-muted">
                {draft.kind === "multiple"
                  ? "Tick every correct option. Learners score only when they choose exactly these."
                  : draft.kind === "true_false"
                    ? "Choose which statement is correct."
                    : "Choose the one correct option."}
              </p>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              {errors.options && <Alert tone="danger">{errors.options}</Alert>}
              <fieldset className="flex flex-col gap-3" disabled={readOnly}>
                <legend className="sr-only">Answer options</legend>
                {draft.options.map((option, i) => (
                  <div key={i} className={cn("rounded-md border p-3", option.is_correct ? "border-success bg-success/5" : "border-line")}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-navy">
                        <input
                          type={draft.kind === "multiple" ? "checkbox" : "radio"}
                          name="correct-option"
                          checked={option.is_correct}
                          onChange={() => markCorrect(i)}
                          className="h-4 w-4 accent-teal"
                        />
                        Option {optionLetter(i)} {option.is_correct && <Badge tone="success">Correct</Badge>}
                      </label>
                      {!readOnly && draft.kind !== "true_false" && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" aria-label={`Move option ${optionLetter(i)} up`} disabled={i === 0} onClick={() => moveOption(i, -1)}>
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label={`Move option ${optionLetter(i)} down`} disabled={i === draft.options.length - 1} onClick={() => moveOption(i, 1)}>
                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove option ${optionLetter(i)}`}
                            disabled={draft.options.length <= 2}
                            onClick={() => update({ options: draft.options.filter((_, j) => j !== i) })}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {readOnly || draft.kind === "true_false" ? (
                      <RichText html={option.text} />
                    ) : (
                      <RichTextEditor
                        id={`q-option-${i}`}
                        value={option.text}
                        onChange={(v) => setOption(i, { text: v })}
                        invalid={Boolean(errors[`options.${i}.text`])}
                        minimal
                        placeholderLabel={`Option ${optionLetter(i)}`}
                      />
                    )}
                    {errors[`options.${i}.text`] && <p className="mt-1 text-sm text-danger">{errors[`options.${i}.text`]}</p>}
                    {canPickMedia && !readOnly && draft.kind !== "true_false" && (
                      <div className="mt-2">
                        <ImageInput
                          id={`q-option-image-${i}`}
                          value={option.image}
                          detail={option.image_detail}
                          onChange={(image, ref) => setOption(i, { image, image_detail: ref })}
                          canUpload={canUpload}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </fieldset>
              {!readOnly && draft.kind !== "true_false" && (
                <Button variant="outline" className="self-start" disabled={draft.options.length >= MAX_OPTIONS} onClick={() => update({ options: [...draft.options, blankOption()] })}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add option
                </Button>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Explanation</CardTitle>
              <p className="text-sm text-muted">Shown with the results only when the exam allows explanations.</p>
            </CardHeader>
            <CardBody>
              <Field label="Explanation" htmlFor="q-explanation" error={errors.explanation}>
                {readOnly ? (
                  draft.explanation ? <RichText html={draft.explanation} /> : <p className="text-sm text-muted">No explanation.</p>
                ) : (
                  <RichTextEditor id="q-explanation" value={draft.explanation} onChange={(v) => update({ explanation: v })} minimal />
                )}
              </Field>
            </CardBody>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardBody>
            <fieldset className="flex flex-col gap-4" disabled={readOnly}>
              <Field label="Type" htmlFor="q-kind" error={errors.kind}>
                <Select id="q-kind" value={draft.kind} onChange={(e) => setKind(e.target.value as QuestionKind)}>
                  {Object.entries(KIND_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Subject" htmlFor="q-subject" required error={errors.subject}>
                <Select id="q-subject" value={draft.subject ?? ""} onChange={(e) => update({ subject: e.target.value ? Number(e.target.value) : null, topic: null })}>
                  <option value="">Choose a subject</option>
                  {subjects.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Topic" htmlFor="q-topic" error={errors.topic}>
                <Select id="q-topic" value={draft.topic ?? ""} disabled={!subject?.topics.length} onChange={(e) => update({ topic: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">No topic</option>
                  {subject?.topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.parent ? `— ${t.name}` : t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Course"
                htmlFor="q-course"
                error={errors.course}
                hint={manager ? "Shared questions can be used by every course's exams." : "Questions you write belong to a course you teach."}
              >
                <Select id="q-course" value={draft.course ?? ""} onChange={(e) => update({ course: e.target.value ? Number(e.target.value) : null })}>
                  {(manager || draft.course === null) && <option value="">{manager ? "Shared bank" : "Choose a course"}</option>}
                  {courses.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                  {server?.course && !courses.data?.some((c) => c.id === server.course) && <option value={server.course}>{server.course_title}</option>}
                </Select>
              </Field>
              <Field label="Status" htmlFor="q-status" hint="Only active questions can be published in exams." error={errors.status}>
                <Select id="q-status" value={draft.status} onChange={(e) => update({ status: e.target.value as QuestionStatus })}>
                  {Object.entries(QUESTION_STATUS).map(([value, s]) => (
                    <option key={value} value={value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Difficulty" htmlFor="q-difficulty" error={errors.difficulty}>
                <Select id="q-difficulty" value={draft.difficulty} onChange={(e) => update({ difficulty: e.target.value as Difficulty })}>
                  {Object.entries(DIFFICULTY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Marks" htmlFor="q-marks" error={errors.default_marks}>
                  <Input id="q-marks" inputMode="decimal" value={draft.default_marks} onChange={(e) => update({ default_marks: e.target.value })} />
                </Field>
                <Field label="Negative" htmlFor="q-negative" error={errors.default_negative_marks} hint="Deducted when wrong">
                  <Input id="q-negative" inputMode="decimal" value={draft.default_negative_marks} onChange={(e) => update({ default_negative_marks: e.target.value })} />
                </Field>
              </div>
              <Field label="Tags" htmlFor="q-tags" hint="Separate with commas." error={errors.tags}>
                <Input id="q-tags" value={draft.tags} onChange={(e) => update({ tags: e.target.value })} />
              </Field>
            </fieldset>
          </CardBody>
        </Card>
      </div>

      {server && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete this question?"
          description="The question and its version history are removed permanently."
          confirmLabel="Delete question"
          tone="danger"
          loading={deleting}
          onConfirm={remove}
        />
      )}
      {server && showHistory && <VersionHistory questionId={server.id} onClose={() => setShowHistory(false)} />}
    </div>
  );
}

function VersionHistory({ questionId, onClose }: { questionId: number; onClose: () => void }) {
  const { data, error, reload } = useApiResource<QuestionVersion[]>(`/admin/assessments/questions/${questionId}/versions/`);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Version history" description="A copy is kept each time the question, options or answer change." className="max-w-2xl">
      {error && <LoadError message={error} onRetry={reload} />}
      {!data && !error && <Skeleton className="h-40" />}
      {data && (
        <ol className="flex flex-col gap-4">
          {data.map((v) => (
            <li key={v.id} className="rounded-md border border-line p-3">
              <p className="mb-2 text-xs text-muted">
                Version {v.version} · {formatDateTime(v.created_at)}
                {v.created_by_name && ` · ${v.created_by_name}`}
              </p>
              {v.snapshot.prompt && <RichText html={v.snapshot.prompt} className="prose-sm" />}
              {v.snapshot.options && (
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {v.snapshot.options.map((o, i) => (
                    <li key={i} className="flex gap-2">
                      <span className={cn("font-medium", o.is_correct ? "text-success" : "text-muted")}>{optionLetter(i)}.</span>
                      <RichText html={o.text} className="prose-sm prose-p:my-0" />
                      {o.is_correct && <Badge tone="success">Correct</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}
