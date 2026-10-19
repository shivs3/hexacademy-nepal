"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { LoadError, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { applyServerErrors } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { slugField, slugify } from "@/lib/validation/cms";
import type { AdminCategory } from "@/types/catalog-admin";

const CATEGORY_SLUG_MAX = 90;

export function CourseCategoriesManager() {
  const toast = useToast();
  const { data, error, reload } = useApiResource<AdminCategory[]>("/admin/catalog/categories/");
  const [editing, setEditing] = useState<AdminCategory | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/admin/catalog/categories/${deleting.id}/`);
      toast.success(`Deleted “${deleting.name}”.`);
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New category
        </Button>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {!data && !error ? (
        <TableSkeleton rows={3} />
      ) : data && data.length === 0 ? (
        <EmptyState icon={Tags} title="No categories yet" description="Create categories such as “Programming” or “Engineering entrance” to organise courses." />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Category</th>
                  <th scope="col" className={th}>Position</th>
                  <th scope="col" className={th}>Courses</th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className={cn("px-4 py-3", c.parent && "pl-10")}>
                      <p className="font-medium text-navy">
                        {c.parent && <span className="text-muted">↳ </span>}
                        {c.name}
                      </p>
                      <p className="text-xs text-muted">/courses?category={c.slug}</p>
                      {c.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{c.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted tabular-nums">{c.position}</td>
                    <td className="px-4 py-3 text-muted tabular-nums">{c.course_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {editing && data && (
        <CategoryDialog
          category={editing === "new" ? null : editing}
          all={data}
          onClose={() => setEditing(null)}
          onSaved={(c, created) => {
            toast.success(created ? `Created “${c.name}”.` : "Category saved.");
            setEditing(null);
            reload();
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description={
          deleting?.course_count
            ? `${deleting.course_count} course(s) use this category. The courses are kept; they just lose this category.`
            : "No courses use this category."
        }
        confirmLabel="Delete"
        tone="danger"
        loading={busy}
        onConfirm={remove}
      />
    </div>
  );
}

const categorySchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80),
  slug: slugField(CATEGORY_SLUG_MAX),
  parent: z.string(),
  position: z.coerce.number().int("Use a whole number.").min(0, "Use 0 or more.").max(1000),
  description: z.string().max(300),
});
type CategoryInput = z.input<typeof categorySchema>;
type CategoryValues = z.output<typeof categorySchema>;

function CategoryDialog({
  category,
  all,
  onClose,
  onSaved,
}: {
  category: AdminCategory | null;
  all: AdminCategory[];
  onClose: () => void;
  onSaved: (c: AdminCategory, created: boolean) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(category !== null);
  const form = useForm<CategoryInput, unknown, CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? "",
      slug: category?.slug ?? "",
      parent: category?.parent ? String(category.parent) : "",
      position: category?.position ?? 0,
      description: category?.description ?? "",
    },
  });
  const { register, handleSubmit, setValue, setError, formState } = form;
  // Only top-level categories can be parents, and a category with children must stay top-level.
  const hasChildren = category ? all.some((c) => c.parent === category.id) : false;
  const parents = all.filter((c) => c.parent === null && c.id !== category?.id);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const body = { ...values, parent: values.parent ? Number(values.parent) : null };
    try {
      const saved = category
        ? await api.patch<AdminCategory>(`/admin/catalog/categories/${category.id}/`, body)
        : await api.post<AdminCategory>("/admin/catalog/categories/", body);
      onSaved(saved, category === null);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["name", "slug", "parent", "position", "description"]));
    }
  });

  const name = register("name");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={category ? "Edit category" : "New category"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="course-category-form" loading={formState.isSubmitting}>
            {category ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="course-category-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Name" htmlFor="course-category-name" error={formState.errors.name?.message} required>
          <Input
            {...name}
            autoFocus
            maxLength={80}
            onChange={(e) => {
              void name.onChange(e);
              if (!slugTouched) setValue("slug", slugify(e.target.value, CATEGORY_SLUG_MAX));
            }}
          />
        </Field>
        <Field label="Address" htmlFor="course-category-slug" error={formState.errors.slug?.message} hint="Lowercase letters, numbers and hyphens." required>
          <Input {...register("slug", { onChange: () => setSlugTouched(true) })} maxLength={CATEGORY_SLUG_MAX} />
        </Field>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field
            label="Parent"
            htmlFor="course-category-parent"
            error={formState.errors.parent?.message}
            hint={hasChildren ? "This category has subcategories, so it stays top-level." : undefined}
          >
            <Select {...register("parent")} disabled={hasChildren}>
              <option value="">None (top level)</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Position" htmlFor="course-category-position" error={formState.errors.position?.message} hint="Lower first.">
            <Input type="number" min={0} max={1000} {...register("position")} />
          </Field>
        </div>
        <Field label="Description" htmlFor="course-category-description" error={formState.errors.description?.message} hint="Optional. Shown on category cards and the filtered catalog.">
          <Textarea {...register("description")} rows={3} maxLength={300} />
        </Field>
      </form>
    </Dialog>
  );
}
