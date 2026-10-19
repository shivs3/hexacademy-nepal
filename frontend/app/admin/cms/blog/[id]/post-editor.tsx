"use client";

import { Archive, ArrowLeft, CalendarClock, CalendarX, ExternalLink, Eye, MoreHorizontal, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { LoadError, StatusBadge } from "@/components/cms/admin/list-parts";
import { ImageInput } from "@/components/cms/admin/media-picker";
import { RichTextEditor } from "@/components/cms/admin/rich-text-editor";
import { ScheduleDialog } from "@/components/cms/admin/schedule-dialog";
import { SeoFields, type SeoValues } from "@/components/cms/admin/seo-fields";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert, Badge, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { useSaveShortcut, useUnsavedWarning } from "@/hooks/use-unsaved-warning";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils";
import type { MediaRef } from "@/types/cms";
import type { AdminBlogCategory, AdminPost, AuthorOption } from "@/types/cms-admin";

import { POST_SLUG_MAX } from "../posts-list";

type Draft = SeoValues & {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  cover: number | null;
  cover_detail: MediaRef | null;
  author: number | null;
  categories: number[];
};
type Action = "publish" | "unpublish" | "archive";

function toDraft(p: AdminPost): Draft {
  return {
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt,
    body: p.body,
    cover: p.cover,
    cover_detail: p.cover_detail,
    author: p.author,
    categories: p.categories,
    meta_title: p.meta_title,
    meta_description: p.meta_description,
    canonical_url: p.canonical_url,
    og_image: p.og_image,
    og_image_detail: p.og_image_detail,
    noindex: p.noindex,
  };
}

/** The fields the API accepts (image details are display-only). */
function payload(d: Draft) {
  return {
    title: d.title,
    slug: d.slug,
    excerpt: d.excerpt,
    body: d.body,
    cover: d.cover,
    author: d.author,
    categories: [...d.categories].sort((a, b) => a - b),
    meta_title: d.meta_title,
    meta_description: d.meta_description,
    canonical_url: d.canonical_url,
    og_image: d.og_image,
    noindex: d.noindex,
  };
}

export function PostEditor({ postId, canPublish, canUpload }: { postId: number; canPublish: boolean; canUpload: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const postRes = useApiResource<AdminPost>(`/admin/cms/blog/posts/${postId}/`);
  const categoriesRes = useApiResource<AdminBlogCategory[]>("/admin/cms/blog/categories/");
  const authorsRes = useApiResource<AuthorOption[]>("/admin/cms/blog/authors/");
  const [post, setPost] = useState<AdminPost | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Action | "delete" | null>(null);
  const [scheduling, setScheduling] = useState(false);

  // Adopt the server copy when it first arrives.
  if (postRes.data && post === null) {
    setPost(postRes.data);
    setDraft(toDraft(postRes.data));
  }

  const dirty = useMemo(
    () => Boolean(post && draft && JSON.stringify(payload(draft)) !== JSON.stringify(payload(toDraft(post)))),
    [post, draft],
  );
  useUnsavedWarning(dirty);

  const adopt = useCallback((p: AdminPost) => {
    setPost(p);
    setDraft(toDraft(p));
  }, []);

  const isLive = post?.status === "published";
  // The API refuses edits to a published post from staff without publishing rights.
  const readOnly = Boolean(isLive && !canPublish);

  const save = useCallback(async (): Promise<AdminPost | null> => {
    if (!draft || !post) return null;
    if (!dirty) return post;
    setSaving(true);
    setFormError(null);
    try {
      const saved = await api.patch<AdminPost>(`/admin/cms/blog/posts/${postId}/`, payload(draft));
      adopt(saved);
      setErrors({});
      return saved;
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? "Some fields need attention." : errorMessage(err));
      return null;
    } finally {
      setSaving(false);
    }
  }, [adopt, dirty, draft, post, postId]);

  const onSave = useCallback(() => {
    void save().then((p) => p && toast.success(p.status === "published" ? "Post updated. The changes are live." : "Draft saved."));
  }, [save, toast]);
  useSaveShortcut(onSave, dirty && !readOnly);

  async function runAction(action: Action, body?: unknown) {
    setBusy(action);
    try {
      if (action === "publish") {
        const saved = await save();
        if (!saved) return;
      }
      const updated = await api.post<AdminPost>(`/admin/cms/blog/posts/${postId}/${action}/`, body ?? {});
      adopt(updated);
      setConfirm(null);
      setScheduling(false);
      toast.success(
        action === "publish"
          ? updated.is_scheduled
            ? `Scheduled for ${formatDateTime(updated.published_at)} (Nepal time).`
            : "Post published."
          : action === "unpublish"
            ? "Post moved back to drafts."
            : "Post archived.",
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await api.delete(`/admin/cms/blog/posts/${postId}/`);
      toast.success("Post deleted.");
      router.push("/admin/cms/blog");
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  async function preview() {
    // Open synchronously so pop-up blockers allow it, then point it at the saved post.
    const win = window.open("about:blank", "_blank");
    const saved = readOnly ? post : await save();
    if (!saved) {
      win?.close();
      return;
    }
    if (win) win.location.href = `/preview/posts/${postId}`;
  }

  if (postRes.error && !post) return <LoadError message={postRes.error} onRetry={postRes.reload} />;
  if (!post || !draft) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const isArchived = post.status === "archived";
  const toggleCategory = (id: number, on: boolean) =>
    update({ categories: on ? [...draft.categories, id] : draft.categories.filter((c) => c !== id) });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin/cms/blog" className="inline-flex items-center gap-1 text-sm text-muted hover:text-navy">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All posts
        </Link>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{draft.title || "Untitled post"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {post.is_scheduled ? (
              <Badge tone="mint">
                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                Scheduled {formatDateTime(post.published_at)}
              </Badge>
            ) : (
              <StatusBadge status={post.status} />
            )}
            {dirty && <Badge tone="warning">Unsaved edits</Badge>}
            {isLive && !post.is_scheduled && (
              <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-teal-700">
                /blog/{post.slug}
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
          {!readOnly && (
            <Button variant={canPublish && !isLive ? "outline" : "primary"} onClick={onSave} disabled={!dirty} loading={saving && !busy}>
              {isLive ? "Update post" : "Save draft"}
            </Button>
          )}
          {canPublish && !isLive && !isArchived && (
            <Button onClick={() => setConfirm("publish")} loading={busy === "publish"}>
              Publish
            </Button>
          )}
          <Menu
            trigger={
              <Button variant="outline" size="icon" aria-label="More post actions">
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            }
          >
            {canPublish && !isLive && !isArchived && (
              <MenuItem onSelect={() => setScheduling(true)}>
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Schedule publication…
              </MenuItem>
            )}
            {canPublish && post.is_scheduled && (
              <MenuItem onSelect={() => runAction("unpublish")}>
                <CalendarX className="h-4 w-4" aria-hidden="true" />
                Cancel schedule
              </MenuItem>
            )}
            {canPublish && isLive && !post.is_scheduled && (
              <MenuItem onSelect={() => setConfirm("unpublish")}>
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Unpublish
              </MenuItem>
            )}
            {canPublish && isArchived && (
              <MenuItem onSelect={() => runAction("unpublish")}>
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Restore as draft
              </MenuItem>
            )}
            {canPublish && !isArchived && (
              <MenuItem onSelect={() => setConfirm("archive")}>
                <Archive className="h-4 w-4" aria-hidden="true" />
                Archive
              </MenuItem>
            )}
            {!isLive && (
              <>
                <MenuSeparator />
                <MenuItem danger onSelect={() => setConfirm("delete")}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete post
                </MenuItem>
              </>
            )}
            {isLive && !canPublish && <MenuItem disabled>No actions available</MenuItem>}
          </Menu>
        </div>
      </div>

      {readOnly && <Alert tone="info">This post is live. Only staff who can publish posts may change it.</Alert>}
      {!readOnly && isLive && <Alert tone="info">This post is live: saving updates it for visitors immediately.</Alert>}
      {!canPublish && !isLive && <Alert tone="info">You can write and save drafts. Someone with publishing rights makes posts live.</Alert>}
      {formError && <Alert tone="danger">{formError}</Alert>}

      <fieldset disabled={readOnly} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <Field label="Title" htmlFor="post-title" error={errors.title} required>
                <Input value={draft.title} maxLength={200} onChange={(e) => update({ title: e.target.value })} />
              </Field>
              <Field label="Excerpt" htmlFor="post-excerpt" error={errors.excerpt} hint={`Shown on blog listings. ${draft.excerpt.length}/400`}>
                <Textarea value={draft.excerpt} maxLength={400} rows={3} onChange={(e) => update({ excerpt: e.target.value })} />
              </Field>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="post-body">Article</Label>
                <RichTextEditor id="post-body" value={draft.body} invalid={!!errors.body} onChange={(body) => update({ body })} placeholderLabel="Write the article…" />
                {errors.body && <p className="text-xs text-danger">{errors.body}</p>}
              </div>
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

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Field label="Address" htmlFor="post-slug" error={errors.slug} hint={`/blog/${draft.slug}`} required>
                <Input value={draft.slug} maxLength={POST_SLUG_MAX} onChange={(e) => update({ slug: e.target.value.toLowerCase() })} />
              </Field>
              {isLive && draft.slug !== post.slug && <Alert tone="warning">Changing the address of a live post breaks existing links to it.</Alert>}
              <Field label="Author" htmlFor="post-author" error={errors.author}>
                <Select
                  value={draft.author ?? ""}
                  disabled={!authorsRes.data}
                  onChange={(e) => update({ author: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">No author shown</option>
                  {authorsRes.data?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name || a.email}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="post-cover">Cover image</Label>
                <ImageInput
                  id="post-cover"
                  value={draft.cover}
                  detail={draft.cover_detail}
                  canUpload={canUpload}
                  invalid={!!errors.cover}
                  onChange={(cover, ref) => update({ cover, cover_detail: ref })}
                />
                {errors.cover && <p className="text-xs text-danger">{errors.cover}</p>}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-2">
              {categoriesRes.error ? (
                <LoadError message={categoriesRes.error} onRetry={categoriesRes.reload} />
              ) : !categoriesRes.data ? (
                <Skeleton className="h-16 w-full" />
              ) : categoriesRes.data.length === 0 ? (
                <p className="text-sm text-muted">
                  No categories yet.{" "}
                  <Link href="/admin/cms/blog/categories" className="font-medium text-teal-700 underline">
                    Create one
                  </Link>
                </p>
              ) : (
                categoriesRes.data.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`cat-${c.id}`}
                      checked={draft.categories.includes(c.id)}
                      onChange={(e) => toggleCategory(c.id, e.target.checked)}
                    />
                    <Label htmlFor={`cat-${c.id}`} className="font-normal">
                      {c.name}
                    </Label>
                  </div>
                ))
              )}
              {errors.categories && <p className="text-xs text-danger">{errors.categories}</p>}
            </CardBody>
          </Card>
          <p className="text-xs text-muted">
            Created {formatDateTime(post.created_at)} · Last updated {formatDateTime(post.updated_at)}
          </p>
        </div>
      </fieldset>

      <ConfirmDialog
        open={confirm === "publish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Publish this post?"
        description={dirty ? "Your edits will be saved and the post will be visible to everyone immediately." : "The post will be visible to everyone immediately."}
        confirmLabel="Publish"
        loading={busy === "publish"}
        onConfirm={() => runAction("publish")}
      />
      <ConfirmDialog
        open={confirm === "unpublish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Unpublish this post?"
        description="Visitors will get a ‘page not found’ error. The post returns to drafts."
        confirmLabel="Unpublish"
        tone="danger"
        loading={busy === "unpublish"}
        onConfirm={() => runAction("unpublish")}
      />
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Archive this post?"
        description="Archived posts are hidden from the blog and kept for reference."
        confirmLabel="Archive"
        tone="danger"
        loading={busy === "archive"}
        onConfirm={() => runAction("archive")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this post permanently?"
        description="This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={busy === "delete"}
        onConfirm={remove}
      />
      {scheduling && (
        <ScheduleDialog
          description={dirty ? "Your edits are saved first, then the post goes live at the chosen time." : "The post goes live at the chosen time."}
          current={null}
          loading={busy === "publish"}
          onClose={() => setScheduling(false)}
          onSchedule={(iso) => void runAction("publish", { publish_at: iso })}
        />
      )}
    </div>
  );
}
