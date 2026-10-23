"use client";

import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LoadError } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge, PageHeader, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { ATTENDANCE_LABEL, STATE_BADGE, timeRange } from "@/lib/live-classes";
import { formatDateTime } from "@/lib/utils";
import type { AdminSession, AttendanceStatus } from "@/types/live-classes";

import { AttendanceRoster } from "./attendance-roster";
import { CancelDialog } from "./sessions-panel";
import { SessionDialog } from "./session-dialog";

type Summary = Record<AttendanceStatus, number> & { joined: number };

export function SessionDetail({ sessionId }: { sessionId: number }) {
  const toast = useToast();
  const { data: s, error, reload, setData } = useApiResource<AdminSession>(`/admin/live-classes/sessions/${sessionId}/`);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [summaryKey, setSummaryKey] = useState(0);

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!s) return <Skeleton className="h-64" />;
  const badge = STATE_BADGE[s.state];
  const active = s.status === "scheduled";

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/admin/live-classes/${s.batch.id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-navy">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {s.batch.name}
      </Link>
      <PageHeader
        title={s.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={badge.tone}>{badge.label}</Badge>
            <span>{timeRange(s.starts_at, s.ends_at)} (Nepal time)</span>
            <span>{s.course.title}</span>
          </span>
        }
        actions={
          s.can_schedule && active && s.state !== "ended" ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
              {s.state === "upcoming" && (
                <Button variant="danger" onClick={() => setCancelling(true)}>
                  Cancel class
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {!active && (
        <Alert tone="warning" title="Cancelled">
          {formatDateTime(s.cancelled_at ?? s.starts_at)}
          {s.cancel_reason && ` — ${s.cancel_reason}`}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Detail label="Instructor">{s.instructor?.full_name || "Not assigned"}</Detail>
              <Detail label="Provider">{s.provider_label}</Detail>
              {s.join_url ? (
                <Detail label="Meeting link">
                  <a href={s.join_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-teal-700 hover:underline">
                    {s.join_url}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </a>
                </Detail>
              ) : (
                <Detail label="Meeting link">
                  <span className="text-muted">Visible to the teaching team only</span>
                </Detail>
              )}
              {s.passcode && <Detail label="Passcode">{s.passcode}</Detail>}
              {s.original_starts_at && <Detail label="Originally">{formatDateTime(s.original_starts_at)}</Detail>}
              <Detail label="Reminder">{s.reminder_sent_at ? `Sent ${formatDateTime(s.reminder_sent_at)}` : "Sent 1 hour before the class"}</Detail>
              {s.description && (
                <div className="sm:col-span-2">
                  <Detail label="Description">
                    <span className="whitespace-pre-line">{s.description}</span>
                  </Detail>
                </div>
              )}
            </dl>
          </CardBody>
        </Card>
        {s.can_take_attendance && <SummaryCard key={summaryKey} sessionId={s.id} />}
      </div>

      {s.can_schedule && active && <AfterClassForm session={s} onSaved={setData} />}

      {s.can_take_attendance && active && (
        <section aria-labelledby="attendance-heading" className="flex flex-col gap-3">
          <h2 id="attendance-heading" className="text-lg font-semibold">
            Attendance
          </h2>
          {s.state === "upcoming" ? (
            <p className="text-sm text-muted">Attendance can be marked once the class starts.</p>
          ) : (
            <AttendanceRoster sessionId={s.id} onSaved={() => setSummaryKey((k) => k + 1)} />
          )}
        </section>
      )}

      {editing && (
        <SessionDialog
          batchId={s.batch.id}
          session={s}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast.success("Class updated.");
            reload();
          }}
        />
      )}
      {cancelling && (
        <CancelDialog
          session={s}
          onClose={() => setCancelling(false)}
          onDone={(updated) => {
            setCancelling(false);
            setData(updated);
            toast.success("Class cancelled. Learners have been notified.");
          }}
        />
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

function SummaryCard({ sessionId }: { sessionId: number }) {
  const { data } = useApiResource<Summary>(`/admin/live-classes/sessions/${sessionId}/attendance-summary/`);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance</CardTitle>
      </CardHeader>
      <CardBody>
        {data ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {(Object.keys(ATTENDANCE_LABEL) as AttendanceStatus[]).map((k) => (
              <div key={k}>
                <dt className="text-muted">{ATTENDANCE_LABEL[k]}</dt>
                <dd className="text-xl font-semibold tabular-nums text-navy">{data[k]}</dd>
              </div>
            ))}
            <div className="col-span-2 border-t border-line pt-3">
              <dt className="text-muted">Pressed join</dt>
              <dd className="text-xl font-semibold tabular-nums text-navy">{data.joined}</dd>
            </div>
          </dl>
        ) : (
          <Skeleton className="h-32" />
        )}
      </CardBody>
    </Card>
  );
}

function AfterClassForm({ session, onSaved }: { session: AdminSession; onSaved: (s: AdminSession) => void }) {
  const toast = useToast();
  const [recording, setRecording] = useState(session.recording_url);
  const [notes, setNotes] = useState(session.notes);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty = recording !== session.recording_url || notes !== session.notes;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const url = recording.trim();
    if (url && !/^https:\/\/\S+$/.test(url)) return setErrors({ recording_url: "Use an https:// link." });
    setErrors({});
    setSaving(true);
    try {
      const updated = await api.patch<AdminSession>(`/admin/live-classes/sessions/${session.id}/`, { recording_url: url, notes: notes.trim() });
      onSaved(updated);
      setRecording(updated.recording_url);
      setNotes(updated.notes);
      toast.success(url && url !== session.recording_url ? "Saved. Learners have been told the recording is ready." : "Saved.");
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setErrors(fields);
      if (!Object.keys(fields).length) toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recording and notes</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <p className="text-sm text-muted">Learners in the batch see these after the class ends. Recordings are not fetched from Meet or Zoom automatically; paste a link you have shared.</p>
          <Field label="Recording link" htmlFor="session-recording" error={errors.recording_url}>
            <Input type="url" value={recording} maxLength={500} onChange={(e) => setRecording(e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Notes for learners" htmlFor="session-notes" error={errors.notes}>
            <Textarea rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div>
            <Button type="submit" loading={saving} disabled={!dirty}>
              Save
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
