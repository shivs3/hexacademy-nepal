"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock, FileText, Home, Plus } from "lucide-react";
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
import { slugify, slugSchema } from "@/lib/validation/cms";
import type { Paginated } from "@/types/accounts";
import type { AdminPage, AdminPageSummary } from "@/types/cms-admin";

export function PagesList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<AdminPageSummary>>("/admin/cms/pages/", { search: q, status, page });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search pages"
          placeholder="Search title or slug"
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
          New page
        </Button>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={q || status ? "No pages match these filters" : "No pages yet"}
          description={q || status ? undefined : "Create the first page of the website."}
        />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Page</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link href={`/admin/cms/pages/${p.id}`} className="font-medium text-navy hover:text-teal-700 hover:underline">
                        {p.title}
                      </Link>
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        {p.is_home && <Home className="h-3.5 w-3.5 text-teal" aria-label="Home page" />}
                        {p.path}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={p.status} />
                        {p.has_unpublished_changes && <Badge tone="teal">Unpublished changes</Badge>}
                        {p.scheduled_for && (
                          <Badge tone="mint">
                            <CalendarClock className="h-3 w-3" aria-hidden="true" />
                            {formatDateTime(p.scheduled_for)}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {formatDateTime(p.updated_at)}
                      {p.updated_by_name && <span className="block">by {p.updated_by_name}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager data={data} onPage={setPage} />
        </Card>
      ) : null}

      {creating && <NewPageDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

const newPageSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200),
  slug: slugSchema,
});
type NewPageValues = z.infer<typeof newPageSchema>;

function NewPageDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const form = useForm<NewPageValues>({ resolver: zodResolver(newPageSchema), defaultValues: { title: "", slug: "" } });
  const { register, handleSubmit, setValue, setError, formState } = form;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const created = await api.post<AdminPage>("/admin/cms/pages/", { ...values, sections: [] });
      router.push(`/admin/cms/pages/${created.id}`);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["title", "slug"]));
    }
  });

  const title = register("title");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New page"
      description="The page starts as a draft. Nothing is public until you publish it."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-page-form" loading={formState.isSubmitting}>
            Create draft
          </Button>
        </>
      }
    >
      <form id="new-page-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Title" htmlFor="new-title" error={formState.errors.title?.message} required>
          <Input
            {...title}
            autoFocus
            onChange={(e) => {
              void title.onChange(e);
              if (!slugTouched) setValue("slug", slugify(e.target.value));
            }}
          />
        </Field>
        <Field label="Address" htmlFor="new-slug" error={formState.errors.slug?.message} hint="Lowercase letters, numbers and hyphens. The page will live at /your-slug." required>
          <Input {...register("slug", { onChange: () => setSlugTouched(true) })} />
        </Field>
      </form>
    </Dialog>
  );
}
