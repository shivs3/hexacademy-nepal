"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { LoadError, TableSkeleton } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { applyServerErrors } from "@/lib/forms";
import { slugField, slugify } from "@/lib/validation/cms";
import type { AdminSubject, AdminTopic } from "@/types/assessments";

const SLUG_MAX = 140;

type Editing =
  | { type: "subject"; subject: AdminSubject | null }
  | { type: "topic"; subject: AdminSubject; topic: AdminTopic | null; parent?: number | null };
type Deleting = { type: "subject"; item: AdminSubject } | { type: "topic"; item: AdminTopic };

export function SubjectsManager() {
  const toast = useToast();
  const { data, error, reload } = useApiResource<AdminSubject[]>("/admin/assessments/subjects/");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/admin/assessments/${deleting.type === "subject" ? "subjects" : "topics"}/${deleting.item.id}/`);
      toast.success(`Deleted “${deleting.item.name}”.`);
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing({ type: "subject", subject: null })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New subject
        </Button>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {!data && !error ? (
        <TableSkeleton rows={3} />
      ) : data && data.length === 0 ? (
        <EmptyState icon={FolderTree} title="No subjects yet" description="Create subjects such as “Physics” or “Python programming”, then add topics to each." />
      ) : data ? (
        <ul className="flex flex-col gap-4">
          {data.map((s) => {
            const roots = s.topics.filter((t) => t.parent === null);
            return (
              <li key={s.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-navy">{s.name}</h2>
                      <p className="text-xs text-muted">
                        {s.slug} ·{" "}
                        <Link href={`/admin/assessments/questions?subject=${s.id}`} className="text-teal-700 hover:underline">
                          {s.question_count} question{s.question_count === 1 ? "" : "s"}
                        </Link>
                      </p>
                      {s.description && <p className="mt-1 max-w-2xl text-sm text-muted">{s.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setEditing({ type: "topic", subject: s, topic: null, parent: null })}>
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Topic
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Edit ${s.name}`} onClick={() => setEditing({ type: "subject", subject: s })}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} onClick={() => setDeleting({ type: "subject", item: s })}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  {roots.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">No topics yet.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
                      {roots.map((t) => (
                        <TopicRow
                          key={t.id}
                          topic={t}
                          subtopics={s.topics.filter((c) => c.parent === t.id)}
                          onEdit={(topic) => setEditing({ type: "topic", subject: s, topic })}
                          onAddChild={() => setEditing({ type: "topic", subject: s, topic: null, parent: t.id })}
                          onDelete={(topic) => setDeleting({ type: "topic", item: topic })}
                        />
                      ))}
                    </ul>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : null}

      {editing?.type === "subject" && (
        <SubjectDialog
          subject={editing.subject}
          onClose={() => setEditing(null)}
          onSaved={(created) => {
            toast.success(created ? "Subject created." : "Subject saved.");
            setEditing(null);
            reload();
          }}
        />
      )}
      {editing?.type === "topic" && (
        <TopicDialog
          subject={editing.subject}
          topic={editing.topic}
          parent={editing.parent ?? null}
          onClose={() => setEditing(null)}
          onSaved={(created) => {
            toast.success(created ? "Topic created." : "Topic saved.");
            setEditing(null);
            reload();
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.item.name ?? ""}”?`}
        description={
          deleting?.type === "subject"
            ? "A subject can only be deleted once it has no questions. Its topics are deleted with it."
            : "Questions in this topic keep their subject; their topic is cleared. Subtopics are deleted too."
        }
        confirmLabel="Delete"
        tone="danger"
        loading={busy}
        onConfirm={remove}
      />
    </div>
  );
}

function TopicRow({
  topic,
  subtopics,
  onEdit,
  onAddChild,
  onDelete,
}: {
  topic: AdminTopic;
  subtopics: AdminTopic[];
  onEdit: (t: AdminTopic) => void;
  onAddChild: () => void;
  onDelete: (t: AdminTopic) => void;
}) {
  const actions = (t: AdminTopic) => (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" aria-label={`Edit ${t.name}`} onClick={() => onEdit(t)}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Delete ${t.name}`} onClick={() => onDelete(t)}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
  return (
    <li className="px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-navy">
          {topic.name} <span className="text-xs font-normal text-muted">{topic.slug}</span>
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onAddChild}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Subtopic
          </Button>
          {actions(topic)}
        </div>
      </div>
      {subtopics.length > 0 && (
        <ul className="mt-1 flex flex-col">
          {subtopics.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 pl-6">
              <p className="text-sm text-body">
                <span className="text-muted">↳ </span>
                {c.name} <span className="text-xs text-muted">{c.slug}</span>
              </p>
              {actions(c)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

const subjectSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  slug: slugField(SLUG_MAX),
  position: z.coerce.number().int("Use a whole number.").min(0, "Use 0 or more.").max(1000),
  description: z.string().max(500),
});

function SubjectDialog({ subject, onClose, onSaved }: { subject: AdminSubject | null; onClose: () => void; onSaved: (created: boolean) => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(subject !== null);
  const form = useForm<z.input<typeof subjectSchema>, unknown, z.output<typeof subjectSchema>>({
    resolver: zodResolver(subjectSchema),
    defaultValues: { name: subject?.name ?? "", slug: subject?.slug ?? "", position: subject?.position ?? 0, description: subject?.description ?? "" },
  });
  const { register, handleSubmit, setValue, setError, formState } = form;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (subject) await api.patch(`/admin/assessments/subjects/${subject.id}/`, values);
      else await api.post("/admin/assessments/subjects/", values);
      onSaved(subject === null);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["name", "slug", "position", "description"]));
    }
  });

  const name = register("name");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={subject ? "Edit subject" : "New subject"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="subject-form" loading={formState.isSubmitting}>
            {subject ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="subject-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Name" htmlFor="subject-name" error={formState.errors.name?.message} required>
          <Input
            {...name}
            autoFocus
            maxLength={120}
            onChange={(e) => {
              void name.onChange(e);
              if (!slugTouched) setValue("slug", slugify(e.target.value, SLUG_MAX));
            }}
          />
        </Field>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Address" htmlFor="subject-slug" error={formState.errors.slug?.message} hint="Used in imports." required>
            <Input {...register("slug", { onChange: () => setSlugTouched(true) })} maxLength={SLUG_MAX} />
          </Field>
          <Field label="Position" htmlFor="subject-position" error={formState.errors.position?.message}>
            <Input type="number" min={0} max={1000} {...register("position")} />
          </Field>
        </div>
        <Field label="Description" htmlFor="subject-description" error={formState.errors.description?.message}>
          <Textarea {...register("description")} rows={3} maxLength={500} />
        </Field>
      </form>
    </Dialog>
  );
}

const topicSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  slug: slugField(SLUG_MAX),
  parent: z.string(),
  position: z.coerce.number().int("Use a whole number.").min(0, "Use 0 or more.").max(1000),
});

function TopicDialog({
  subject,
  topic,
  parent,
  onClose,
  onSaved,
}: {
  subject: AdminSubject;
  topic: AdminTopic | null;
  parent: number | null;
  onClose: () => void;
  onSaved: (created: boolean) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(topic !== null);
  const form = useForm<z.input<typeof topicSchema>, unknown, z.output<typeof topicSchema>>({
    resolver: zodResolver(topicSchema),
    defaultValues: {
      name: topic?.name ?? "",
      slug: topic?.slug ?? "",
      parent: String(topic ? (topic.parent ?? "") : (parent ?? "")),
      position: topic?.position ?? 0,
    },
  });
  const { register, handleSubmit, setValue, setError, formState } = form;
  // Two levels only: a topic with subtopics stays top-level.
  const hasChildren = topic ? subject.topics.some((t) => t.parent === topic.id) : false;
  const parents = subject.topics.filter((t) => t.parent === null && t.id !== topic?.id);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const body = { ...values, subject: subject.id, parent: values.parent ? Number(values.parent) : null };
    try {
      if (topic) await api.patch(`/admin/assessments/topics/${topic.id}/`, body);
      else await api.post("/admin/assessments/topics/", body);
      onSaved(topic === null);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["name", "slug", "parent", "position"]));
    }
  });

  const name = register("name");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={topic ? "Edit topic" : `New topic in ${subject.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="topic-form" loading={formState.isSubmitting}>
            {topic ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="topic-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Name" htmlFor="topic-name" error={formState.errors.name?.message} required>
          <Input
            {...name}
            autoFocus
            maxLength={120}
            onChange={(e) => {
              void name.onChange(e);
              if (!slugTouched) setValue("slug", slugify(e.target.value, SLUG_MAX));
            }}
          />
        </Field>
        <Field label="Address" htmlFor="topic-slug" error={formState.errors.slug?.message} hint="Unique within the subject." required>
          <Input {...register("slug", { onChange: () => setSlugTouched(true) })} maxLength={SLUG_MAX} />
        </Field>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Parent topic" htmlFor="topic-parent" error={formState.errors.parent?.message} hint={hasChildren ? "This topic has subtopics, so it stays top-level." : undefined}>
            <Select {...register("parent")} disabled={hasChildren}>
              <option value="">None (top level)</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Position" htmlFor="topic-position" error={formState.errors.position?.message}>
            <Input type="number" min={0} max={1000} {...register("position")} />
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
