"use client";

import { ListChecks, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LoadError, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { CertificateCourseOption, CertificateRule, CertificateTemplate } from "@/types/certificates";

import { RuleDialog } from "./rule-dialog";

export function requirementSummary(rule: Pick<CertificateRule, "require_lessons" | "required_exam" | "require_assignments">): string {
  const parts: string[] = [];
  if (rule.require_lessons) parts.push("All lessons");
  if (rule.required_exam) parts.push(`Pass “${rule.required_exam.title}”`);
  if (rule.require_assignments) parts.push("All assignments graded");
  return parts.join(" · ") || "No requirements";
}

export function RulesList() {
  const toast = useToast();
  const rules = useApiResource<CertificateRule[]>("/admin/certificates/rules/");
  const templates = useApiResource<CertificateTemplate[]>("/admin/certificates/templates/");
  const courses = useApiResource<CertificateCourseOption[]>("/admin/certificates/courses/");
  const [editing, setEditing] = useState<CertificateRule | "new" | null>(null);
  const [deleting, setDeleting] = useState<CertificateRule | null>(null);
  const [busy, setBusy] = useState(false);

  function reloadAll() {
    rules.reload();
    courses.reload();
  }

  async function issueEligible(rule: CertificateRule) {
    try {
      const { issued } = await api.post<{ issued: number }>(`/admin/certificates/rules/${rule.id}/issue-eligible/`);
      toast.success(issued ? `Issued ${issued} certificate${issued === 1 ? "" : "s"}.` : "No further learners meet the requirements yet.");
      rules.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/admin/certificates/rules/${deleting.id}/`);
      toast.success("Rule removed. Certificates already issued stay valid.");
      setDeleting(null);
      reloadAll();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const error = rules.error || templates.error || courses.error;
  const ready = rules.data && templates.data && courses.data;
  const noTemplates = templates.data?.length === 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Course rules</CardTitle>
        <Button size="sm" onClick={() => setEditing("new")} disabled={!ready || noTemplates}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add course
        </Button>
      </CardHeader>
      {error && (
        <div className="p-4">
          <LoadError
            message={error}
            onRetry={() => {
              reloadAll();
              templates.reload();
            }}
          />
        </div>
      )}
      {noTemplates && (
        <div className="p-4">
          <Alert tone="info">
            Create a{" "}
            <Link href="/admin/certificates/templates" className="font-medium underline">
              certificate template
            </Link>{" "}
            first.
          </Alert>
        </div>
      )}
      {!ready && !error ? (
        <TableSkeleton rows={3} />
      ) : rules.data && rules.data.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No course offers a certificate yet"
          description="Add a course to choose its template and requirements."
        />
      ) : rules.data ? (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={th}>
                  Course
                </th>
                <th scope="col" className={th}>
                  Requirements
                </th>
                <th scope="col" className={th}>
                  Template
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Issued
                </th>
                <th scope="col" className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rules.data.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-navy">{r.course.title}</span>
                    <span className="mt-1 block">
                      <Badge tone={r.is_enabled ? "success" : "neutral"}>{r.is_enabled ? "Issuing" : "Off"}</Badge>
                    </span>
                  </td>
                  <td className="px-4 py-3">{requirementSummary(r)}</td>
                  <td className="px-4 py-3">{r.template_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.issued_count}</td>
                  <td className="px-4 py-3 text-right">
                    <Menu
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${r.course.title}`}>
                          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      }
                    >
                      <MenuItem onSelect={() => setEditing(r)}>Edit</MenuItem>
                      {r.is_enabled && <MenuItem onSelect={() => issueEligible(r)}>Issue to eligible learners</MenuItem>}
                      <MenuItem danger onSelect={() => setDeleting(r)}>
                        Remove
                      </MenuItem>
                    </Menu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {editing && ready && (
        <RuleDialog
          rule={editing === "new" ? null : editing}
          courses={courses.data!}
          templates={templates.data!}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Rule saved.");
            reloadAll();
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && !busy && setDeleting(null)}
        title={`Stop offering a certificate for “${deleting?.course.title ?? ""}”?`}
        description="No new certificates will be issued for this course. Certificates already issued stay valid."
        confirmLabel="Remove rule"
        tone="danger"
        loading={busy}
        onConfirm={remove}
      />
    </Card>
  );
}
