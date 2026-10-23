"use client";

import { MoreHorizontal, UserPlus, Users } from "lucide-react";
import { useState } from "react";

import { LoadError, Pager, SearchBox, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { parseEmails } from "@/lib/live-classes";
import { formatDate } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { AddMembersResult, Batch, BatchMember } from "@/types/live-classes";

function summarize(r: AddMembersResult): string {
  const parts = [`${r.added} added`];
  if (r.already_members) parts.push(`${r.already_members} already in the batch`);
  return parts.join(", ") + ".";
}

export function MembersPanel({ batch, onChanged }: { batch: Batch; onChanged: () => void }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<BatchMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<AddMembersResult | null>(null);
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<BatchMember>>(`/admin/live-classes/batches/${batch.id}/members/`, {
    search: q,
    page,
  });
  const canManage = batch.can_schedule && batch.status === "active";
  const full = batch.capacity !== null && batch.member_count >= batch.capacity;

  function afterAdd(result: AddMembersResult) {
    setLastResult(result);
    toast.success(summarize(result));
    reload();
    onChanged();
  }

  async function addAllEnrolled() {
    setBusy(true);
    try {
      afterAdd(await api.post<AddMembersResult>(`/admin/live-classes/batches/${batch.id}/members/`, { all_enrolled: true }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`/admin/live-classes/batches/${batch.id}/members/${removing.id}/`);
      toast.success(`${removing.user.full_name || removing.user.email} removed.`);
      setRemoving(null);
      reload();
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search members"
          placeholder="Name or email"
        />
        {canManage && (
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={addAllEnrolled} loading={busy && !removing} disabled={full}>
              Add all enrolled
            </Button>
            <Button onClick={() => setAdding(true)} disabled={full}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add by email
            </Button>
          </div>
        )}
      </div>
      {full && canManage && <Alert tone="info">This batch is full ({batch.capacity} learners). Raise its capacity to add more.</Alert>}
      {lastResult && (lastResult.not_enrolled.length > 0 || lastResult.unknown.length > 0) && (
        <Alert tone="warning" title="Some people were not added">
          {lastResult.not_enrolled.length > 0 && <p>Not enrolled in {batch.course.title}: {lastResult.not_enrolled.join(", ")}</p>}
          {lastResult.unknown.length > 0 && <p>No account found: {lastResult.unknown.join(", ")}</p>}
        </Alert>
      )}

      {error && <LoadError message={error} onRetry={reload} />}
      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? "No members match" : "No learners in this batch"}
          description={q ? undefined : "Only learners actively enrolled in the course can be added."}
        />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Learner</th>
                  <th scope="col" className={th}>Enrollment</th>
                  <th scope="col" className={th}>Added</th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-navy">{m.user.full_name || m.user.email}</span>
                      <span className="block text-xs text-muted">{m.user.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      {m.enrolled ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Not active — no class access</Badge>}
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(m.added_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {batch.can_schedule && (
                        <Menu
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${m.user.email}`}>
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          }
                        >
                          <MenuItem danger onSelect={() => setRemoving(m)}>
                            Remove from batch
                          </MenuItem>
                        </Menu>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager data={data} onPage={setPage} />
        </Card>
      ) : null}

      {adding && (
        <AddByEmailDialog
          batchId={batch.id}
          onClose={() => setAdding(false)}
          onAdded={(r) => {
            setAdding(false);
            afterAdd(r);
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && !busy && setRemoving(null)}
        title="Remove from batch?"
        description={`${removing?.user.email ?? ""} will stop seeing this batch's classes. Their course enrollment and past attendance are kept.`}
        confirmLabel="Remove"
        tone="danger"
        loading={busy}
        onConfirm={remove}
      />
    </div>
  );
}

function AddByEmailDialog({ batchId, onClose, onAdded }: { batchId: number; onClose: () => void; onAdded: (r: AddMembersResult) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const emails = parseEmails(text);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!emails.length) return setError("Enter at least one email address.");
    if (emails.length > 200) return setError("Add at most 200 at a time.");
    setSaving(true);
    setError(null);
    try {
      onAdded(await api.post<AddMembersResult>(`/admin/live-classes/batches/${batchId}/members/`, { emails }));
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !saving && onClose()}
      title="Add learners by email"
      description="Each person must have an account and an active enrollment in this course."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="add-members-form" loading={saving} disabled={!emails.length}>
            {emails.length > 1 ? `Add ${emails.length} learners` : "Add learner"}
          </Button>
        </>
      }
    >
      <form id="add-members-form" onSubmit={save} noValidate>
        <Field label="Email addresses" htmlFor="member-emails" error={error ?? undefined} hint="Separate with commas, spaces or new lines.">
          <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </Field>
      </form>
    </Dialog>
  );
}
