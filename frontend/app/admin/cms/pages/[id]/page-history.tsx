"use client";

import { History } from "lucide-react";
import { useState } from "react";

import { LoadError, Pager, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { AdminPage, PageVersion } from "@/types/cms-admin";

export function PageHistory({
  pageId,
  canPublish,
  dirty,
  onRestored,
}: {
  pageId: number;
  canPublish: boolean;
  dirty: boolean;
  onRestored: (page: AdminPage) => void;
}) {
  const toast = useToast();
  const [pageNo, setPageNo] = useState(1);
  const { data, error, reload } = useApiResource<Paginated<PageVersion>>(`/admin/cms/pages/${pageId}/versions/`, { page: pageNo });
  const [target, setTarget] = useState<{ version: PageVersion; action: "restore" | "publish" } | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!target) return;
    setBusy(true);
    try {
      const path = target.action === "restore" ? "restore" : "publish";
      const updated = await api.post<AdminPage>(`/admin/cms/pages/${pageId}/${path}/`, { version: target.version.number });
      toast.success(
        target.action === "restore"
          ? `Version ${target.version.number} copied into the draft. Publish it to make it live.`
          : `Version ${target.version.number} is now live.`,
      );
      setTarget(null);
      onRestored(updated);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data) return <TableSkeleton rows={4} />;
  if (data.results.length === 0) return <EmptyState icon={History} title="No versions yet" />;

  const latest = data.page === 1 ? data.results[0]?.number : undefined;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        A version is recorded each time the draft is saved with changes. Restoring copies an old version into a new draft; nothing is
        lost.
      </p>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={th}>Version</th>
                <th scope="col" className={th}>Saved</th>
                <th scope="col" className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.results.map((v) => (
                <tr key={v.number} className="align-top">
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-navy">v{v.number}</span>
                      {v.is_published && <Badge tone="success">Live</Badge>}
                      {v.number === latest && <Badge tone="teal">Latest draft</Badge>}
                    </div>
                    <p className="text-xs text-muted">
                      {v.title}
                      {v.note && ` · ${v.note}`}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {formatDateTime(v.created_at)}
                    {v.created_by_name && <span className="block">by {v.created_by_name}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button asChild variant="ghost" size="sm">
                        <a href={`/preview/pages/${pageId}?version=${v.number}`} target="_blank" rel="noreferrer">
                          Preview
                        </a>
                      </Button>
                      {v.number !== latest && (
                        <Button variant="outline" size="sm" onClick={() => setTarget({ version: v, action: "restore" })}>
                          Restore
                        </Button>
                      )}
                      {canPublish && !v.is_published && (
                        <Button variant="outline" size="sm" onClick={() => setTarget({ version: v, action: "publish" })}>
                          Publish this version
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager data={data} onPage={setPageNo} />
      </Card>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target?.action === "restore" ? `Restore version ${target.version.number}?` : `Publish version ${target?.version.number}?`}
        description={
          (target?.action === "restore"
            ? "Its content replaces the current draft and is saved as a new version. The live page does not change until you publish."
            : "Visitors will see this version immediately. The current draft is kept.") +
          (dirty ? " Your unsaved edits will be discarded." : "")
        }
        confirmLabel={target?.action === "restore" ? "Restore" : "Publish"}
        tone={dirty ? "danger" : "primary"}
        loading={busy}
        onConfirm={confirm}
      />
    </div>
  );
}
