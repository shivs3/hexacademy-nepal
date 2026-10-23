"use client";

import { Users } from "lucide-react";
import { useState } from "react";

import { LoadError, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { ATTENDANCE_LABEL } from "@/lib/live-classes";
import { formatDateTime } from "@/lib/utils";
import type { AttendanceStatus, RosterRow } from "@/types/live-classes";

type Entry = { status: AttendanceStatus | ""; note: string };
const STATUSES = Object.keys(ATTENDANCE_LABEL) as AttendanceStatus[];

/** Staff mark attendance; `joined_at` (the learner pressed Join) is shown as evidence only. */
export function AttendanceRoster({ sessionId, onSaved }: { sessionId: number; onSaved: () => void }) {
  const toast = useToast();
  const { data, error, reload, setData } = useApiResource<RosterRow[]>(`/admin/live-classes/sessions/${sessionId}/attendance/`);
  const [edits, setEdits] = useState<Record<number, Entry>>({});
  const [saving, setSaving] = useState(false);
  const dirty = Object.keys(edits).length > 0;

  const value = (r: RosterRow): Entry => edits[r.user.id] ?? { status: r.status, note: r.note };
  const edit = (r: RosterRow, patch: Partial<Entry>) => {
    const next = { ...value(r), ...patch };
    setEdits((e) => {
      const copy = { ...e };
      if (next.status === r.status && next.note === r.note) delete copy[r.user.id];
      else copy[r.user.id] = next;
      return copy;
    });
  };

  function markJoinedPresent() {
    if (!data) return;
    setEdits((e) => {
      const copy = { ...e };
      for (const r of data) {
        const cur = copy[r.user.id] ?? { status: r.status, note: r.note };
        if (r.joined_at && !cur.status) copy[r.user.id] = { ...cur, status: "present" };
      }
      return copy;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const entries = Object.entries(edits).map(([user, e]) => ({ user: Number(user), status: e.status, note: e.note.trim() }));
      setData(await api.put<RosterRow[]>(`/admin/live-classes/sessions/${sessionId}/attendance/`, { entries }));
      setEdits({});
      toast.success("Attendance saved.");
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data) return <TableSkeleton />;
  if (!data.length) return <EmptyState icon={Users} title="No learners" description="Add learners to the batch to take attendance." />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={markJoinedPresent} disabled={!data.some((r) => r.joined_at)}>
          Mark everyone who joined as present
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setEdits({})} disabled={saving}>
              Discard
            </Button>
          )}
          <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
            Save attendance
          </Button>
        </div>
      </div>
      <Card className="overflow-hidden">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={th}>Learner</th>
                <th scope="col" className={th}>Pressed join</th>
                <th scope="col" className={th}>Attendance</th>
                <th scope="col" className={th}>Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((r) => {
                const v = value(r);
                const name = r.user.full_name || r.user.email;
                return (
                  <tr key={r.user.id}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-navy">{name}</span>
                      <span className="block text-xs text-muted">{r.user.email}</span>
                      {!r.is_member && <Badge tone="warning" className="mt-1">No longer in batch</Badge>}
                    </td>
                    <td className="px-4 py-3 text-muted">{r.joined_at ? formatDateTime(r.joined_at) : "—"}</td>
                    <td className="px-4 py-3">
                      <Select aria-label={`Attendance for ${name}`} value={v.status} onChange={(e) => edit(r, { status: e.target.value as Entry["status"] })}>
                        <option value="">Not marked</option>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {ATTENDANCE_LABEL[s]}
                          </option>
                        ))}
                      </Select>
                      {r.marked_by_name && r.marked_at && !edits[r.user.id] && (
                        <span className="mt-1 block text-xs text-muted">
                          by {r.marked_by_name}, {formatDateTime(r.marked_at)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Input aria-label={`Note for ${name}`} value={v.note} maxLength={300} onChange={(e) => edit(r, { note: e.target.value })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
