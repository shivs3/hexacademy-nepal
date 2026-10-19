"use client";

import { ImageIcon, Search, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { MediaRef } from "@/types/cms";
import type { MediaAsset } from "@/types/cms-admin";

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export function toMediaRef(asset: MediaAsset): MediaRef {
  return {
    id: asset.id,
    url: asset.url,
    alt: asset.alt_text,
    width: asset.width,
    height: asset.height,
    mime_type: asset.mime_type,
  };
}

export async function uploadMedia(file: File, extra: { title?: string; alt_text?: string } = {}) {
  const form = new FormData();
  form.append("file", file);
  if (extra.title) form.append("title", extra.title);
  if (extra.alt_text) form.append("alt_text", extra.alt_text);
  return api.post<MediaAsset>("/admin/cms/media/", form);
}

/** Browse the image library (and upload, when permitted) to pick one image. */
export function MediaPickerDialog({
  open,
  onOpenChange,
  onSelect,
  canUpload = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: MediaAsset) => void;
  canUpload?: boolean;
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<MediaAsset> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    api
      .get<Paginated<MediaAsset>>("/admin/cms/media/", {
        query: { kind: "image", search: query, page, page_size: 24 },
        signal: controller.signal,
      })
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      });
    return () => controller.abort();
  }, [open, query, page]);

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadMedia(file, { title: file.name.replace(/\.[^.]+$/, "") });
      if (asset.kind !== "image") {
        toast.error("That file is not an image.");
        return;
      }
      toast.success("Image uploaded. Remember to add alt text in the media library.");
      onSelect(asset);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Choose an image" className="max-w-3xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, alt text or file name"
              aria-label="Search images"
              className="pl-9"
            />
          </div>
          {canUpload && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={IMAGE_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} loading={uploading}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Upload new
              </Button>
            </>
          )}
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        {!data && !error ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="aspect-square w-full" />
            ))}
          </div>
        ) : data && data.results.length === 0 ? (
          <EmptyState icon={ImageIcon} title={query ? "No images match your search" : "The media library has no images yet"} />
        ) : data ? (
          <>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {data.results.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(asset);
                      onOpenChange(false);
                    }}
                    className="group block w-full overflow-hidden rounded-lg border border-line bg-page text-left focus-visible:outline-2 focus-visible:outline-teal"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnails of arbitrary size */}
                    <img src={asset.url} alt="" className="aspect-square w-full object-cover transition group-hover:opacity-90" />
                    <span className="block truncate px-2 py-1.5 text-xs text-body">{asset.title || asset.original_name}</span>
                    {!asset.alt_text && <span className="block px-2 pb-1.5 text-[0.7rem] text-warning">No alt text</span>}
                  </button>
                </li>
              ))}
            </ul>
            {data.total_pages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <Button variant="outline" size="sm" disabled={!data.previous} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="text-muted">
                  Page {data.page} of {data.total_pages}
                </span>
                <Button variant="outline" size="sm" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * Form control holding a media-library image id. `detail` is the resolved
 * image when the caller already has it; otherwise it is fetched for the preview.
 */
export function ImageInput({
  id,
  value,
  detail,
  onChange,
  canUpload,
  invalid,
  readOnly = false,
}: {
  id?: string;
  value: number | null;
  detail?: MediaRef | null;
  onChange: (value: number | null, ref: MediaRef | null) => void;
  canUpload?: boolean;
  invalid?: boolean;
  /** Show the current image without the picker (for staff who cannot browse the media library). */
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState<MediaRef | null>(null);
  const preview = detail && detail.id === value ? detail : fetched && fetched.id === value ? fetched : null;

  useEffect(() => {
    if (value == null || readOnly || (detail && detail.id === value)) return;
    const controller = new AbortController();
    api
      .get<MediaAsset>(`/admin/cms/media/${value}/`, { signal: controller.signal })
      .then((asset) => setFetched(toMediaRef(asset)))
      .catch(() => undefined);
    return () => controller.abort();
  }, [value, detail, readOnly]);

  return (
    <div id={id} className={cn("flex items-center gap-3 rounded-lg border border-line bg-white p-2", invalid && "border-danger")}>
      <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-page">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview
          <img src={preview.url} alt={preview.alt} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted" aria-hidden="true" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-xs text-muted">
          {value == null ? "No image selected" : preview ? preview.alt || "No alt text set" : `Image #${value}`}
        </span>
        {readOnly ? (
          <span className="text-xs text-muted">Ask a content editor to change this image.</span>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
              {value == null ? "Choose image" : "Change"}
            </Button>
            {value != null && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null, null)} aria-label="Remove image">
                <X className="h-4 w-4" aria-hidden="true" />
                Remove
              </Button>
            )}
          </div>
        )}
      </div>
      {!readOnly && (
        <MediaPickerDialog
          open={open}
          onOpenChange={setOpen}
          canUpload={canUpload}
          onSelect={(asset) => {
            const ref = toMediaRef(asset);
            setFetched(ref);
            onChange(asset.id, ref);
          }}
        />
      )}
    </div>
  );
}
