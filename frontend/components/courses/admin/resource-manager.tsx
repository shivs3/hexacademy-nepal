"use client";

import { Check, Download, ExternalLink, FileUp, Link2, Pencil, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatBytes } from "@/lib/utils";
import type { AdminResource } from "@/types/catalog-admin";

const MAX_RESOURCES = 30;

/**
 * Downloads and links attached to a lesson. Files go to private storage; the server checks
 * their type and size, and learners download them through an enrollment-checked endpoint.
 */
export function ResourceManager({
  lessonId,
  resources,
  canEdit,
  onChange,
}: {
  lessonId: number;
  resources: AdminResource[];
  canEdit: boolean;
  onChange: (resources: AdminResource[]) => void;
}) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<"idle" | "link">("idle");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkErrors, setLinkErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: number; title: string } | null>(null);
  const [removing, setRemoving] = useState<AdminResource | null>(null);
  const [busy, setBusy] = useState(false);
  const full = resources.length >= MAX_RESOURCES;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const added: AdminResource[] = [];
    for (const file of Array.from(files)) {
      if (resources.length + added.length >= MAX_RESOURCES) break;
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name.replace(/\.[^.]+$/, ""));
      try {
        added.push(await api.post<AdminResource>(`/admin/catalog/lessons/${lessonId}/resources/`, form));
      } catch (err) {
        const fields = isApiError(err) ? err.fieldErrors() : {};
        toast.error(`${file.name}: ${fields.file ?? errorMessage(err)}`);
      }
    }
    if (added.length) {
      onChange([...resources, ...added]);
      toast.success(added.length === 1 ? "File uploaded." : `${added.length} files uploaded.`);
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api.post<AdminResource>(`/admin/catalog/lessons/${lessonId}/resources/`, { title: linkTitle, url: linkUrl.trim() });
      onChange([...resources, created]);
      setMode("idle");
      setLinkTitle("");
      setLinkUrl("");
      setLinkErrors({});
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setLinkErrors(Object.keys(fields).length ? fields : { url: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    if (!editing) return;
    setBusy(true);
    try {
      const saved = await api.patch<AdminResource>(`/admin/catalog/resources/${editing.id}/`, { title: editing.title });
      onChange(resources.map((r) => (r.id === saved.id ? saved : r)));
      setEditing(null);
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      toast.error(fields.title ?? errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(resource: AdminResource) {
    setBusy(true);
    try {
      await api.delete(`/admin/catalog/resources/${resource.id}/`);
      onChange(resources.filter((r) => r.id !== resource.id));
      setRemoving(null);
      toast.success("Resource removed.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {resources.length === 0 ? (
        <p className="text-sm text-muted">No resources. Attach slides, notes, code or links for learners.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {resources.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              {r.kind === "file" ? <FileUp className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" /> : <Link2 className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
              {editing?.id === r.id ? (
                <form
                  className="flex flex-1 items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void rename();
                  }}
                >
                  <Input value={editing.title} maxLength={160} autoFocus aria-label="Resource title" onChange={(e) => setEditing({ id: r.id, title: e.target.value })} />
                  <Button type="submit" variant="ghost" size="icon" loading={busy} aria-label="Save title">
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setEditing(null)} aria-label="Cancel rename">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-navy">{r.title}</p>
                    <p className="truncate text-xs text-muted">
                      {r.kind === "file" ? [r.original_name, r.size_bytes != null ? formatBytes(r.size_bytes) : null].filter(Boolean).join(" · ") : r.url}
                    </p>
                  </div>
                  {r.kind === "file" ? (
                    <Button asChild variant="ghost" size="icon">
                      <a href={`/api/v1/admin/catalog/resources/${r.id}/download/`} aria-label={`Download ${r.title}`}>
                        <Download className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </Button>
                  ) : (
                    <Button asChild variant="ghost" size="icon">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${r.title}`}>
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </Button>
                  )}
                  {canEdit && (
                    <>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setEditing({ id: r.id, title: r.title })} aria-label={`Rename ${r.title}`}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="text-danger" onClick={() => setRemoving(r)} aria-label={`Remove ${r.title}`}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && mode === "link" && (
        <form onSubmit={addLink} className="flex flex-col gap-3 rounded-lg border border-line bg-page p-3" noValidate>
          <Field label="Link title" htmlFor="resource-link-title" error={linkErrors.title} required>
            <Input value={linkTitle} maxLength={160} autoFocus onChange={(e) => setLinkTitle(e.target.value)} />
          </Field>
          <Field label="Address" htmlFor="resource-link-url" error={linkErrors.url ?? linkErrors.non_field_errors} required>
            <Input type="url" inputMode="url" value={linkUrl} maxLength={500} placeholder="https://…" onChange={(e) => setLinkUrl(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={busy}>
              Add link
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInput} type="file" multiple className="sr-only" id={`resource-upload-${lessonId}`} onChange={(e) => void upload(e.target.files)} disabled={full || uploading} />
          <Button type="button" variant="outline" size="sm" disabled={full} loading={uploading} onClick={() => fileInput.current?.click()}>
            <FileUp className="h-4 w-4" aria-hidden="true" />
            Upload files
          </Button>
          {mode === "idle" && (
            <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => setMode("link")}>
              <Link2 className="h-4 w-4" aria-hidden="true" />
              Add link
            </Button>
          )}
          <span className="text-xs text-muted">
            {resources.length} of {MAX_RESOURCES} · PDF, slides, documents, images, archives and code files
          </span>
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this resource?"
        description={removing?.kind === "file" ? "The file is deleted from storage." : "The link is removed from the lesson."}
        confirmLabel="Remove"
        tone="danger"
        loading={busy}
        onConfirm={() => removing && remove(removing)}
      />
    </div>
  );
}
