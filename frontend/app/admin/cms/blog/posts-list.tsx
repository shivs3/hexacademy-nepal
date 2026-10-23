"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock, Newspaper, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { LoadError, Pager, SearchBox, StatusBadge, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { applyServerErrors } from "@/lib/forms";
import { formatDateTime } from "@/lib/utils";
import { slugField, slugify } from "@/lib/validation/cms";
import type { Paginated } from "@/types/accounts";
import type { AdminPost, AdminPostSummary } from "@/types/cms-admin";

export const POST_SLUG_MAX = 140;

export function PostsList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<AdminPostSummary>>("/admin/cms/blog/posts/", { search: q, status, page });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search posts"
          placeholder="Search title, slug or excerpt"
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="sm:w-44"
        >
          <option value="">Any status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New post
        </Button>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title={q || status ? "No posts match these filters" : "No posts yet"}
          description={q || status ? undefined : "Write the first article for the blog."}
        />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Post</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>Author</th>
                  <th scope="col" className={th}>Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link href={`/admin/cms/blog/${p.id}`} className="font-medium text-navy hover:text-teal-700 hover:underline">
                        {p.title}
                      </Link>
                      <p className="text-xs text-muted">/blog/{p.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.is_scheduled ? (
                          <Badge tone="mint">
                            <CalendarClock className="h-3 w-3" aria-hidden="true" />
                            Scheduled {formatDateTime(p.published_at)}
                          </Badge>
                        ) : (
                          <StatusBadge status={p.status} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{p.author_name || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDateTime(p.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager data={data} onPage={setPage} />
        </Card>
      ) : null}

      {creating && <NewPostDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

const newPostSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200),
  slug: slugField(POST_SLUG_MAX),
});
type NewPostValues = z.infer<typeof newPostSchema>;

function NewPostDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const form = useForm<NewPostValues>({ resolver: zodResolver(newPostSchema), defaultValues: { title: "", slug: "" } });
  const { register, handleSubmit, setValue, setError, formState } = form;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const created = await api.post<AdminPost>("/admin/cms/blog/posts/", values);
      router.push(`/admin/cms/blog/${created.id}`);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["title", "slug"]));
    }
  });

  const title = register("title");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New post"
      description="The post starts as a draft. Nothing is public until you publish it."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-post-form" loading={formState.isSubmitting}>
            Create draft
          </Button>
        </>
      }
    >
      <form id="new-post-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Title" htmlFor="new-post-title" error={formState.errors.title?.message} required>
          <Input
            {...title}
            autoFocus
            onChange={(e) => {
              void title.onChange(e);
              if (!slugTouched) setValue("slug", slugify(e.target.value, POST_SLUG_MAX));
            }}
          />
        </Field>
        <Field
          label="Address"
          htmlFor="new-post-slug"
          error={formState.errors.slug?.message}
          hint="Lowercase letters, numbers and hyphens. The post will live at /blog/your-slug."
          required
        >
          <Input {...register("slug", { onChange: () => setSlugTouched(true) })} />
        </Field>
      </form>
    </Dialog>
  );
}
