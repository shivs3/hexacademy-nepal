"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CornerDownRight, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "@/lib/zod";

import { LoadError, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/feedback";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { categoryTree } from "@/lib/assessments";
import { applyServerErrors } from "@/lib/forms";
import { slugField, slugify } from "@/lib/validation/cms";
import type { AdminExamCategory } from "@/types/assessments";

const CATEGORY_SLUG_MAX = 50;

export function ExamCategoriesManager() {
  const toast = useToast();
  const { data, error, reload } = useApiResource<AdminExamCategory[]>("/admin/assessments/exam-categories/");
  // "new" adds a top-level category; { parent } adds a section inside one.
  const [editing, setEditing] = useState<AdminExamCategory | "new" | { parent: number } | null>(null);
  const [deleting, setDeleting] = useState<AdminExamCategory | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/admin/assessments/exam-categories/${deleting.id}/`);
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
        <EmptyState icon={Tags} title="No categories yet" description="Create categories such as “Loksewa” or “NRB”, then add sections such as “Paper I” inside them to group exams on the public Exams page." />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Category</th>
                  <th scope="col" className={th}>Position</th>
                  <th scope="col" className={th}>Exams</th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {categoryTree(data).map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className={c.depth ? "py-3 pl-10 pr-4" : "px-4 py-3"}>
                      <p className="flex items-center gap-2 font-medium text-navy">
                        {c.depth > 0 && <CornerDownRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
                        {c.depth > 0 && <span className="sr-only">Section of {c.parent_name}: </span>}
                        {c.name}
                        {!c.is_active && <Badge>Hidden</Badge>}
                        {c.section_count > 0 && <Badge tone="teal">{c.section_count} {c.section_count === 1 ? "section" : "sections"}</Badge>}
                      </p>
                      <p className="text-xs text-muted">/exams?category={c.slug}</p>
                      {c.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{c.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted tabular-nums">{c.position}</td>
                    <td className="px-4 py-3 text-muted tabular-nums">{c.exam_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {c.depth === 0 && (
                          <Button variant="ghost" size="sm" onClick={() => setEditing({ parent: c.id })}>
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Section
                          </Button>
                        )}
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
          category={editing === "new" || !("id" in editing) ? null : editing}
          initialParent={editing !== "new" && !("id" in editing) ? editing.parent : null}
          categories={data}
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
          deleting?.section_count
            ? `“${deleting.name}” has ${deleting.section_count} section(s). Delete or move its sections first; the server will refuse otherwise.`
            : deleting?.exam_count
              ? `${deleting.exam_count} exam(s) use this category. The exams are kept; they just lose this category.`
              : "No exams use this category."
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
  is_active: z.boolean(),
  position: z.coerce.number().int("Use a whole number.").min(0, "Use 0 or more.").max(1000),
  description: z.string().max(500),
  parent: z.string(),
});
type CategoryInput = z.input<typeof categorySchema>;
type CategoryValues = z.output<typeof categorySchema>;

function CategoryDialog({
  category,
  initialParent,
  categories,
  onClose,
  onSaved,
}: {
  category: AdminExamCategory | null;
  initialParent: number | null;
  categories: AdminExamCategory[];
  onClose: () => void;
  onSaved: (c: AdminExamCategory, created: boolean) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(category !== null);
  const form = useForm<CategoryInput, unknown, CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? "",
      slug: category?.slug ?? "",
      is_active: category?.is_active ?? true,
      position: category?.position ?? 0,
      description: category?.description ?? "",
      parent: String(category ? (category.parent ?? "") : (initialParent ?? "")),
    },
  });
  const { register, handleSubmit, setValue, setError, formState } = form;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const body = { ...values, parent: values.parent ? Number(values.parent) : null };
    try {
      const saved = category
        ? await api.patch<AdminExamCategory>(`/admin/assessments/exam-categories/${category.id}/`, body)
        : await api.post<AdminExamCategory>("/admin/assessments/exam-categories/", body);
      onSaved(saved, category === null);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["name", "slug", "is_active", "position", "description", "parent"]));
    }
  });

  const name = register("name");
  // Sections go one level deep: only top-level categories (other than this one) can hold sections.
  const parents = categories.filter((c) => c.parent === null && c.id !== category?.id);
  const hasSections = (category?.section_count ?? 0) > 0;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={category ? "Edit category" : initialParent ? "New section" : "New category"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="exam-category-form" loading={formState.isSubmitting}>
            {category ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="exam-category-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Name" htmlFor="exam-category-name" error={formState.errors.name?.message} required>
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
        <Field label="Address" htmlFor="exam-category-slug" error={formState.errors.slug?.message} hint="Lowercase letters, numbers and hyphens." required>
          <Input {...register("slug", { onChange: () => setSlugTouched(true) })} maxLength={CATEGORY_SLUG_MAX} />
        </Field>
        <Field
          label="Section of"
          htmlFor="exam-category-parent"
          error={formState.errors.parent?.message}
          hint={hasSections ? "This category has sections, so it stays at the top level." : "Leave as “Top level” for a main category such as NRB. Pick one to make this a section inside it, such as Paper I."}
        >
          <Select id="exam-category-parent" {...register("parent")} disabled={hasSections}>
            <option value="">Top level</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Position" htmlFor="exam-category-position" error={formState.errors.position?.message} hint="Lower first.">
          <Input type="number" min={0} max={1000} {...register("position")} className="w-28" />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox {...register("is_active")} className="mt-0.5" />
          <span>
            <span className="font-medium text-navy">Show on the Exams page</span>
            <span className="block text-muted">When off, this category and its exams are hidden from the public Exams page.</span>
          </span>
        </label>
        <Field label="Description" htmlFor="exam-category-description" error={formState.errors.description?.message} hint="Optional. Shown at the top of the Exams page when this category is selected.">
          <Textarea {...register("description")} rows={3} maxLength={500} />
        </Field>
      </form>
    </Dialog>
  );
}
