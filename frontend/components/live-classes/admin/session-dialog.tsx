"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { fromNepalInput, minutesBetween, toNepalInput } from "@/lib/live-classes";
import type { AdminSession, MeetingProvider, TeamMember } from "@/types/live-classes";

type Draft = {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  instructor: string;
  provider: MeetingProvider;
  join_url: string;
  passcode: string;
  repeat_weeks: string;
};

function toDraft(s: AdminSession | null): Draft {
  return {
    title: s?.title ?? "",
    description: s?.description ?? "",
    starts_at: s ? toNepalInput(s.starts_at) : "",
    ends_at: s ? toNepalInput(s.ends_at) : "",
    instructor: s?.instructor ? String(s.instructor.id) : "",
    provider: s?.provider ?? "google_meet",
    join_url: s?.join_url ?? "",
    passcode: s?.passcode ?? "",
    repeat_weeks: "1",
  };
}

function check(d: Draft, creating: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.title.trim()) e.title = "Give the class a title.";
  if (!fromNepalInput(d.starts_at)) e.starts_at = "Choose a start date and time.";
  if (!fromNepalInput(d.ends_at)) e.ends_at = "Choose an end date and time.";
  const mins = minutesBetween(d.starts_at, d.ends_at);
  if (mins !== null && mins <= 0) e.ends_at = "Must be after the start.";
  if (!/^https:\/\/\S+$/.test(d.join_url.trim())) e.join_url = "Paste the full https:// meeting link.";
  if (creating && !/^([1-9]|1\d|2[0-6])$/.test(d.repeat_weeks)) e.repeat_weeks = "Between 1 and 26.";
  return e;
}

/** Schedule classes for a batch (`session` null) or edit one class. Times are entered in Nepal time. */
export function SessionDialog({
  batchId,
  session,
  onClose,
  onSaved,
}: {
  batchId: number;
  session: AdminSession | null;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const creating = !session;
  const started = session ? session.state !== "upcoming" : false;
  const [draft, setDraft] = useState(() => toDraft(session));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const team = useApiResource<TeamMember[]>(`/admin/live-classes/batches/${batchId}/team/`);
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const duration = (() => {
    const m = minutesBetween(draft.starts_at, draft.ends_at);
    return m && m > 0 ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)} h ` : ""}${m % 60 ? `${m % 60} min` : ""}`.trim() : null;
  })();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const found = check(draft, creating);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    const body: Record<string, unknown> = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      instructor: draft.instructor ? Number(draft.instructor) : null,
      provider: draft.provider,
      join_url: draft.join_url.trim(),
      passcode: draft.passcode.trim(),
    };
    if (!started) {
      body.starts_at = fromNepalInput(draft.starts_at);
      body.ends_at = fromNepalInput(draft.ends_at);
    }
    setSaving(true);
    try {
      if (session) {
        await api.patch<AdminSession>(`/admin/live-classes/sessions/${session.id}/`, body);
        onSaved(1);
      } else {
        const made = await api.post<AdminSession[]>("/admin/live-classes/sessions/", {
          ...body,
          batch: batchId,
          repeat_weeks: Number(draft.repeat_weeks),
        });
        onSaved(made.length);
      }
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
      title={session ? "Edit class" : "Schedule a class"}
      description={
        session
          ? "Learners are notified when the time changes."
          : "Create the meeting in Google Meet or Zoom first, then paste its link here. Learners see the link only when the class opens, 15 minutes before it starts."
      }
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="session-form" loading={saving}>
            {session ? "Save class" : Number(draft.repeat_weeks) > 1 ? `Schedule ${draft.repeat_weeks} classes` : "Schedule class"}
          </Button>
        </>
      }
    >
      <form id="session-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
        {formError && (
          <div className="sm:col-span-2">
            <Alert tone="danger">{formError}</Alert>
          </div>
        )}
        <Field label="Title" htmlFor="session-title" error={errors.title} required className="sm:col-span-2">
          <Input value={draft.title} maxLength={creating ? 140 : 160} onChange={(e) => update({ title: e.target.value })} />
        </Field>
        {started && (
          <div className="sm:col-span-2">
            <Alert tone="info">This class has started, so its time can no longer change.</Alert>
          </div>
        )}
        <Field label="Starts (Nepal time)" htmlFor="session-starts" error={errors.starts_at} required>
          <Input
            type="datetime-local"
            value={draft.starts_at}
            disabled={started}
            onChange={(e) => {
              const v = e.target.value;
              // Keep the length when moving the start of a class that already has an end.
              const len = minutesBetween(draft.starts_at, draft.ends_at);
              const next = fromNepalInput(v);
              if (next && len && len > 0) {
                update({ starts_at: v, ends_at: toNepalInput(new Date(Date.parse(next) + len * 60_000).toISOString()) });
              } else if (next && !draft.ends_at) {
                update({ starts_at: v, ends_at: toNepalInput(new Date(Date.parse(next) + 60 * 60_000).toISOString()) });
              } else {
                update({ starts_at: v });
              }
            }}
          />
        </Field>
        <Field label="Ends (Nepal time)" htmlFor="session-ends" error={errors.ends_at} hint={duration ?? undefined} required>
          <Input type="datetime-local" value={draft.ends_at} disabled={started} onChange={(e) => update({ ends_at: e.target.value })} />
        </Field>
        {creating && (
          <Field label="Repeat weekly" htmlFor="session-repeat" error={errors.repeat_weeks} hint="Number of weekly classes, same time each week. 1 for a single class.">
            <Input inputMode="numeric" value={draft.repeat_weeks} onChange={(e) => update({ repeat_weeks: e.target.value.trim() })} />
          </Field>
        )}
        <Field label="Instructor" htmlFor="session-instructor" error={errors.instructor ?? team.error ?? undefined}>
          <Select value={draft.instructor} onChange={(e) => update({ instructor: e.target.value })} disabled={!team.data}>
            <option value="">Not assigned</option>
            {team.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.email}
                {m.role === "teaching_assistant" ? " (TA)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Provider" htmlFor="session-provider" error={errors.provider} required>
          <Select value={draft.provider} onChange={(e) => update({ provider: e.target.value as MeetingProvider })}>
            <option value="google_meet">Google Meet</option>
            <option value="zoom">Zoom</option>
          </Select>
        </Field>
        <Field
          label="Meeting link"
          htmlFor="session-link"
          error={errors.join_url}
          hint={draft.provider === "zoom" ? "For example https://us02web.zoom.us/j/…" : "For example https://meet.google.com/abc-defg-hij"}
          required
          className="sm:col-span-2"
        >
          <Input type="url" value={draft.join_url} maxLength={500} onChange={(e) => update({ join_url: e.target.value })} />
        </Field>
        <Field label="Passcode" htmlFor="session-passcode" error={errors.passcode} hint="Optional. Shown to learners when they join.">
          <Input value={draft.passcode} maxLength={50} autoComplete="off" onChange={(e) => update({ passcode: e.target.value })} />
        </Field>
        <Field label="Description" htmlFor="session-description" error={errors.description} className="sm:col-span-2">
          <Textarea rows={2} maxLength={1000} value={draft.description} onChange={(e) => update({ description: e.target.value })} />
        </Field>
      </form>
    </Dialog>
  );
}
