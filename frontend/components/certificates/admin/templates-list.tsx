"use client";

import { FileBadge, Plus } from "lucide-react";
import { useState } from "react";

import { LoadError, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { CertificateTemplate } from "@/types/certificates";

import { TemplateDialog } from "./template-dialog";

export function TemplatesList() {
  const toast = useToast();
  const { data, error, reload } = useApiResource<CertificateTemplate[]>("/admin/certificates/templates/");
  const [editing, setEditing] = useState<CertificateTemplate | "new" | null>(null);
  const [deleting, setDeleting] = useState<CertificateTemplate | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/admin/certificates/templates/${deleting.id}/`);
      toast.success("Template deleted.");
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Templates</CardTitle>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New template
        </Button>
      </CardHeader>
      {error && (
        <div className="p-4">
          <LoadError message={error} onRetry={reload} />
        </div>
      )}
      {!data && !error ? (
        <TableSkeleton rows={3} />
      ) : data && data.length === 0 ? (
        <EmptyState icon={FileBadge} title="No templates yet" description="Create a template before you turn on certificates for a course." />
      ) : data ? (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={th}>
                  Name
                </th>
                <th scope="col" className={th}>
                  Heading
                </th>
                <th scope="col" className={th}>
                  Signatory
                </th>
                <th scope="col" className={`${th} text-right`}>
                  In use
                </th>
                <th scope="col" className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((t) => {
                const inUse = t.rule_count + t.certificate_count > 0;
                return (
                  <tr key={t.id}>
                    <td className="px-4 py-3 font-medium text-navy">{t.name}</td>
                    <td className="px-4 py-3">{t.heading}</td>
                    <td className="px-4 py-3">{t.signatory_name || <span className="text-muted">None</span>}</td>
                    <td className="px-4 py-3 text-right text-muted">
                      {t.rule_count} course{t.rule_count === 1 ? "" : "s"} · {t.certificate_count} issued
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                          Edit
                        </Button>
                        {!inUse && (
                          <Button size="sm" variant="ghost" onClick={() => setDeleting(t)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {editing && (
        <TemplateDialog
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Template saved.");
            reload();
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && !busy && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="No course or certificate uses it. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={busy}
        onConfirm={remove}
      />
    </Card>
  );
}
