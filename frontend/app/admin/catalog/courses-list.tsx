"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, Plus, Star } from "lucide-react";
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
import { formatPrice } from "@/lib/catalog";
import { applyServerErrors } from "@/lib/forms";
import { formatDateTime } from "@/lib/utils";
import { slugField, slugify } from "@/lib/validation/cms";
import type { Paginated } from "@/types/accounts";
import type { AdminCategory, AdminCourse, AdminCourseSummary } from "@/types/catalog-admin";

export function CoursesList({ canCreate, canManage }: { canCreate: boolean; canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<AdminCourseSummary>>("/admin/catalog/courses/", {
    search: q,
    status,
    category,
    page,
  });
  // Category list is open to course authors too; the filter is hidden if it fails to load.
  const categories = useApiResource<AdminCategory[]>("/admin/catalog/categories/");
  const filtered = Boolean(q || status || category);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search courses"
          placeholder="Search title or address"
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="">Any status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>
        {categories.data && categories.data.length > 0 && (
          <Select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="sm:w-48"
          >
            <option value="">Any category</option>
            {categories.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent ? `— ${c.name}` : c.name}
              </option>
            ))}
          </Select>
        )}
        {canCreate && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New course
          </Button>
        )}
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={filtered ? "No courses match these filters" : "No courses yet"}
          description={filtered ? undefined : canCreate ? "Create the first course of the catalog." : "You are not on the teaching team of any course yet."}
        />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Course</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>Price</th>
                  <th scope="col" className={`${th} text-right`}>Lessons</th>
                  <th scope="col" className={`${th} text-right`}>Learners</th>
                  <th scope="col" className={th}>Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link href={`/admin/catalog/courses/${c.id}`} className="font-medium text-navy hover:text-teal-700 hover:underline">
                        {c.title}
                      </Link>
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        {c.is_featured && <Star className="h-3.5 w-3.5 text-teal" aria-label="Featured" />}
                        /courses/{c.slug}
                        {c.category_name && <span>· {c.category_name}</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3">
                      {Number(c.current_price) === 0 ? (
                        <Badge tone="mint">Free</Badge>
                      ) : (
                        <span className="whitespace-nowrap">
                          {formatPrice(c.current_price)}
                          {c.current_price !== c.price && <span className="ml-1 text-xs text-muted line-through">{formatPrice(c.price)}</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.published_lesson_count}
                      {c.published_lesson_count !== c.lesson_count && <span className="text-xs text-muted"> / {c.lesson_count}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.enrollment_count}</td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDateTime(c.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager data={data} onPage={setPage} />
        </Card>
      ) : null}

      {creating && <NewCourseDialog onClose={() => setCreating(false)} canManage={canManage} />}
    </div>
  );
}

const newCourseSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(160),
  slug: slugField(160),
});
type NewCourseValues = z.infer<typeof newCourseSchema>;

function NewCourseDialog({ onClose, canManage }: { onClose: () => void; canManage: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const form = useForm<NewCourseValues>({ resolver: zodResolver(newCourseSchema), defaultValues: { title: "", slug: "" } });
  const { register, handleSubmit, setValue, setError, formState } = form;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const created = await api.post<AdminCourse>("/admin/catalog/courses/", values);
      router.push(`/admin/catalog/courses/${created.id}`);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["title", "slug"]));
    }
  });

  const title = register("title");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New course"
      description={
        canManage
          ? "The course starts as a free draft. Set its price and publish it when it is ready."
          : "The course starts as a draft with you as its instructor. A catalog manager sets the price and publishes it."
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-course-form" loading={formState.isSubmitting}>
            Create draft
          </Button>
        </>
      }
    >
      <form id="new-course-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Title" htmlFor="new-course-title" error={formState.errors.title?.message} required>
          <Input
            {...title}
            autoFocus
            onChange={(e) => {
              void title.onChange(e);
              if (!slugTouched) setValue("slug", slugify(e.target.value));
            }}
          />
        </Field>
        <Field
          label="Address"
          htmlFor="new-course-slug"
          error={formState.errors.slug?.message}
          hint="Lowercase letters, numbers and hyphens. The course will live at /courses/your-slug."
          required
        >
          <Input {...register("slug", { onChange: () => setSlugTouched(true) })} />
        </Field>
      </form>
    </Dialog>
  );
}
