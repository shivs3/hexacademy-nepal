"use client";

import { CheckCircle2, GraduationCap, MoreHorizontal, Plus, RotateCcw, UserX } from "lucide-react";
import { useState } from "react";

import { LoadError, Pager, SearchBox, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import { SOURCE_LABELS, type AdminEnrollment, type AdminEnrollmentDetail, type EnrollmentCourseOption } from "@/types/catalog-admin";

export function EnrollmentsList({ canManage, initialCourse }: { canManage: boolean; initialCourse: string }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState(initialCourse);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [granting, setGranting] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [revoking, setRevoking] = useState<AdminEnrollment | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<AdminEnrollment>>("/admin/learning/enrollments/", { search: q, course, status, page });
  const courses = useApiResource<EnrollmentCourseOption[]>("/admin/learning/courses/");
  const filtered = Boolean(q || course || status);

  async function act(enrollment: AdminEnrollment, action: "revoke" | "reinstate") {
    setBusy(true);
    try {
      await api.post<AdminEnrollment>(`/admin/learning/enrollments/${enrollment.id}/${action}/`);
      toast.success(action === "revoke" ? `Access removed for ${enrollment.user.full_name || enrollment.user.email}.` : "Access restored.");
      setRevoking(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search learners"
          placeholder="Search learner name or email"
        />
        <Select
          aria-label="Filter by course"
          value={course}
          onChange={(e) => {
            setCourse(e.target.value);
            setPage(1);
          }}
          className="lg:w-64"
        >
          <option value="">All courses</option>
          {courses.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
              {c.status === "archived" ? " (archived)" : ""}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by access"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="lg:w-40"
        >
          <option value="">Any access</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
        </Select>
        {canManage && (
          <Button onClick={() => setGranting(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Grant access
          </Button>
        )}
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={filtered ? "No enrollments match these filters" : "No enrollments yet"}
          description={filtered ? undefined : "Learners appear here once they enroll in a course."}
        />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Learner</th>
                  <th scope="col" className={th}>Course</th>
                  <th scope="col" className={th}>Progress</th>
                  <th scope="col" className={th}>Enrolled</th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setViewing(e.id)} className="text-left font-medium text-navy hover:text-teal-700 hover:underline">
                        {e.user.full_name || e.user.email}
                      </button>
                      <p className="text-xs text-muted">{e.user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{e.course.title}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {e.status === "revoked" && <Badge tone="warning">Access revoked</Badge>}
                        <Badge>{SOURCE_LABELS[e.source]}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ProgressCell enrollment={e} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {formatDate(e.enrolled_at)}
                      {e.last_accessed_at && <span className="block">Last studied {formatDate(e.last_accessed_at)}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Menu
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${e.user.full_name || e.user.email}`}>
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          }
                        >
                          <MenuItem onSelect={() => setViewing(e.id)}>View progress</MenuItem>
                          {canManage && e.status === "active" && (
                            <MenuItem danger onSelect={() => setRevoking(e)}>
                              <UserX className="h-4 w-4" aria-hidden="true" />
                              Revoke access
                            </MenuItem>
                          )}
                          {canManage && e.status === "revoked" && (
                            <MenuItem onSelect={() => void act(e, "reinstate")} disabled={busy}>
                              <RotateCcw className="h-4 w-4" aria-hidden="true" />
                              Restore access
                            </MenuItem>
                          )}
                        </Menu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager data={data} onPage={setPage} />
        </Card>
      ) : null}

      {granting && (
        <GrantDialog
          courses={courses.data ?? []}
          initialCourse={course}
          onClose={() => setGranting(false)}
          onGranted={(enrollment) => {
            toast.success(`${enrollment.user.full_name || enrollment.user.email} can open ${enrollment.course.title}.`);
            setGranting(false);
            reload();
          }}
        />
      )}
      {viewing !== null && <ProgressDialog enrollmentId={viewing} onClose={() => setViewing(null)} />}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revoke access?"
        description={
          revoking
            ? `${revoking.user.full_name || revoking.user.email} will no longer be able to open ${revoking.course.title}. Their progress is kept, so access can be restored later.`
            : ""
        }
        confirmLabel="Revoke access"
        tone="danger"
        loading={busy}
        onConfirm={() => revoking && act(revoking, "revoke")}
      />
    </div>
  );
}

function ProgressCell({ enrollment }: { enrollment: AdminEnrollment }) {
  return (
    <div className="w-36">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-page"
        role="progressbar"
        aria-label="Course progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={enrollment.percent}
      >
        <div className="h-full rounded-full bg-mint" style={{ width: `${enrollment.percent}%` }} />
      </div>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted">
        {enrollment.completed_at ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            Completed
          </>
        ) : (
          `${enrollment.completed_lessons} of ${enrollment.total_lessons} · ${enrollment.percent}%`
        )}
      </p>
    </div>
  );
}

function GrantDialog({
  courses,
  initialCourse,
  onClose,
  onGranted,
}: {
  courses: EnrollmentCourseOption[];
  initialCourse: string;
  onClose: () => void;
  onGranted: (enrollment: AdminEnrollment) => void;
}) {
  const open = courses.filter((c) => c.status === "published");
  const [course, setCourse] = useState(open.some((c) => String(c.id) === initialCourse) ? initialCourse : "");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!course) local.course = "Choose a course.";
    if (!email.trim()) local.email = "Enter the learner's email address.";
    setErrors(local);
    if (Object.keys(local).length) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await api.post<AdminEnrollment>("/admin/learning/enrollments/", { course: Number(course), email: email.trim() });
      // The backend answers 200 with the existing enrollment when the learner already had access.
      onGranted(res);
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? null : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Grant course access"
      description="Use this for verified offline payments, scholarships or staff access. The learner needs an account first. This is recorded in the audit log."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="grant-form" loading={saving}>
            Grant access
          </Button>
        </>
      }
    >
      <form id="grant-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Course" htmlFor="grant-course" error={errors.course} required>
          <Select value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="">Choose a published course</option>
            {open.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Learner's email" htmlFor="grant-email" error={errors.email} required>
          <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

function ProgressDialog({ enrollmentId, onClose }: { enrollmentId: number; onClose: () => void }) {
  const { data, error, reload } = useApiResource<AdminEnrollmentDetail>(`/admin/learning/enrollments/${enrollmentId}/`);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={data ? data.user.full_name || data.user.email : "Learner progress"}
      description={data ? `${data.course.title} · enrolled ${formatDate(data.enrolled_at)} · ${SOURCE_LABELS[data.source]}${data.granted_by_name ? ` by ${data.granted_by_name}` : ""}` : ""}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {error ? (
        <LoadError message={error} onRetry={reload} />
      ) : !data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          {data.status === "revoked" && <Alert tone="warning">Access was revoked{data.revoked_at ? ` on ${formatDate(data.revoked_at)}` : ""}.</Alert>}
          <ProgressCell enrollment={data} />
          {data.lessons.length === 0 ? (
            <p className="text-sm text-muted">This course has no published lessons.</p>
          ) : (
            <ol className="max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
              {data.lessons.map((l) => (
                <li key={l.lesson_id} className="flex items-start gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-navy">{l.title}</p>
                    <p className="truncate text-xs text-muted">{l.module_title}</p>
                  </div>
                  <p className="shrink-0 text-right text-xs text-muted">
                    {l.completed_at ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatDateTime(l.completed_at)}
                      </span>
                    ) : l.first_viewed_at ? (
                      `Opened ${formatDateTime(l.first_viewed_at)}`
                    ) : (
                      "Not started"
                    )}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Dialog>
  );
}
