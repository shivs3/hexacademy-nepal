"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LoadError, Pager, SearchBox, TableSkeleton } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { formatPrice } from "@/lib/catalog";
import { ACCESS_REQUEST_STATUS } from "@/lib/commerce";
import { formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { AccessRequestStatus, AdminAccessRequest } from "@/types/access";

import { AccessRequestDecision, type Decision } from "./access-request-decision";

const STATUSES: [AccessRequestStatus | "", string][] = [
  ["pending", "Waiting for review"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["cancelled", "Cancelled"],
  ["", "All"],
];

/**
 * Checkout requests. Approving grants the course or exam; rejecting tells the
 * learner why. `canManageUsers` links each learner to their access page.
 */
export function AccessRequestsList({ initialStatus = "pending", canManageUsers }: { initialStatus?: string; canManageUsers: boolean }) {
  const [status, setStatus] = useState(STATUSES.some(([v]) => v === initialStatus) ? initialStatus : "pending");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data, error, reload, setData } = useApiResource<Paginated<AdminAccessRequest>>("/admin/commerce/requests/", {
    status,
    kind,
    search: q,
    page,
  });
  const [deciding, setDeciding] = useState<{ request: AdminAccessRequest; decision: Decision } | null>(null);
  const toast = useToast();
  const set = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setPage(1);
  };

  function done(updated: AdminAccessRequest) {
    if (data) setData({ ...data, results: data.results.map((r) => (r.id === updated.id ? updated : r)) });
    toast.success(updated.status === "approved" ? `Approved. ${updated.item_title} is now on the learner's account.` : "Request rejected.");
    setDeciding(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Request status">
        {STATUSES.map(([value, label]) => (
          <button
            key={value || "all"}
            type="button"
            aria-pressed={status === value}
            onClick={() => set(setStatus)(value)}
            className={
              status === value
                ? "rounded-full bg-navy px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-full border border-line bg-white px-3 py-1.5 text-sm text-body hover:border-teal/50"
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchBox value={search} onChange={set(setSearch)} label="Search requests" placeholder="Number, name, phone, email, payment reference or item" />
        <Select aria-label="Filter by type" value={kind} onChange={(e) => set(setKind)(e.target.value)} className="sm:w-40">
          <option value="">Courses and exams</option>
          <option value="course">Courses</option>
          <option value="exam">Exams</option>
        </Select>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Inbox} title={status === "pending" && !q && !kind ? "No requests waiting" : "No requests match these filters"} />
      ) : data ? (
        <>
          <ul className="flex flex-col gap-3">
            {data.results.map((r) => {
              const tone = ACCESS_REQUEST_STATUS[r.status];
              return (
                <li key={r.id} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-navy">
                        {r.item_title} <span className="text-sm font-normal text-muted">· {r.kind === "course" ? "Course" : "Exam"}</span>
                      </p>
                      <p className="text-xs text-muted">
                        {r.number} · {formatDateTime(r.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge tone={tone.tone}>{r.status_label}</Badge>
                      <span className="font-semibold tabular-nums text-navy">{formatPrice(r.price)}</span>
                    </div>
                  </div>
                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="text-muted">Name</dt>
                      <dd className="text-body">{r.full_name}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted">Phone</dt>
                      <dd>
                        <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="text-teal-700 hover:underline">
                          {r.phone}
                        </a>
                      </dd>
                    </div>
                    <div className="flex min-w-0 gap-2">
                      <dt className="text-muted">Account</dt>
                      <dd className="truncate">
                        {canManageUsers ? (
                          <Link href={`/admin/users/${r.user.id}`} className="text-teal-700 hover:underline">
                            {r.user.email}
                          </Link>
                        ) : (
                          r.user.email
                        )}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted">Payment ref.</dt>
                      <dd className="text-body">{r.payment_reference || "—"}</dd>
                    </div>
                  </dl>
                  {r.message && <p className="whitespace-pre-line rounded-lg bg-page px-3 py-2 text-sm text-body">{r.message}</p>}
                  {r.status !== "pending" && (r.staff_note || r.handled_by_name) && (
                    <p className="text-xs text-muted">
                      {r.handled_by_name && `${r.status_label} by ${r.handled_by_name}`}
                      {r.handled_at && ` · ${formatDateTime(r.handled_at)}`}
                      {r.staff_note && ` · “${r.staff_note}”`}
                    </p>
                  )}
                  {r.status === "pending" && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setDeciding({ request: r, decision: "approve" })}>
                        Approve and add access
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDeciding({ request: r, decision: "reject" })}>
                        Reject
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <Pager data={data} onPage={setPage} />
        </>
      ) : null}

      <AccessRequestDecision
        request={deciding?.request ?? null}
        decision={deciding?.decision ?? "approve"}
        onClose={() => setDeciding(null)}
        onDone={done}
      />
    </div>
  );
}
