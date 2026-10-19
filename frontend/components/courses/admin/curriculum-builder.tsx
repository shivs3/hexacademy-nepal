"use client";

import { ArrowDown, ArrowUp, Eye, FileText, Layers, Paperclip, Pencil, Plus, Trash2, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LoadError } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Badge, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatMinutes } from "@/lib/catalog";
import type { AdminLesson, AdminModule } from "@/types/catalog-admin";

type ModuleForm = { id: number | null; title: string; description: string };

function layoutOf(modules: AdminModule[]) {
  return modules.map((m) => ({ id: m.id, lessons: m.lessons.map((l) => l.id) }));
}

/**
 * Modules and lessons of a course. Every structural change is saved immediately;
 * the server rejects a reorder built from a stale copy (409) and the list reloads.
 */
export function CurriculumBuilder({ courseId, canEdit, onChanged }: { courseId: number; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const res = useApiResource<AdminModule[]>(`/admin/catalog/courses/${courseId}/curriculum/`);
  const [local, setLocal] = useState<AdminModule[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [moduleForm, setModuleForm] = useState<ModuleForm | null>(null);
  const [lessonFor, setLessonFor] = useState<AdminModule | null>(null);
  const [deleting, setDeleting] = useState<AdminModule | null>(null);
  const modules = local ?? res.data;

  function adopt(next: AdminModule[]) {
    setLocal(next);
    onChanged();
  }

  function reload() {
    setLocal(null);
    res.reload();
  }

  async function applyLayout(next: AdminModule[]) {
    const previous = modules;
    setLocal(next); // optimistic
    setBusy(true);
    try {
      adopt(await api.post<AdminModule[]>(`/admin/catalog/courses/${courseId}/curriculum/reorder/`, { modules: layoutOf(next) }));
    } catch (err) {
      setLocal(previous ?? null);
      toast.error(errorMessage(err));
      if (isApiError(err) && err.status === 409) reload();
    } finally {
      setBusy(false);
    }
  }

  function moveModule(from: number, to: number) {
    if (!modules) return;
    const next = [...modules];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void applyLayout(next);
  }

  function moveLesson(moduleIndex: number, from: number, to: number) {
    if (!modules) return;
    const next = modules.map((m, i) => {
      if (i !== moduleIndex) return m;
      const lessons = [...m.lessons];
      const [moved] = lessons.splice(from, 1);
      lessons.splice(to, 0, moved);
      return { ...m, lessons };
    });
    void applyLayout(next);
  }

  function moveLessonTo(moduleIndex: number, lessonIndex: number, targetId: number) {
    if (!modules) return;
    const lesson = modules[moduleIndex].lessons[lessonIndex];
    const next = modules.map((m, i) => {
      if (i === moduleIndex) return { ...m, lessons: m.lessons.filter((_, j) => j !== lessonIndex) };
      if (m.id === targetId) return { ...m, lessons: [...m.lessons, lesson] };
      return m;
    });
    void applyLayout(next);
  }

  async function deleteModule(module: AdminModule) {
    setBusy(true);
    try {
      await api.delete(`/admin/catalog/modules/${module.id}/`);
      adopt((modules ?? []).filter((m) => m.id !== module.id));
      setDeleting(null);
      toast.success("Module deleted.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (res.error && !modules) return <LoadError message={res.error} onRetry={reload} />;
  if (!modules) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      {modules.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No modules yet"
          description={canEdit ? "Group the course into modules, then add lessons to each module." : "The instructors have not added any modules yet."}
          action={
            canEdit ? (
              <Button onClick={() => setModuleForm({ id: null, title: "", description: "" })}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add module
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ol className="flex flex-col gap-4">
          {modules.map((module, mi) => (
            <li key={module.id}>
              <Card className="overflow-hidden">
                <div className="flex flex-col gap-2 border-b border-line bg-page px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-navy">
                      <span className="text-muted">Module {mi + 1} · </span>
                      {module.title}
                    </h3>
                    {module.description && <p className="mt-0.5 text-xs text-muted">{module.description}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center">
                      <Button variant="ghost" size="icon" disabled={busy || mi === 0} onClick={() => moveModule(mi, mi - 1)} aria-label={`Move module ${module.title} up`}>
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon" disabled={busy || mi === modules.length - 1} onClick={() => moveModule(mi, mi + 1)} aria-label={`Move module ${module.title} down`}>
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setModuleForm({ id: module.id, title: module.title, description: module.description })} aria-label={`Rename module ${module.title}`}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-danger"
                        disabled={busy || module.lessons.length > 0}
                        title={module.lessons.length > 0 ? "Move or delete its lessons first" : undefined}
                        onClick={() => setDeleting(module)}
                        aria-label={`Delete module ${module.title}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>
                {module.lessons.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted">No lessons in this module.</p>
                ) : (
                  <ol className="divide-y divide-line">
                    {module.lessons.map((lesson, li) => (
                      <li key={lesson.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          {lesson.has_video ? (
                            <Video className="h-4 w-4 shrink-0 text-muted" aria-label="Video lesson" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-muted" aria-label="Reading lesson" />
                          )}
                          <Link href={`/admin/catalog/lessons/${lesson.id}`} className="truncate font-medium text-navy hover:text-teal-700 hover:underline">
                            {lesson.title}
                          </Link>
                          <span className="flex shrink-0 flex-wrap items-center gap-1">
                            {!lesson.is_published && <Badge>Draft</Badge>}
                            {lesson.is_preview && (
                              <Badge tone="teal">
                                <Eye className="h-3 w-3" aria-hidden="true" />
                                Preview
                              </Badge>
                            )}
                            {lesson.resource_count > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-xs text-muted">
                                <Paperclip className="h-3 w-3" aria-hidden="true" />
                                {lesson.resource_count}
                              </span>
                            )}
                            {lesson.duration_minutes > 0 && <span className="text-xs text-muted">{formatMinutes(lesson.duration_minutes)}</span>}
                          </span>
                        </div>
                        {canEdit && (
                          <div className="flex shrink-0 items-center gap-1">
                            {modules.length > 1 && (
                              <Select
                                aria-label={`Move ${lesson.title} to another module`}
                                value=""
                                disabled={busy}
                                onChange={(e) => e.target.value && moveLessonTo(mi, li, Number(e.target.value))}
                                className="h-8 w-36 text-xs"
                              >
                                <option value="">Move to…</option>
                                {modules
                                  .filter((m) => m.id !== module.id)
                                  .map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.title}
                                    </option>
                                  ))}
                              </Select>
                            )}
                            <Button variant="ghost" size="icon" disabled={busy || li === 0} onClick={() => moveLesson(mi, li, li - 1)} aria-label={`Move ${lesson.title} up`}>
                              <ArrowUp className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={busy || li === module.lessons.length - 1}
                              onClick={() => moveLesson(mi, li, li + 1)}
                              aria-label={`Move ${lesson.title} down`}
                            >
                              <ArrowDown className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                {canEdit && (
                  <div className="border-t border-line px-4 py-2">
                    <Button variant="ghost" size="sm" onClick={() => setLessonFor(module)}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add lesson
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ol>
      )}

      {canEdit && modules.length > 0 && (
        <div>
          <Button variant="outline" onClick={() => setModuleForm({ id: null, title: "", description: "" })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add module
          </Button>
        </div>
      )}

      {moduleForm && (
        <ModuleDialog
          courseId={courseId}
          initial={moduleForm}
          onClose={() => setModuleForm(null)}
          onSaved={(saved) => {
            const exists = modules.some((m) => m.id === saved.id);
            adopt(exists ? modules.map((m) => (m.id === saved.id ? saved : m)) : [...modules, saved]);
            setModuleForm(null);
          }}
        />
      )}
      {lessonFor && <NewLessonDialog module={lessonFor} onClose={() => setLessonFor(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this module?"
        description={deleting ? `“${deleting.title}” has no lessons and will be removed.` : ""}
        confirmLabel="Delete"
        tone="danger"
        loading={busy}
        onConfirm={() => deleting && deleteModule(deleting)}
      />
    </div>
  );
}

function ModuleDialog({
  courseId,
  initial,
  onClose,
  onSaved,
}: {
  courseId: number;
  initial: ModuleForm;
  onClose: () => void;
  onSaved: (module: AdminModule) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setErrors({ title: "Enter a title." });
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = { title, description };
      const saved =
        initial.id === null
          ? await api.post<AdminModule>(`/admin/catalog/courses/${courseId}/modules/`, body)
          : await api.patch<AdminModule>(`/admin/catalog/modules/${initial.id}/`, body);
      onSaved(saved);
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? null : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial.id === null ? "Add module" : "Edit module"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="module-form" loading={saving}>
            {initial.id === null ? "Add module" : "Save"}
          </Button>
        </>
      }
    >
      <form id="module-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError && <p className="text-sm text-danger">{formError}</p>}
        <Field label="Title" htmlFor="module-title" error={errors.title} required>
          <Input value={title} maxLength={160} autoFocus onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="module-description" error={errors.description} hint="Optional. Shown under the module title in the curriculum.">
          <Textarea rows={3} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

function NewLessonDialog({ module, onClose }: { module: AdminModule; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Enter a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const lesson = await api.post<AdminLesson>("/admin/catalog/lessons/", { module: module.id, title, is_published: false });
      router.push(`/admin/catalog/lessons/${lesson.id}`);
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setError(fields.title ?? fields.module ?? errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add lesson"
      description={`The lesson is added to “${module.title}” as a draft. Learners only see it once it is published.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="lesson-form" loading={saving}>
            Create and edit
          </Button>
        </>
      }
    >
      <form id="lesson-form" onSubmit={submit} noValidate>
        <Field label="Title" htmlFor="lesson-title" error={error ?? undefined} required>
          <Input value={title} maxLength={160} autoFocus onChange={(e) => setTitle(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
