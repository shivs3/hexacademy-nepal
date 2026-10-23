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
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { applyServerErrors } from "@/lib/forms";
import { slugField, slugify } from "@/lib/validation/cms";
import type { AdminBlogCategory } from "@/types/cms-admin";

const CATEGORY_SLUG_MAX = 90;

export function CategoriesManager() {
  const toast = useToast();
  const { data, error, reload } = useApiResource<AdminBlogCategory[]>("/admin/cms/blog/categories/");
  const [editing, setEditing] = useState<AdminBlogCategory | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminBlogCategory | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/admin/cms/blog/categories/${deleting.id}/`);
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
        <EmptyState icon={Tags} title="No categories yet" description="Create categories such as “Programming” or “Exam preparation” to organise posts." />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Category</th>
                  <th scope="col" className={th}>Posts</th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy">{c.name}</p>
                      <p className="text-xs text-muted">/blog?category={c.slug}</p>
                      {c.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{c.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted">{c.post_count}</td>
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

      {editing && (
        <CategoryDialog
          category={editing === "new" ? null : editing}
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
          deleting?.post_count
            ? `${deleting.post_count} post(s) use this category. The posts are kept; they just lose this category.`
            : "No posts use this category."
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
  description: z.string().max(300),
});
type CategoryValues = z.infer<typeof categorySchema>;

function CategoryDialog({
  category,
  onClose,
  onSaved,
}: {
  category: AdminBlogCategory | null;
  onClose: () => void;
  onSaved: (c: AdminBlogCategory, created: boolean) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(category !== null);
  const form = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: category?.name ?? "", slug: category?.slug ?? "", description: category?.description ?? "" },
  });
  const { register, handleSubmit, setValue, setError, formState } = form;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = category
        ? await api.patch<AdminBlogCategory>(`/admin/cms/blog/categories/${category.id}/`, values)
        : await api.post<AdminBlogCategory>("/admin/cms/blog/categories/", values);
      onSaved(saved, category === null);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["name", "slug", "description"]));
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
          <Button type="submit" form="category-form" loading={formState.isSubmitting}>
            {category ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Name" htmlFor="category-name" error={formState.errors.name?.message} required>
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
        <Field label="Address" htmlFor="category-slug" error={formState.errors.slug?.message} hint="Lowercase letters, numbers and hyphens." required>
          <Input {...register("slug", { onChange: () => setSlugTouched(true) })} maxLength={CATEGORY_SLUG_MAX} />
        </Field>
        {category && category.post_count > 0 && (
          <p className="text-xs text-muted">Changing the address breaks existing links to this filtered blog view.</p>
        )}
        <Field label="Description" htmlFor="category-description" error={formState.errors.description?.message} hint="Optional. Shown when visitors filter the blog by this category.">
          <Textarea {...register("description")} rows={3} maxLength={300} />
        </Field>
      </form>
    </Dialog>
  );
}
