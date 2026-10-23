"use client";

import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LoadError, Pager, SearchBox, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Checkbox, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { AdminAssignment } from "@/types/assignments";

import { AssignmentDialog } from "./assignment-dialog";

export function AssignmentsList({ canCreate }: { canCreate: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [needsGrading, setNeedsGrading] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<AdminAssignment>>("/admin/learning/assignments/", {
    search: q,
    needs_grading: needsGrading ? "true" : undefined,
    page,
  });
  const filtered = Boolean(q) || needsGrading;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search assignments"
          placeholder="Assignment or course"
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="assignments-needs-grading"
            checked={needsGrading}
            onChange={(e) => {
              setNeedsGrading(e.target.checked);
              setPage(1);
            }}
          />
          <Label htmlFor="assignments-needs-grading" className="font-normal">
            Waiting for review
          </Label>
        </div>
        {canCreate && (
          <Button onClick={() => setCreating(true)} className="sm:ml-auto">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New assignment
          </Button>
        )}
      </div>

      {error && <LoadError message={error} onRetry={reload} />}
      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={filtered ? "No assignments match" : "No assignments yet"}
          description={filtered ? undefined : "Assignments belong to a course. Learners hand in a written answer, a file, or both."}
        />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Assignment</th>
                  <th scope="col" className={th}>Course</th>
                  <th scope="col" className={th}>Due</th>
                  <th scope="col" className={`${th} text-right`}>To review</th>
                  <th scope="col" className={`${th} text-right`}>Graded</th>
                  <th scope="col" className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/learning/assignments/${a.id}`} className="font-medium text-navy hover:text-teal-700">
                        {a.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{a.course.title}</td>
                    <td className="px-4 py-3">{a.due_at ? formatDateTime(a.due_at) : <span className="text-muted">None</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {a.submitted_count ? <Badge tone="teal">{a.submitted_count}</Badge> : <span className="text-muted">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{a.graded_count}</td>
                    <td className="px-4 py-3">
                      <Badge tone={a.is_published ? "success" : "neutral"}>{a.is_published ? "Published" : "Draft"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager data={data} onPage={setPage} />
        </Card>
      ) : null}

      {creating && (
        <AssignmentDialog
          assignment={null}
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setCreating(false);
            toast.success(`${saved.title} created.`);
            router.push(`/admin/learning/assignments/${saved.id}`);
          }}
        />
      )}
    </div>
  );
}
