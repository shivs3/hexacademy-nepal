"use client";

import { ArrowLeft, ExternalLink, FileText, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { LoadError } from "@/components/cms/admin/list-parts";
import { MediaPickerDialog } from "@/components/cms/admin/media-picker";
import { RichTextEditor } from "@/components/cms/admin/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert, Badge, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { useSaveShortcut, useUnsavedWarning } from "@/hooks/use-unsaved-warning";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { fromNepalInput, toNepalInput } from "@/lib/live-classes";
import { formatDateTime } from "@/lib/utils";
import type { AdminNotice } from "@/types/cms-admin";

import { NoticeStatus } from "../notice-status";

type Attachment = AdminNotice["attachment_detail"];
type Draft = {
  title: string;
  summary: string;
  body: string;
  attachment: number | null;
  attachment_detail: Attachment;
  is_active: boolean;
  show_in_popup: boolean;
  /** Nepal wall-clock values for the datetime-local inputs ("" = none). */
  starts_at: string;
  ends_at: string;
  position: string;
};

const EMPTY: Draft = {
  title: "",
  summary: "",
  body: "",
  attachment: null,
  attachment_detail: null,
  is_active: true,
  show_in_popup: true,
  starts_at: "",
  ends_at: "",
  position: "0",
};

function toDraft(n: AdminNotice): Draft {
  return {
    title: n.title,
    summary: n.summary,
    body: n.body,
    attachment: n.attachment,
    attachment_detail: n.attachment_detail,
    is_active: n.is_active,
    show_in_popup: n.show_in_popup,
    starts_at: n.starts_at ? toNepalInput(n.starts_at) : "",
    ends_at: n.ends_at ? toNepalInput(n.ends_at) : "",
    position: String(n.position),
  };
}

function payload(d: Draft) {
  return {
    title: d.title,
    summary: d.summary,
    body: d.body,
    attachment: d.attachment,
    is_active: d.is_active,
    show_in_popup: d.show_in_popup,
    starts_at: d.starts_at ? fromNepalInput(d.starts_at) : null,
    ends_at: d.ends_at ? fromNepalInput(d.ends_at) : null,
    position: Number(d.position) || 0,
  };
}

export function NoticeEditor({ noticeId, canUpload }: { noticeId: number | null; canUpload: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const res = useApiResource<AdminNotice>(noticeId ? `/admin/cms/notices/${noticeId}/` : null);
  const [notice, setNotice] = useState<AdminNotice | null>(null);
  const [draft, setDraft] = useState<Draft | null>(noticeId ? null : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (res.data && notice === null) {
    setNotice(res.data);
    setDraft(toDraft(res.data));
  }

  const dirty = useMemo(() => {
    if (!draft) return false;
    const base = notice ? toDraft(notice) : EMPTY;
    return JSON.stringify(payload(draft)) !== JSON.stringify(payload(base));
  }, [draft, notice]);
  useUnsavedWarning(dirty && !saving);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = payload(draft);
      const saved = notice
        ? await api.patch<AdminNotice>(`/admin/cms/notices/${notice.id}/`, body)
        : await api.post<AdminNotice>("/admin/cms/notices/", body);
      setErrors({});
      setNotice(saved);
      setDraft(toDraft(saved));
      toast.success(saved.is_live ? "Notice saved. It is live on the website." : "Notice saved.");
      if (!notice) router.replace(`/admin/cms/notices/${saved.id}`);
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? "Some fields need attention." : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [draft, notice, router, toast]);
  useSaveShortcut(() => void save(), dirty);

  async function remove() {
    if (!notice) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/cms/notices/${notice.id}/`);
      toast.success("Notice deleted.");
      router.push("/admin/cms/notices");
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  }

  if (res.error && !notice) return <LoadError message={res.error} onRetry={res.reload} />;
  if (!draft) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  // Rendered pages belong to the saved attachment; hide them while a different file is picked.
  const savedPages = notice && notice.attachment === draft.attachment ? notice.pages : [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin/cms/notices" className="inline-flex items-center gap-1 text-sm text-muted hover:text-navy">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All notices
        </Link>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{draft.title || (notice ? "Untitled notice" : "New notice")}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {notice ? <NoticeStatus notice={notice} /> : <Badge>Not saved yet</Badge>}
            {dirty && notice && <Badge tone="warning">Unsaved edits</Badge>}
            {notice?.is_live && (
              <a href={`/notices/${notice.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-teal-700">
                /notices/{notice.id}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {notice && (
            <Button variant="outline" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </Button>
          )}
          <Button onClick={() => void save()} disabled={notice ? !dirty : !draft.title.trim()} loading={saving}>
            {notice ? "Save changes" : "Create notice"}
          </Button>
        </div>
      </div>

      {notice?.is_live && <Alert tone="info">This notice is live: saving updates it for visitors immediately.</Alert>}
      {formError && <Alert tone="danger">{formError}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <Field label="Title" htmlFor="notice-title" error={errors.title} required>
                <Input value={draft.title} maxLength={200} onChange={(e) => update({ title: e.target.value })} />
              </Field>
              <Field
                label="Short message"
                htmlFor="notice-summary"
                error={errors.summary}
                hint={`Shown in the pop-up under the title. ${draft.summary.length}/500`}
              >
                <Textarea value={draft.summary} maxLength={500} rows={3} onChange={(e) => update({ summary: e.target.value })} />
              </Field>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notice-attachment">Image or PDF</Label>
                <AttachmentInput
                  id="notice-attachment"
                  value={draft.attachment_detail}
                  canUpload={canUpload}
                  invalid={!!errors.attachment}
                  onChange={(detail) => update({ attachment: detail?.id ?? null, attachment_detail: detail })}
                />
                {errors.attachment ? (
                  <p className="text-xs text-danger">{errors.attachment}</p>
                ) : (
                  <p className="text-xs text-muted">Shown in full on the notice page. PDFs (up to 30 pages) are turned into page images when you save.</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notice-body">Full details (optional)</Label>
                <RichTextEditor id="notice-body" value={draft.body} invalid={!!errors.body} onChange={(body) => update({ body })} placeholderLabel="Write the full notice…" />
                {errors.body && <p className="text-xs text-danger">{errors.body}</p>}
              </div>
            </CardBody>
          </Card>

          {savedPages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>PDF pages as shown on the site</CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {savedPages.map((p) => (
                    <li key={p.number} className="overflow-hidden rounded-lg border border-line bg-page">
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin preview */}
                      <img src={p.url} alt={`Page ${p.number}`} className="w-full" />
                      <span className="block px-2 py-1 text-xs text-muted">Page {p.number}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Display</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <div className="flex items-start gap-2">
                <Checkbox id="notice-active" checked={draft.is_active} onChange={(e) => update({ is_active: e.target.checked })} />
                <Label htmlFor="notice-active" className="font-normal">
                  Active
                  <span className="block text-xs text-muted">Switch off to hide it everywhere.</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="notice-popup" checked={draft.show_in_popup} onChange={(e) => update({ show_in_popup: e.target.checked })} />
                <Label htmlFor="notice-popup" className="font-normal">
                  Show in the pop-up
                  <span className="block text-xs text-muted">Otherwise it is only listed on the Notices page.</span>
                </Label>
              </div>
              <Field label="Show from" htmlFor="notice-starts" error={errors.starts_at} hint="Nepal time. Leave empty to start now.">
                <Input type="datetime-local" value={draft.starts_at} onChange={(e) => update({ starts_at: e.target.value })} />
              </Field>
              <Field label="Show until" htmlFor="notice-ends" error={errors.ends_at} hint="Nepal time. Leave empty to keep it up.">
                <Input type="datetime-local" value={draft.ends_at} onChange={(e) => update({ ends_at: e.target.value })} />
              </Field>
              <Field label="Order" htmlFor="notice-position" error={errors.position} hint="Lower numbers are shown first.">
                <Input type="number" min={0} value={draft.position} onChange={(e) => update({ position: e.target.value })} />
              </Field>
            </CardBody>
          </Card>
          {notice && (
            <p className="text-xs text-muted">
              Created {formatDateTime(notice.created_at)} · Last updated {formatDateTime(notice.updated_at)}
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this notice?"
        description="It disappears from the website. The attached file stays in the media library."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

function AttachmentInput({
  id,
  value,
  onChange,
  canUpload,
  invalid,
}: {
  id: string;
  value: Attachment;
  onChange: (value: Attachment) => void;
  canUpload: boolean;
  invalid: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div id={id} className={`flex items-center gap-3 rounded-lg border bg-white p-2 ${invalid ? "border-danger" : "border-line"}`}>
      <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-page">
        {value?.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview
          <img src={value.url} alt="" className="h-full w-full object-cover" />
        ) : value ? (
          <FileText className="h-6 w-6 text-teal-700" aria-hidden="true" />
        ) : (
          <FileText className="h-5 w-5 text-muted" aria-hidden="true" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-xs text-muted">
          {value ? `${value.kind === "image" ? "Image" : "PDF"} · ${value.original_name}` : "No file attached"}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            {value ? "Change" : "Choose file"}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} aria-label="Remove file">
              <X className="h-4 w-4" aria-hidden="true" />
              Remove
            </Button>
          )}
        </div>
      </div>
      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        canUpload={canUpload}
        allowPdf
        onSelect={(asset) =>
          onChange({
            id: asset.id,
            kind: asset.kind,
            url: asset.url,
            mime_type: asset.mime_type,
            width: asset.width,
            height: asset.height,
            alt: asset.alt_text,
            original_name: asset.original_name,
            size_bytes: asset.size_bytes,
          })
        }
      />
    </div>
  );
}
