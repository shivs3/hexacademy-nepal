"use client";

import { ArrowLeft, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LoadError } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, PageHeader, Skeleton } from "@/components/ui/feedback";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { cn, formatDate } from "@/lib/utils";
import type { Batch } from "@/types/live-classes";

import { BatchDialog } from "./batch-dialog";
import { MembersPanel } from "./members-panel";
import { SessionsPanel } from "./sessions-panel";

const TABS = [
  { id: "sessions", label: "Classes" },
  { id: "members", label: "Learners" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function BatchDetail({ batchId }: { batchId: number }) {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("sessions");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: batch, error, reload, setData } = useApiResource<Batch>(`/admin/live-classes/batches/${batchId}/`);

  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/admin/live-classes/batches/${batchId}/`);
      toast.success("Batch deleted.");
      router.push("/admin/live-classes");
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
      setDeleting(false);
    }
  }

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!batch) return <Skeleton className="h-64" />;

  const dates = [batch.starts_on && formatDate(batch.starts_on), batch.ends_on && formatDate(batch.ends_on)].filter(Boolean).join(" – ");

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/live-classes" className="inline-flex items-center gap-1 text-sm text-muted hover:text-navy">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All batches
      </Link>
      <PageHeader
        title={batch.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{batch.course.title}</span>
            {dates && <span>{dates}</span>}
            <span>
              {batch.member_count}
              {batch.capacity !== null && ` / ${batch.capacity}`} learners
            </span>
            {batch.status === "archived" && <Badge>Archived</Badge>}
          </span>
        }
        actions={
          batch.can_schedule ? (
            <Menu
              trigger={
                <Button variant="outline" size="icon" aria-label="Batch actions">
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              }
            >
              <MenuItem onSelect={() => setEditing(true)}>Edit batch</MenuItem>
              <MenuItem danger onSelect={() => setDeleting(true)}>
                Delete batch
              </MenuItem>
            </Menu>
          ) : undefined
        }
      />
      {batch.description && <p className="-mt-3 max-w-3xl text-sm text-muted">{batch.description}</p>}

      <div role="tablist" aria-label="Batch sections" className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal",
              tab === t.id ? "border-teal text-navy" : "border-transparent text-muted hover:text-navy",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "sessions" ? <SessionsPanel batch={batch} /> : <MembersPanel batch={batch} onChanged={reload} />}
      </div>

      {editing && (
        <BatchDialog
          batch={batch}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            setData(saved);
            toast.success("Batch saved.");
          }}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={(o) => !o && !busy && setDeleting(false)}
        title="Delete this batch?"
        description="Only batches without any classes can be deleted. Archive a batch to keep its history."
        confirmLabel="Delete batch"
        tone="danger"
        loading={busy}
        onConfirm={remove}
      />
    </div>
  );
}
