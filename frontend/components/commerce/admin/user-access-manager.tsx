"use client";

import { ArrowLeft, BookOpen, ClipboardList, Inbox, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert, Badge, PageHeader, Skeleton } from "@/components/ui/feedback";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatPrice } from "@/lib/catalog";
import { ACCESS_REQUEST_STATUS } from "@/lib/commerce";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { AccessOption, AccessOptions, AdminAccessRequest, UserAccess } from "@/types/access";

import { AccessRequestDecision, type Decision } from "./access-request-decision";

type Pending = { title: string; description: string; label: string; tone: "primary" | "danger"; run: () => Promise<string> };

const SOURCE: Record<string, string> = {
  free: "Free enrollment",
  purchase: "Purchase",
  admin: "Added by staff",
  request: "Approved request",
  staff: "Added by staff",
};

/**
 * Everything one learner can use: courses, paid exams, live-class batches.
 * Staff add or remove each one here; the backend checks every change.
 */
export function UserAccessManager({
  userId,
  canManageBatches,
  canSeeDirectory,
}: {
  userId: number;
  canManageBatches: boolean;
  canSeeDirectory: boolean;
}) {
  const { data, error, reload } = useApiResource<UserAccess>(`/admin/users/${userId}/access/`);
  const { data: options } = useApiResource<AccessOptions>("/admin/access/options/");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState<{ request: AdminAccessRequest; decision: Decision } | null>(null);
  const toast = useToast();

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      toast.success(await pending.run());
      setPending(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Alert tone="danger">
        {error}{" "}
        <button type="button" className="font-medium underline" onClick={reload}>
          Retry
        </button>
      </Alert>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-16" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const { user } = data;
  const name = user.full_name || user.email;
  const activeCourseIds = new Set(data.enrollments.filter((e) => e.status === "active").map((e) => e.course_id));
  const activeExamIds = new Set(data.exam_access.filter((a) => a.status === "active").map((a) => a.exam_id));
  const batchIds = new Set(data.batches.map((b) => b.batch_id));

  return (
    <div className="flex flex-col gap-6">
      {canSeeDirectory && (
        <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All users
        </Link>
      )}
      <PageHeader
        title={name}
        description={`${user.email} · joined ${formatDate(user.date_joined)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {user.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}
            {!user.email_verified && <Badge tone="warning">Email not verified</Badge>}
            {user.is_active && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/admin/access?user=${user.id}`}>Assign several at once</Link>
              </Button>
            )}
          </div>
        }
      />
      {!user.is_active && <Alert tone="warning">This account is deactivated. Reactivate it before adding anything.</Alert>}

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <BookOpen className="h-5 w-5 text-teal-700" aria-hidden="true" />
          <CardTitle>Courses</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <AddRow
            label="Add a course"
            options={options?.courses.filter((c) => !activeCourseIds.has(c.id))}
            disabled={!user.is_active}
            onAdd={(c) =>
              setPending({
                title: "Add course",
                description: `${name} gets ${c.title} right away, without payment through the site.`,
                label: "Add course",
                tone: "primary",
                run: async () => {
                  await api.post("/admin/learning/enrollments/", { email: user.email, course: c.id });
                  return `${c.title} added.`;
                },
              })
            }
          />
          {data.enrollments.length === 0 ? (
            <p className="text-sm text-muted">No courses on this account.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.enrollments.map((e) => (
                <Row
                  key={e.id}
                  title={e.course_title}
                  meta={`${SOURCE[e.source] ?? e.source} · ${formatDate(e.enrolled_at)}${e.granted_by_name ? ` · by ${e.granted_by_name}` : ""}${e.completed_at ? " · completed" : ""}`}
                  active={e.status === "active"}
                  onRemove={() =>
                    setPending({
                      title: "Remove course",
                      description: `${name} loses access to ${e.course_title}. Their progress is kept if you add it back later.`,
                      label: "Remove",
                      tone: "danger",
                      run: async () => {
                        await api.post(`/admin/learning/enrollments/${e.id}/revoke/`);
                        return `${e.course_title} removed.`;
                      },
                    })
                  }
                  onRestore={
                    user.is_active
                      ? () =>
                          setPending({
                            title: "Restore course",
                            description: `${name} gets ${e.course_title} back, with their earlier progress.`,
                            label: "Restore",
                            tone: "primary",
                            run: async () => {
                              await api.post(`/admin/learning/enrollments/${e.id}/reinstate/`);
                              return `${e.course_title} restored.`;
                            },
                          })
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <ClipboardList className="h-5 w-5 text-teal-700" aria-hidden="true" />
          <CardTitle>Paid exams</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Free exams are open to every learner, and course exams come with the course. Only paid standalone exams are added here.
          </p>
          <AddRow
            label="Add an exam"
            options={options?.exams.filter((x) => !activeExamIds.has(x.id) && Number(x.price) > 0)}
            disabled={!user.is_active}
            onAdd={(x) =>
              setPending({
                title: "Add exam",
                description: `${name} can take ${x.title} right away.`,
                label: "Add exam",
                tone: "primary",
                run: async () => {
                  await api.post(`/admin/users/${user.id}/exam-access/`, { exam: x.id });
                  return `${x.title} added.`;
                },
              })
            }
          />
          {data.exam_access.length === 0 ? (
            <p className="text-sm text-muted">No paid exams on this account.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.exam_access.map((a) => (
                <Row
                  key={a.id}
                  title={`${a.exam_title} · ${formatPrice(a.exam_price)}`}
                  meta={`${SOURCE[a.source] ?? a.source} · ${formatDate(a.granted_at)}${a.granted_by_name ? ` · by ${a.granted_by_name}` : ""}`}
                  active={a.status === "active"}
                  onRemove={() =>
                    setPending({
                      title: "Remove exam",
                      description: `${name} can no longer start ${a.exam_title}. Past attempts and results stay.`,
                      label: "Remove",
                      tone: "danger",
                      run: async () => {
                        await api.post(`/admin/exam-access/${a.id}/revoke/`);
                        return `${a.exam_title} removed.`;
                      },
                    })
                  }
                  onRestore={
                    user.is_active
                      ? () =>
                          setPending({
                            title: "Restore exam",
                            description: `${name} can take ${a.exam_title} again.`,
                            label: "Restore",
                            tone: "primary",
                            run: async () => {
                              await api.post(`/admin/users/${user.id}/exam-access/`, { exam: a.exam_id });
                              return `${a.exam_title} restored.`;
                            },
                          })
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Users className="h-5 w-5 text-teal-700" aria-hidden="true" />
          <CardTitle>Live-class batches</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {canManageBatches ? (
            <AddRow
              label="Add to a batch"
              options={options?.batches.filter((b) => !batchIds.has(b.id))}
              disabled={!user.is_active}
              onAdd={(b) =>
                setPending({
                  title: "Add to batch",
                  description: `${name} joins ${b.title} (${b.detail}) and sees its class sessions. They need an active enrollment in that course.`,
                  label: "Add to batch",
                  tone: "primary",
                  run: async () => {
                    const res = await api.post<{ added: number; already_members: number; not_enrolled: string[] }>(
                      `/admin/live-classes/batches/${b.id}/members/`,
                      { emails: [user.email] },
                    );
                    if (res.not_enrolled.length) throw new Error(`Add the course ${b.detail} first, then the batch.`);
                    return `Added to ${b.title}.`;
                  },
                })
              }
            />
          ) : (
            <p className="text-sm text-muted">Batch members are managed by staff who manage all live classes.</p>
          )}
          {data.batches.length === 0 ? (
            <p className="text-sm text-muted">Not in any batch.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.batches.map((b) => (
                <Row
                  key={b.id}
                  title={b.batch_name}
                  meta={`${b.course_title} · since ${formatDate(b.created_at)}`}
                  active
                  onRemove={
                    canManageBatches
                      ? () =>
                          setPending({
                            title: "Remove from batch",
                            description: `${name} leaves ${b.batch_name} and stops seeing its sessions.`,
                            label: "Remove",
                            tone: "danger",
                            run: async () => {
                              await api.delete(`/admin/live-classes/batches/${b.batch_id}/members/${b.id}/`);
                              return `Removed from ${b.batch_name}.`;
                            },
                          })
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Inbox className="h-5 w-5 text-teal-700" aria-hidden="true" />
          <CardTitle>Access requests</CardTitle>
        </CardHeader>
        <CardBody>
          {data.requests.length === 0 ? (
            <p className="text-sm text-muted">No checkout requests from this account.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.requests.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-navy">
                      {r.item_title} · {formatPrice(r.price)}
                    </p>
                    <p className="text-xs text-muted">
                      {r.number} · {formatDateTime(r.created_at)} · {r.phone}
                      {r.payment_reference && ` · ref. ${r.payment_reference}`}
                    </p>
                    {r.staff_note && <p className="text-xs text-muted">“{r.staff_note}”</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge tone={ACCESS_REQUEST_STATUS[r.status].tone}>{r.status_label}</Badge>
                    {r.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => setDeciding({ request: r, decision: "approve" })}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setDeciding({ request: r, decision: "reject" })}>
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.title ?? ""}
        description={pending?.description ?? ""}
        confirmLabel={pending?.label}
        tone={pending?.tone}
        loading={busy}
        onConfirm={confirm}
      />
      <AccessRequestDecision
        request={deciding?.request ?? null}
        decision={deciding?.decision ?? "approve"}
        onClose={() => setDeciding(null)}
        onDone={(updated) => {
          toast.success(updated.status === "approved" ? `${updated.item_title} added.` : "Request rejected.");
          setDeciding(null);
          reload();
        }}
      />
    </div>
  );
}

function AddRow({
  label,
  options,
  disabled,
  onAdd,
}: {
  label: string;
  options: AccessOption[] | undefined;
  disabled: boolean;
  onAdd: (option: AccessOption) => void;
}) {
  const [selected, setSelected] = useState("");
  const option = options?.find((o) => String(o.id) === selected);
  const id = `add-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-navy">
          {label}
        </label>
        <Select id={id} value={selected} onChange={(e) => setSelected(e.target.value)} disabled={disabled || !options}>
          <option value="">{!options ? "Loading…" : options.length ? "Choose…" : "Nothing left to add"}</option>
          {options?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
              {Number(o.price) > 0 ? ` · ${formatPrice(o.price)}` : ""}
              {o.detail ? ` · ${o.detail}` : ""}
            </option>
          ))}
        </Select>
      </div>
      <Button
        variant="outline"
        disabled={disabled || !option}
        onClick={() => {
          if (!option) return;
          onAdd(option);
          setSelected("");
        }}
      >
        Add
      </Button>
    </div>
  );
}

function Row({
  title,
  meta,
  active,
  onRemove,
  onRestore,
}: {
  title: string;
  meta: string;
  active: boolean;
  onRemove?: () => void;
  onRestore?: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className={active ? "font-medium text-navy" : "font-medium text-muted line-through"}>{title}</p>
        <p className="text-xs text-muted">{meta}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {active ? <Badge tone="success">Active</Badge> : <Badge>Removed</Badge>}
        {active && onRemove && (
          <Button size="sm" variant="ghost" onClick={onRemove}>
            Remove
          </Button>
        )}
        {!active && onRestore && (
          <Button size="sm" variant="outline" onClick={onRestore}>
            Restore
          </Button>
        )}
      </div>
    </li>
  );
}
