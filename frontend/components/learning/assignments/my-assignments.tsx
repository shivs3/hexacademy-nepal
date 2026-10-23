"use client";

import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LoadError, Pager } from "@/components/cms/admin/list-parts";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Label, Select } from "@/components/ui/input";
import { useApiResource } from "@/hooks/use-api-resource";
import { learnerState } from "@/lib/assignments";
import { formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { LearnerAssignment } from "@/types/assignments";

const FILTERS = [
  { id: "", label: "All" },
  { id: "todo", label: "To do or revise" },
  { id: "submitted", label: "Awaiting review" },
  { id: "graded", label: "Graded" },
] as const;

export function MyAssignments() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, reload } = useApiResource<Paginated<LearnerAssignment>>("/me/assignments/", { status, page });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="assignment-filter" className="font-normal text-muted">
          Show
        </Label>
        <Select
          id="assignment-filter"
          className="w-auto"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </Select>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}
      {!data && !error ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={status ? "Nothing here" : "No assignments yet"}
          description={status ? undefined : "When an instructor publishes an assignment in one of your courses, it appears here."}
        />
      ) : data ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {data.results.map((a) => {
              const state = learnerState(a);
              return (
                <li key={a.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/dashboard/assignments/${a.id}`} className="font-medium text-navy hover:text-teal-700">
                      {a.title}
                    </Link>
                    <p className="text-sm text-muted">
                      {a.course.title}
                      {a.lesson && ` · ${a.lesson.title}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3 text-sm">
                    <span className="text-muted">{a.due_at ? `Due ${formatDateTime(a.due_at)}` : "No due date"}</span>
                    {a.submission?.status === "graded" && (
                      <span className="font-medium tabular-nums">
                        {a.submission.points} / {a.max_points}
                      </span>
                    )}
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pager data={data} onPage={setPage} />
        </Card>
      ) : null}
    </div>
  );
}
