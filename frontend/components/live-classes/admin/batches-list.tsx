"use client";

import { CalendarClock, Plus } from "lucide-react";
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
import type { Batch } from "@/types/live-classes";

import { BatchDialog } from "./batch-dialog";

export function BatchesList({ canCreate }: { canCreate: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<Batch>>("/admin/live-classes/batches/", {
    search: q,
    status: showArchived ? undefined : "active",
    page,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search batches"
          placeholder="Batch or course name"
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="batches-archived"
            checked={showArchived}
            onChange={(e) => {
              setShowArchived(e.target.checked);
              setPage(1);
            }}
          />
          <Label htmlFor="batches-archived" className="font-normal">
            Include archived
          </Label>
        </div>
        {canCreate && (
          <Button onClick={() => setCreating(true)} className="sm:ml-auto">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New batch
          </Button>
        )}
      </div>

      {error && <LoadError message={error} onRetry={reload} />}
      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={q ? "No batches match" : "No batches yet"}
          description={q ? undefined : "Create a batch for a course, add its enrolled learners, then schedule Google Meet or Zoom classes."}
        />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Batch</th>
                  <th scope="col" className={th}>Course</th>
                  <th scope="col" className={`${th} text-right`}>Learners</th>
                  <th scope="col" className={th}>Next class</th>
                  <th scope="col" className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/live-classes/${b.id}`} className="font-medium text-navy hover:text-teal-700">
                        {b.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{b.course.title}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {b.member_count}
                      {b.capacity !== null && ` / ${b.capacity}`}
                    </td>
                    <td className="px-4 py-3">
                      {b.next_session_at ? formatDateTime(b.next_session_at) : <span className="text-muted">None scheduled</span>}
                      {b.upcoming_count > 1 && <span className="block text-xs text-muted">{b.upcoming_count} upcoming</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={b.status === "active" ? "success" : "neutral"}>{b.status === "active" ? "Active" : "Archived"}</Badge>
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
        <BatchDialog
          batch={null}
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setCreating(false);
            toast.success(`${saved.name} created.`);
            router.push(`/admin/live-classes/${saved.id}`);
          }}
        />
      )}
    </div>
  );
}
