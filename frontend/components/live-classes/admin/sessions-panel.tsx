"use client";

import { CalendarPlus, MoreHorizontal, Video } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LoadError, Pager, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { STATE_BADGE, timeRange } from "@/lib/live-classes";
import { cn } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { AdminSession, Batch } from "@/types/live-classes";

import { SessionDialog } from "./session-dialog";

type Scope = "upcoming" | "past";

export function SessionsPanel({ batch }: { batch: Batch }) {
  const toast = useToast();
  const [scope, setScope] = useState<Scope>("upcoming");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminSession | "new" | null>(null);
  const [cancelling, setCancelling] = useState<AdminSession | null>(null);
  const { data, error, reload } = useApiResource<Paginated<AdminSession>>("/admin/live-classes/sessions/", {
    batch: batch.id,
    scope,
    page,
  });
  const archived = batch.status === "archived";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-line p-0.5" role="group" aria-label="Which classes">
          {(["upcoming", "past"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scope === s}
              onClick={() => {
                setScope(s);
                setPage(1);
              }}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal",
                scope === s ? "bg-navy text-white" : "text-muted hover:text-navy",
              )}
            >
              {s === "upcoming" ? "Upcoming" : "Past"}
            </button>
          ))}
        </div>
        {batch.can_schedule && (
          <Button
            className="ml-auto"
            onClick={() => setEditing("new")}
            disabled={archived}
            title={archived ? "Archived batches cannot get new classes." : undefined}
          >
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            Schedule class
          </Button>
        )}
      </div>

      {error && <LoadError message={error} onRetry={reload} />}
      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={Video}
          title={scope === "upcoming" ? "No upcoming classes" : "No past classes"}
          description={scope === "upcoming" && batch.can_schedule && !archived ? "Schedule a single class or a weekly series." : undefined}
        />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Class</th>
                  <th scope="col" className={th}>When (Nepal time)</th>
                  <th scope="col" className={th}>Instructor</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((s) => {
                  const badge = STATE_BADGE[s.state];
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-3">
                        <Link href={`/admin/live-classes/sessions/${s.id}`} className="font-medium text-navy hover:text-teal-700">
                          {s.title}
                        </Link>
                        <span className="block text-xs text-muted">{s.provider_label}</span>
                      </td>
                      <td className="px-4 py-3">
                        {timeRange(s.starts_at, s.ends_at)}
                        {s.original_starts_at && <span className="block text-xs text-muted">Rescheduled</span>}
                      </td>
                      <td className="px-4 py-3 text-muted">{s.instructor?.full_name || "Not assigned"}</td>
                      <td className="px-4 py-3">
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.can_schedule && s.status === "scheduled" && s.state !== "ended" && (
                          <Menu
                            trigger={
                              <Button variant="ghost" size="icon" aria-label={`Actions for ${s.title}`}>
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            }
                          >
                            <MenuItem onSelect={() => setEditing(s)}>Edit</MenuItem>
                            <MenuItem danger disabled={s.state !== "upcoming"} onSelect={() => setCancelling(s)}>
                              Cancel class
                            </MenuItem>
                          </Menu>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager data={data} onPage={setPage} />
        </Card>
      ) : null}

      {editing && (
        <SessionDialog
          batchId={batch.id}
          session={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(count) => {
            const created = editing === "new";
            setEditing(null);
            toast.success(created ? (count > 1 ? `${count} classes scheduled.` : "Class scheduled.") : "Class updated.");
            reload();
          }}
        />
      )}
      {cancelling && (
        <CancelDialog
          session={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setCancelling(null);
            toast.success("Class cancelled. Learners have been notified.");
            reload();
          }}
        />
      )}
    </div>
  );
}

export function CancelDialog({ session, onClose, onDone }: { session: AdminSession; onClose: () => void; onDone: (s: AdminSession) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      onDone(await api.post<AdminSession>(`/admin/live-classes/sessions/${session.id}/cancel/`, { reason: reason.trim() }));
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !saving && onClose()}
      title={`Cancel “${session.title}”?`}
      description="Learners in the batch are notified. A cancelled class cannot be restored; schedule a new one instead."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Keep class
          </Button>
          <Button variant="danger" onClick={confirm} loading={saving}>
            Cancel class
          </Button>
        </>
      }
    >
      <Field label="Reason" htmlFor="cancel-reason" error={error ?? undefined} hint="Optional. Shown to learners.">
        <Textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Dialog>
  );
}
