"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { Batch, BatchStatus, ScheduleCourseOption } from "@/types/live-classes";

type Draft = { course: string; name: string; description: string; starts_on: string; ends_on: string; capacity: string; status: BatchStatus };

function toDraft(b: Batch | null): Draft {
  return {
    course: b ? String(b.course.id) : "",
    name: b?.name ?? "",
    description: b?.description ?? "",
    starts_on: b?.starts_on ?? "",
    ends_on: b?.ends_on ?? "",
    capacity: b?.capacity != null ? String(b.capacity) : "",
    status: b?.status ?? "active",
  };
}

function check(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.course) e.course = "Choose a course.";
  if (!d.name.trim()) e.name = "Give the batch a name.";
  if (d.capacity && !/^[1-9]\d{0,4}$/.test(d.capacity)) e.capacity = "A whole number, at least 1.";
  if (d.starts_on && d.ends_on && d.ends_on < d.starts_on) e.ends_on = "Must be on or after the start date.";
  return e;
}

export function BatchDialog({ batch, onClose, onSaved }: { batch: Batch | null; onClose: () => void; onSaved: (b: Batch, created: boolean) => void }) {
  const [draft, setDraft] = useState(() => toDraft(batch));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const courses = useApiResource<ScheduleCourseOption[]>(batch ? null : "/admin/live-classes/courses/");
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const found = check(draft);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    const body = {
      ...(batch ? {} : { course: Number(draft.course) }),
      name: draft.name.trim(),
      description: draft.description.trim(),
      starts_on: draft.starts_on || null,
      ends_on: draft.ends_on || null,
      capacity: draft.capacity ? Number(draft.capacity) : null,
      status: draft.status,
    };
    setSaving(true);
    try {
      const saved = batch
        ? await api.patch<Batch>(`/admin/live-classes/batches/${batch.id}/`, body)
        : await api.post<Batch>("/admin/live-classes/batches/", body);
      onSaved(saved, !batch);
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
      title={batch ? `Edit ${batch.name}` : "New batch"}
      description="A batch is a group of enrolled learners who attend the same live classes."
      className="max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="batch-form" loading={saving}>
            {batch ? "Save batch" : "Create batch"}
          </Button>
        </>
      }
    >
      <form id="batch-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
        {formError && (
          <div className="sm:col-span-2">
            <Alert tone="danger">{formError}</Alert>
          </div>
        )}
        {batch ? (
          <p className="text-sm text-muted sm:col-span-2">
            Course: <span className="font-medium text-navy">{batch.course.title}</span>
          </p>
        ) : (
          <Field label="Course" htmlFor="batch-course" error={errors.course ?? courses.error ?? undefined} required className="sm:col-span-2">
            {courses.data ? (
              <Select value={draft.course} onChange={(e) => update({ course: e.target.value })}>
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
        {!batch && courses.data?.length === 0 && (
          <p className="text-sm text-muted sm:col-span-2">You are not an instructor on any course yet, so you cannot create batches.</p>
        )}
        <Field label="Name" htmlFor="batch-name" error={errors.name} hint="For example “Morning cohort, Kartik 2083”." required className="sm:col-span-2">
          <Input value={draft.name} maxLength={120} onChange={(e) => update({ name: e.target.value })} autoFocus={Boolean(batch)} />
        </Field>
        <Field label="Starts on" htmlFor="batch-starts" error={errors.starts_on} hint="Optional.">
          <Input type="date" value={draft.starts_on} onChange={(e) => update({ starts_on: e.target.value })} />
        </Field>
        <Field label="Ends on" htmlFor="batch-ends" error={errors.ends_on} hint="Optional.">
          <Input type="date" value={draft.ends_on} onChange={(e) => update({ ends_on: e.target.value })} />
        </Field>
        <Field label="Capacity" htmlFor="batch-capacity" error={errors.capacity} hint="Empty for no limit.">
          <Input inputMode="numeric" value={draft.capacity} onChange={(e) => update({ capacity: e.target.value.trim() })} />
        </Field>
        {batch && (
          <Field label="Status" htmlFor="batch-status" error={errors.status} hint="Archived batches cannot get new classes or members.">
            <Select value={draft.status} onChange={(e) => update({ status: e.target.value as BatchStatus })}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
        )}
        <Field label="Description" htmlFor="batch-description" error={errors.description} className="sm:col-span-2">
          <Textarea rows={2} maxLength={500} value={draft.description} onChange={(e) => update({ description: e.target.value })} />
        </Field>
      </form>
    </Dialog>
  );
}
