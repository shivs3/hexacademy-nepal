"use client";

import { ArrowLeft, Inbox, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { RichText } from "@/components/cms/rich-text";
import { LoadError, Pager, SearchBox, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert, Badge, EmptyState, PageHeader, Skeleton } from "@/components/ui/feedback";
import { Select } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { SUBMISSION_BADGE } from "@/lib/assignments";
import { formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { AdminAssignment, AdminSubmission } from "@/types/assignments";

import { AssignmentDialog } from "./assignment-dialog";
import { GradeDialog } from "./grade-dialog";

export function AssignmentDetail({ assignmentId }: { assignmentId: number }) {
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: a, error, reload, setData } = useApiResource<AdminAssignment>(`/admin/learning/assignments/${assignmentId}/`);

  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/admin/learning/assignments/${assignmentId}/`);
      toast.success("Assignment deleted.");
      router.push("/admin/learning/assignments");
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
      setDeleting(false);
    }
  }

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!a) return <Skeleton className="h-64" />;
  const total = a.submitted_count + a.graded_count + a.returned_count;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/learning/assignments" className="inline-flex items-center gap-1 text-sm text-muted hover:text-navy">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All assignments
      </Link>
      <PageHeader
        title={a.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{a.course.title}</span>
            {a.lesson && <span>{a.lesson.title}</span>}
            <span>{a.due_at ? `Due ${formatDateTime(a.due_at)}` : "No due date"}</span>
            <span>{a.max_points} points</span>
            <Badge tone={a.is_published ? "success" : "neutral"}>{a.is_published ? "Published" : "Draft"}</Badge>
          </span>
        }
        actions={
          a.can_edit ? (
            <Menu
              trigger={
                <Button variant="outline" size="icon" aria-label="Assignment actions">
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              }
            >
              <MenuItem onSelect={() => setEditing(true)}>Edit</MenuItem>
              {total === 0 && (
                <MenuItem onSelect={() => setDeleting(true)} danger>
                  Delete
                </MenuItem>
              )}
            </Menu>
          ) : undefined
        }
      />

      {a.instructions && (
        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardBody>
            <RichText html={a.instructions} />
          </CardBody>
        </Card>
      )}

      {a.can_grade ? (
        <SubmissionsPanel assignment={a} onChange={reload} />
      ) : (
        <Alert tone="info">
          {total} submission{total === 1 ? "" : "s"} so far. Only the course&apos;s instructors and teaching assistants read and grade learners&apos;
          work.
        </Alert>
      )}

      {editing && (
        <AssignmentDialog
          assignment={a}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            setData(saved);
            toast.success("Assignment saved.");
          }}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={(o) => !busy && setDeleting(o)}
        title="Delete this assignment?"
        description="It has no submissions. This cannot be undone. Once learners hand in work, unpublish it instead."
        confirmLabel="Delete"
        tone="danger"
        loading={busy}
        onConfirm={remove}
      />
    </div>
  );
}

function SubmissionsPanel({ assignment, onChange }: { assignment: AdminAssignment; onChange: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState("submitted");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AdminSubmission | null>(null);
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<AdminSubmission>>(`/admin/learning/assignments/${assignment.id}/submissions/`, {
    status,
    search: q,
    page,
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>
          Submissions
          <span className="ml-2 text-sm font-normal text-muted">
            {assignment.submitted_count} to review · {assignment.returned_count} returned · {assignment.graded_count} graded
          </span>
        </CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            label="Search learners"
            placeholder="Learner name or email"
          />
          <Select
            aria-label="Submission status"
            className="sm:w-auto"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="submitted">To review</option>
            <option value="returned">Returned</option>
            <option value="graded">Graded</option>
            <option value="">All</option>
          </Select>
        </div>
      </CardHeader>
      {error && (
        <div className="p-4">
          <LoadError message={error} onRetry={reload} />
        </div>
      )}
      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Inbox} title="No submissions here" description={status === "submitted" ? "Nothing is waiting for review." : undefined} />
      ) : data ? (
        <>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Learner</th>
                  <th scope="col" className={th}>Submitted</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={`${th} text-right`}>Points</th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-navy">{s.user.full_name || s.user.email}</span>
                      <span className="block text-xs text-muted">{s.user.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      {formatDateTime(s.submitted_at)}
                      <span className="block text-xs text-muted">
                        Attempt {s.attempt}
                        {s.is_late && " · late"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={SUBMISSION_BADGE[s.status].tone}>{SUBMISSION_BADGE[s.status].label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.points ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant={s.status === "submitted" ? "primary" : "outline"} onClick={() => setOpen(s)}>
                        {s.status === "submitted" ? "Review" : "Open"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager data={data} onPage={setPage} />
        </>
      ) : null}
      {open && (
        <GradeDialog
          submission={open}
          maxPoints={assignment.max_points}
          onClose={() => setOpen(null)}
          onSaved={(_, outcome) => {
            setOpen(null);
            toast.success(outcome === "graded" ? "Grade saved. The learner has been notified." : "Returned for revision. The learner has been notified.");
            reload();
            onChange();
          }}
        />
      )}
    </Card>
  );
}
