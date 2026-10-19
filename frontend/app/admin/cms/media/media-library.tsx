"use client";

import { Copy, FileText, ImageIcon, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { LoadError, Pager, SearchBox } from "@/components/cms/admin/list-parts";
import { IMAGE_ACCEPT, uploadMedia } from "@/components/cms/admin/media-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { formatBytes, formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { MediaAsset, MediaKind } from "@/types/cms-admin";

const ACCEPT = `${IMAGE_ACCEPT},application/pdf`;

export function MediaLibrary({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<MediaKind | "">("");
  const [pageNo, setPageNo] = useState(1);
  const query = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<MediaAsset>>("/admin/cms/media/", {
    search: query,
    kind: kind || undefined,
    page: pageNo,
    page_size: 24,
  });
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const failures: string[] = [];
    setUploading({ done: 0, total: list.length });
    // One at a time: keeps server load predictable and errors attributable to a file.
    for (const [i, file] of list.entries()) {
      try {
        await uploadMedia(file, { title: file.name.replace(/\.[^.]+$/, "") });
      } catch (err) {
        failures.push(`${file.name}: ${errorMessage(err)}`);
      }
      setUploading({ done: i + 1, total: list.length });
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
    const ok = list.length - failures.length;
    if (ok > 0) toast.success(`${ok} file${ok === 1 ? "" : "s"} uploaded. Add alt text to images so they are accessible.`);
    for (const f of failures) toast.error(f);
    setPageNo(1);
    reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPageNo(1);
          }}
          label="Search media"
          placeholder="Search title, alt text or file name"
        />
        <Select
          aria-label="File type"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as MediaKind | "");
            setPageNo(1);
          }}
          className="sm:w-44"
        >
          <option value="">All files</option>
          <option value="image">Images</option>
          <option value="document">Documents</option>
        </Select>
        {canManage && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <Button onClick={() => fileRef.current?.click()} loading={uploading !== null}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              {uploading ? `Uploading ${uploading.done + 1 > uploading.total ? uploading.total : uploading.done + 1} of ${uploading.total}` : "Upload"}
            </Button>
          </>
        )}
      </div>
      {canManage && <p className="text-xs text-muted">JPEG, PNG, WebP or GIF images up to 10 MB, or PDF documents. Image metadata such as GPS location is removed on upload.</p>}
      {!canManage && <Alert tone="info">You can browse the library. Uploading and editing files needs the media permission.</Alert>}

      {error ? (
        <LoadError message={error} onRetry={reload} />
      ) : !data ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" aria-busy="true">
          {Array.from({ length: 12 }, (_, i) => (
            <li key={i}>
              <Skeleton className="aspect-square w-full" />
            </li>
          ))}
        </ul>
      ) : data.results.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title={query || kind ? "No matching files" : "The library is empty"}
          description={query || kind ? "Try a different search or filter." : canManage ? "Upload images and documents to use them on the website." : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {data.results.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() => setSelected(asset)}
                  className="group flex w-full flex-col overflow-hidden rounded-md border border-line text-left transition-colors hover:border-teal focus-visible:outline-2 focus-visible:outline-teal"
                >
                  <Thumb asset={asset} />
                  <span className="flex flex-col gap-0.5 px-2 py-1.5">
                    <span className="truncate text-xs font-medium text-navy">{asset.title || asset.original_name}</span>
                    <span className="flex items-center gap-1 text-[11px] text-muted">
                      {formatBytes(asset.size_bytes)}
                      {asset.kind === "image" && !asset.alt_text && (
                        <Badge tone="warning" className="ml-auto px-1.5 py-0 text-[10px]">
                          No alt
                        </Badge>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Pager data={data} onPage={setPageNo} />
        </Card>
      )}

      {selected && (
        <MediaDetailDialog
          key={selected.id}
          asset={selected}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Thumb({ asset }: { asset: MediaAsset }) {
  if (asset.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- library thumbnails come straight from object storage
      <img src={asset.url} alt="" loading="lazy" className="aspect-square w-full bg-page object-cover" />
    );
  }
  return (
    <span className="flex aspect-square w-full items-center justify-center bg-page">
      <FileText className="h-10 w-10 text-muted" aria-hidden="true" />
    </span>
  );
}

function MediaDetailDialog({
  asset,
  canManage,
  onClose,
  onChanged,
}: {
  asset: MediaAsset;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(asset.title);
  const [alt, setAlt] = useState(asset.alt_text);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = title !== asset.title || alt !== asset.alt_text;
  const absoluteUrl = asset.url.startsWith("http") ? asset.url : `${typeof window === "undefined" ? "" : window.location.origin}${asset.url}`;

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      await api.patch<MediaAsset>(`/admin/cms/media/${asset.id}/`, { title, alt_text: alt });
      toast.success("File details saved.");
      onChanged();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api.delete(`/admin/cms/media/${asset.id}/`);
      toast.success("File deleted.");
      setConfirmDelete(false);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy the link. Select it and copy manually.");
    }
  }

  return (
    <>
      <Dialog
        open={!confirmDelete}
        onOpenChange={(o) => !o && onClose()}
        title={asset.title || asset.original_name}
        className="max-w-3xl"
        footer={
          <>
            {canManage && (
              <Button variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              {canManage ? "Cancel" : "Close"}
            </Button>
            {canManage && (
              <Button onClick={save} loading={saving} disabled={!dirty}>
                Save
              </Button>
            )}
          </>
        }
      >
        <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
          <div className="flex flex-col gap-3">
            {asset.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview of a stored upload
              <img src={asset.url} alt={asset.alt_text} className="max-h-80 w-full rounded-md border border-line bg-page object-contain" />
            ) : (
              <a
                href={asset.url}
                target="_blank"
                rel="noreferrer"
                className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-line bg-page text-sm font-medium text-teal-700 hover:underline"
              >
                <FileText className="h-10 w-10 text-muted" aria-hidden="true" />
                Open PDF
              </a>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted">File</dt>
              <dd className="break-all text-body">{asset.original_name}</dd>
              <dt className="text-muted">Type</dt>
              <dd className="text-body">{asset.mime_type}</dd>
              <dt className="text-muted">Size</dt>
              <dd className="text-body">
                {formatBytes(asset.size_bytes)}
                {asset.width && asset.height ? ` · ${asset.width}×${asset.height}px` : ""}
              </dd>
              <dt className="text-muted">Uploaded</dt>
              <dd className="text-body">
                {formatDateTime(asset.created_at)}
                {asset.uploaded_by_name && ` by ${asset.uploaded_by_name}`}
              </dd>
            </dl>
            <div className="flex gap-2">
              <Input readOnly value={absoluteUrl} aria-label="File link" className="text-xs" onFocus={(e) => e.target.select()} />
              <Button variant="outline" size="sm" onClick={copyUrl} aria-label="Copy link">
                <Copy className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <Field label="Title" htmlFor="media-title" error={errors.title} hint="Used to find the file in the library.">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} readOnly={!canManage} />
            </Field>
            {asset.kind === "image" && (
              <Field
                label="Alt text"
                htmlFor="media-alt"
                error={errors.alt_text}
                hint="Describe the image for people using screen readers. Leave empty only if the image is purely decorative."
              >
                <Textarea value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={300} rows={4} readOnly={!canManage} />
              </Field>
            )}
          </div>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(false)}
        title="Delete this file?"
        description="The file is removed from storage. Pages, posts or settings that use it will show no image or link in its place. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={remove}
      />
    </>
  );
}
