"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarClock,
  CalendarX,
  Copy,
  ExternalLink,
  Eye,
  Home,
  MoreHorizontal,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { LoadError, StatusBadge } from "@/components/cms/admin/list-parts";
import { ScheduleDialog } from "@/components/cms/admin/schedule-dialog";
import { SectionBuilder } from "@/components/cms/admin/section-builder";
import { SeoFields, type SeoValues } from "@/components/cms/admin/seo-fields";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert, Badge, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { useSaveShortcut, useUnsavedWarning } from "@/hooks/use-unsaved-warning";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { cn, formatDateTime } from "@/lib/utils";
import type { AdminPage, DraftSection, SectionTypeInfo } from "@/types/cms-admin";

import { PageHistory } from "./page-history";

type Draft = SeoValues & { title: string; slug: string; sections: DraftSection[] };
type Tab = "content" | "settings" | "history";
type Action = "publish" | "unpublish" | "archive" | "unarchive" | "make-home" | "cancel-schedule";

const SETTINGS_FIELDS = ["title", "slug", "meta_title", "meta_description", "canonical_url", "og_image", "noindex"];

function toDraft(p: AdminPage): Draft {
  return {
    title: p.title,
    slug: p.slug,
    sections: p.sections,
    meta_title: p.meta_title,
    meta_description: p.meta_description,
    canonical_url: p.canonical_url,
    og_image: p.og_image,
    og_image_detail: p.og_image_detail,
    noindex: p.noindex,
  };
}

/** The fields the API accepts (the image detail is display-only). */
function payload(d: Draft) {
  return {
    title: d.title,
    slug: d.slug,
    sections: d.sections,
    meta_title: d.meta_title,
    meta_description: d.meta_description,
    canonical_url: d.canonical_url,
    og_image: d.og_image,
    noindex: d.noindex,
  };
}

export function PageEditor({ pageId, canPublish }: { pageId: number; canPublish: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const pageRes = useApiResource<AdminPage>(`/admin/cms/pages/${pageId}/`);
  const typesRes = useApiResource<SectionTypeInfo[]>("/admin/cms/section-types/");
  const [page, setPage] = useState<AdminPage | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("content");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Action | "delete" | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  // Adopt the server copy when it first arrives.
  if (pageRes.data && page === null) {
    setPage(pageRes.data);
    setDraft(toDraft(pageRes.data));
  }

  const dirty = useMemo(
    () => Boolean(page && draft && JSON.stringify(payload(draft)) !== JSON.stringify(payload(toDraft(page)))),
    [page, draft],
  );
  useUnsavedWarning(dirty);

  const adopt = useCallback((p: AdminPage) => {
    setPage(p);
    setDraft(toDraft(p));
    setHistoryKey((k) => k + 1);
  }, []);

  /** Save the draft; resolves to the saved page, or null when validation failed. */
  const save = useCallback(async (): Promise<AdminPage | null> => {
    if (!draft || !page) return null;
    if (!dirty) return page;
    setSaving(true);
    setFormError(null);
    try {
      const saved = await api.patch<AdminPage>(`/admin/cms/pages/${pageId}/`, payload(draft));
      adopt(saved);
      setErrors({});
      return saved;
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setErrors(fields);
      const keys = Object.keys(fields);
      if (keys.length) {
        const inSettings = keys.some((k) => SETTINGS_FIELDS.includes(k));
        const inContent = keys.some((k) => k.startsWith("sections"));
        setFormError(
          `Some fields need attention${inSettings && !inContent ? " on the Page settings tab" : inContent && !inSettings ? " in the sections below" : ""}.`,
        );
        if (inSettings && !inContent) setTab("settings");
        if (inContent && !inSettings) setTab("content");
      } else {
        setFormError(errorMessage(err));
      }
      return null;
    } finally {
      setSaving(false);
    }
  }, [adopt, dirty, draft, page, pageId]);

  const onShortcut = useCallback(() => {
    void save().then((p) => p && toast.success("Draft saved."));
  }, [save, toast]);
  useSaveShortcut(onShortcut, dirty);

  async function runAction(action: Action, body?: unknown) {
    setBusy(action);
    try {
      if (action === "publish" || action === "make-home") {
        const saved = await save();
        if (!saved) return;
      }
      const updated = await api.post<AdminPage>(`/admin/cms/pages/${pageId}/${action}/`, body ?? {});
      adopt(updated);
      setConfirm(null);
      setScheduling(false);
      toast.success(
        {
          publish: "Page published.",
          unpublish: "Page unpublished. It is no longer public.",
          archive: "Page archived.",
          unarchive: "Page restored from the archive as a draft.",
          "make-home": "This page is now the home page.",
          "cancel-schedule": "Scheduled publication cancelled.",
        }[action],
      );
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function duplicate() {
    setBusy("duplicate");
    try {
      const copy = await api.post<AdminPage>(`/admin/cms/pages/${pageId}/duplicate/`);
      toast.success("Copy created as a draft.");
      router.push(`/admin/cms/pages/${copy.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await api.delete(`/admin/cms/pages/${pageId}/`);
      toast.success("Page deleted.");
      router.push("/admin/cms/pages");
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  async function preview() {
    // Open the tab synchronously so pop-up blockers allow it, then point it at the saved draft.
    const win = window.open("about:blank", "_blank");
    const saved = await save();
    if (!saved) {
      win?.close();
      return;
    }
    if (win) win.location.href = `/preview/pages/${pageId}`;
  }

  if (pageRes.error && !page) return <LoadError message={pageRes.error} onRetry={pageRes.reload} />;
  if (!page || !draft) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const isPublished = page.status === "published";
  const isArchived = page.status === "archived";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin/cms/pages" className="inline-flex items-center gap-1 text-sm text-muted hover:text-navy">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All pages
        </Link>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{draft.title || "Untitled page"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusBadge status={page.status} />
            {page.is_home && (
              <Badge tone="teal">
                <Home className="h-3 w-3" aria-hidden="true" />
                Home page
              </Badge>
            )}
            {page.has_unpublished_changes && <Badge tone="teal">Unpublished changes</Badge>}
            {dirty && <Badge tone="warning">Unsaved edits</Badge>}
            {page.scheduled_for && (
              <Badge tone="mint">
                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                Publishes v{page.scheduled_version_number} {formatDateTime(page.scheduled_for)}
              </Badge>
            )}
            {isPublished && (
              <a href={page.path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-teal-700">
                {page.path}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={preview} disabled={saving}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            Preview
          </Button>
          <Button variant={canPublish ? "outline" : "primary"} onClick={onShortcut} disabled={!dirty} loading={saving && !busy}>
            Save draft
          </Button>
          {canPublish && (
            <Button onClick={() => setConfirm("publish")} disabled={isArchived || (!dirty && isPublished && !page.has_unpublished_changes)} loading={busy === "publish"}>
              {isPublished ? "Publish changes" : "Publish"}
            </Button>
          )}
          <Menu
            trigger={
              <Button variant="outline" size="icon" aria-label="More page actions">
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            }
          >
            {canPublish && !isArchived && (
              <MenuItem onSelect={() => setScheduling(true)}>
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Schedule publication…
              </MenuItem>
            )}
            {canPublish && page.scheduled_for && (
              <MenuItem onSelect={() => runAction("cancel-schedule")}>
                <CalendarX className="h-4 w-4" aria-hidden="true" />
                Cancel schedule
              </MenuItem>
            )}
            {canPublish && isPublished && !page.is_home && (
              <MenuItem onSelect={() => setConfirm("make-home")}>
                <Home className="h-4 w-4" aria-hidden="true" />
                Make home page
              </MenuItem>
            )}
            {canPublish && isPublished && !page.is_home && (
              <MenuItem onSelect={() => setConfirm("unpublish")}>
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Unpublish
              </MenuItem>
            )}
            {canPublish && !isArchived && !page.is_home && (
              <MenuItem onSelect={() => setConfirm("archive")}>
                <Archive className="h-4 w-4" aria-hidden="true" />
                Archive
              </MenuItem>
            )}
            {canPublish && isArchived && (
              <MenuItem onSelect={() => runAction("unarchive")}>
                <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                Restore from archive
              </MenuItem>
            )}
            <MenuItem onSelect={duplicate} disabled={busy === "duplicate"}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Duplicate
            </MenuItem>
            {!isPublished && !page.is_home && (
              <>
                <MenuSeparator />
                <MenuItem danger onSelect={() => setConfirm("delete")}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete page
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>

      {!canPublish && (
        <Alert tone="info">You can edit and save drafts. Someone with publishing rights makes changes live.</Alert>
      )}
      {formError && <Alert tone="danger">{formError}</Alert>}

      <div role="tablist" aria-label="Editor" className="flex gap-1 border-b border-line">
        {(
          [
            ["content", "Content"],
            ["settings", "Page settings"],
            ["history", "History"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === key ? "border-teal text-navy" : "border-transparent text-muted hover:text-navy",
            )}
          >
            {label}
            {key === "settings" && Object.keys(errors).some((k) => SETTINGS_FIELDS.includes(k)) && (
              <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-danger" aria-label="has errors" />
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "content" &&
          (typesRes.error ? (
            <LoadError message={typesRes.error} onRetry={typesRes.reload} />
          ) : !typesRes.data ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <SectionBuilder sections={draft.sections} onChange={(sections) => update({ sections })} types={typesRes.data} errors={errors} />
          ))}

        {tab === "settings" && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Page</CardTitle>
              </CardHeader>
              <CardBody className="flex flex-col gap-4">
                <Field label="Title" htmlFor="page-title" error={errors.title} required>
                  <Input value={draft.title} maxLength={200} onChange={(e) => update({ title: e.target.value })} />
                </Field>
                <Field
                  label="Address"
                  htmlFor="page-slug"
                  error={errors.slug}
                  hint={page.is_home ? "The home page is served at /; this slug redirects there." : `The page lives at /${draft.slug}.`}
                  required
                >
                  <Input value={draft.slug} maxLength={120} onChange={(e) => update({ slug: e.target.value.toLowerCase() })} />
                </Field>
                {isPublished && draft.slug !== page.slug && (
                  <Alert tone="warning">Changing the address of a published page breaks existing links to it.</Alert>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Search and sharing</CardTitle>
              </CardHeader>
              <CardBody>
                <SeoFields value={draft} onChange={update} errors={errors} fallbackTitle={draft.title} />
              </CardBody>
            </Card>
          </div>
        )}

        {tab === "history" && (
          <PageHistory
            key={historyKey}
            pageId={pageId}
            canPublish={canPublish}
            dirty={dirty}
            onRestored={(p) => {
              adopt(p);
              setTab("content");
            }}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirm === "publish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={isPublished ? "Publish these changes?" : "Publish this page?"}
        description={
          dirty
            ? "Your edits will be saved and the new version will be visible to everyone immediately."
            : "The latest saved version will be visible to everyone immediately."
        }
        confirmLabel="Publish"
        loading={busy === "publish"}
        onConfirm={() => runAction("publish")}
      />
      <ConfirmDialog
        open={confirm === "unpublish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Unpublish this page?"
        description="Visitors will get a ‘page not found’ error. Menu links to it are hidden until it is published again."
        confirmLabel="Unpublish"
        tone="danger"
        loading={busy === "unpublish"}
        onConfirm={() => runAction("unpublish")}
      />
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Archive this page?"
        description="Archived pages are unpublished and kept for reference. You can restore them later."
        confirmLabel="Archive"
        tone="danger"
        loading={busy === "archive"}
        onConfirm={() => runAction("archive")}
      />
      <ConfirmDialog
        open={confirm === "make-home"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Make this the home page?"
        description="It will be shown at the root address (/) instead of the current home page."
        confirmLabel="Make home page"
        loading={busy === "make-home"}
        onConfirm={() => runAction("make-home")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this page permanently?"
        description="The page and its entire version history are removed. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={busy === "delete"}
        onConfirm={remove}
      />
      {scheduling && (
        <ScheduleDialog
          description={
            dirty
              ? "Your edits are saved first; the saved version is published at the chosen time."
              : "The latest saved version is published at the chosen time."
          }
          current={page.scheduled_for}
          loading={busy === "schedule"}
          onClose={() => setScheduling(false)}
          onSchedule={async (iso) => {
            setBusy("schedule");
            try {
              const saved = await save();
              if (!saved) return;
              const updated = await api.post<AdminPage>(`/admin/cms/pages/${pageId}/schedule/`, { publish_at: iso });
              adopt(updated);
              setScheduling(false);
              toast.success(`Scheduled for ${formatDateTime(iso)} (Nepal time).`);
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(null);
            }
          }}
        />
      )}
    </div>
  );
}
