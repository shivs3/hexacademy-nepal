"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/input";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { toLocalInput } from "@/lib/utils";
import type { Coupon, CouponKind } from "@/types/commerce";

type CourseOption = { id: number; title: string; slug: string };

type Draft = {
  code: string;
  description: string;
  kind: CouponKind;
  value: string;
  max_discount: string;
  min_subtotal: string;
  starts_at: string; // datetime-local in the browser's zone
  ends_at: string;
  max_redemptions: string;
  per_user_limit: string;
  is_active: boolean;
  courses: number[];
};

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const local = (iso: string | null) => (iso ? toLocalInput(new Date(iso)) : "");
const isoOrNull = (v: string) => (v ? new Date(v).toISOString() : null);

function toDraft(c: Coupon | null): Draft {
  return {
    code: c?.code ?? "",
    description: c?.description ?? "",
    kind: c?.kind ?? "percent",
    value: c?.value ?? "",
    max_discount: c?.max_discount ?? "",
    min_subtotal: c && c.min_subtotal !== "0.00" ? c.min_subtotal : "",
    starts_at: local(c?.starts_at ?? null),
    ends_at: local(c?.ends_at ?? null),
    max_redemptions: c?.max_redemptions != null ? String(c.max_redemptions) : "",
    per_user_limit: String(c?.per_user_limit ?? 1),
    is_active: c?.is_active ?? true,
    courses: c?.courses ?? [],
  };
}

function check(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(d.code.trim())) e.code = "2–40 letters, digits, hyphens or underscores.";
  if (!MONEY.test(d.value) || Number(d.value) <= 0) e.value = "Enter a positive amount.";
  else if (d.kind === "percent" && Number(d.value) > 100) e.value = "A percentage cannot exceed 100.";
  if (d.kind === "percent" && d.max_discount && !MONEY.test(d.max_discount)) e.max_discount = "Enter an amount such as 500.";
  if (d.min_subtotal && !MONEY.test(d.min_subtotal)) e.min_subtotal = "Enter an amount such as 1000.";
  if (d.max_redemptions && !/^[1-9]\d{0,6}$/.test(d.max_redemptions)) e.max_redemptions = "A whole number, at least 1.";
  if (!/^[1-9]\d{0,3}$/.test(d.per_user_limit)) e.per_user_limit = "A whole number, at least 1.";
  if (d.starts_at && d.ends_at && d.ends_at <= d.starts_at) e.ends_at = "Must be after the start.";
  return e;
}

export function CouponDialog({
  coupon,
  onClose,
  onSaved,
}: {
  coupon: Coupon | null;
  onClose: () => void;
  onSaved: (coupon: Coupon, created: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(coupon));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const courses = useApiResource<CourseOption[]>("/admin/commerce/course-options/");
  const used = (coupon?.redemption_count ?? 0) > 0;
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const found = check(draft);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    const body = {
      code: draft.code.trim(),
      description: draft.description.trim(),
      ...(used ? {} : { kind: draft.kind }),
      value: draft.value,
      max_discount: draft.kind === "percent" && draft.max_discount ? draft.max_discount : null,
      min_subtotal: draft.min_subtotal || "0",
      starts_at: isoOrNull(draft.starts_at),
      ends_at: isoOrNull(draft.ends_at),
      max_redemptions: draft.max_redemptions ? Number(draft.max_redemptions) : null,
      per_user_limit: Number(draft.per_user_limit),
      is_active: draft.is_active,
      courses: draft.courses,
    };
    setSaving(true);
    try {
      const saved = coupon
        ? await api.patch<Coupon>(`/admin/commerce/coupons/${coupon.id}/`, body)
        : await api.post<Coupon>("/admin/commerce/coupons/", body);
      onSaved(saved, !coupon);
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      const nonField = fields.non_field_errors;
      delete fields.non_field_errors;
      setErrors(fields);
      setFormError(nonField ?? (Object.keys(fields).length ? null : errorMessage(err)));
      setSaving(false);
    }
  }

  function toggleCourse(id: number, on: boolean) {
    update({ courses: on ? [...draft.courses, id] : draft.courses.filter((c) => c !== id) });
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !saving && onClose()}
      title={coupon ? `Edit ${coupon.code}` : "New coupon"}
      description="Times are in your browser's time zone. Learners see prices in Nepali rupees."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="coupon-form" loading={saving}>
            {coupon ? "Save coupon" : "Create coupon"}
          </Button>
        </>
      }
    >
      <form id="coupon-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
        {formError && (
          <div className="sm:col-span-2">
            <Alert tone="danger">{formError}</Alert>
          </div>
        )}
        <Field label="Code" htmlFor="coupon-code" error={errors.code} hint="Learners type this. Stored in capitals." required>
          <Input value={draft.code} onChange={(e) => update({ code: e.target.value.toUpperCase() })} autoComplete="off" maxLength={40} autoFocus />
        </Field>
        <Field label="Type" htmlFor="coupon-kind" error={errors.kind} hint={used ? "Cannot change after the coupon has been used." : undefined}>
          <Select value={draft.kind} disabled={used} onChange={(e) => update({ kind: e.target.value as CouponKind })}>
            <option value="percent">Percentage off</option>
            <option value="fixed">Fixed amount off (NPR)</option>
          </Select>
        </Field>
        <Field label={draft.kind === "percent" ? "Percentage" : "Amount (NPR)"} htmlFor="coupon-value" error={errors.value} required>
          <Input inputMode="decimal" value={draft.value} onChange={(e) => update({ value: e.target.value.trim() })} />
        </Field>
        {draft.kind === "percent" ? (
          <Field label="Maximum discount (NPR)" htmlFor="coupon-cap" error={errors.max_discount} hint="Optional cap per order.">
            <Input inputMode="decimal" value={draft.max_discount} onChange={(e) => update({ max_discount: e.target.value.trim() })} />
          </Field>
        ) : (
          <div />
        )}
        <Field label="Minimum order (NPR)" htmlFor="coupon-min" error={errors.min_subtotal} hint="Optional.">
          <Input inputMode="decimal" value={draft.min_subtotal} onChange={(e) => update({ min_subtotal: e.target.value.trim() })} />
        </Field>
        <Field label="Total uses" htmlFor="coupon-max" error={errors.max_redemptions} hint="Empty for unlimited.">
          <Input inputMode="numeric" value={draft.max_redemptions} onChange={(e) => update({ max_redemptions: e.target.value.trim() })} />
        </Field>
        <Field label="Uses per learner" htmlFor="coupon-per-user" error={errors.per_user_limit} required>
          <Input inputMode="numeric" value={draft.per_user_limit} onChange={(e) => update({ per_user_limit: e.target.value.trim() })} />
        </Field>
        <div className="flex items-center gap-2 self-end pb-2">
          <Checkbox id="coupon-active" checked={draft.is_active} onChange={(e) => update({ is_active: e.target.checked })} />
          <Label htmlFor="coupon-active" className="font-normal">
            Active
          </Label>
        </div>
        <Field label="Starts" htmlFor="coupon-starts" error={errors.starts_at} hint="Empty: usable now.">
          <Input type="datetime-local" value={draft.starts_at} onChange={(e) => update({ starts_at: e.target.value })} />
        </Field>
        <Field label="Ends" htmlFor="coupon-ends" error={errors.ends_at} hint="Empty: no end date.">
          <Input type="datetime-local" value={draft.ends_at} onChange={(e) => update({ ends_at: e.target.value })} />
        </Field>
        <Field label="Internal description" htmlFor="coupon-description" error={errors.description} className="sm:col-span-2">
          <Textarea rows={2} maxLength={200} value={draft.description} onChange={(e) => update({ description: e.target.value })} />
        </Field>
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium text-navy">Courses</legend>
          <p className="text-xs text-muted">Leave all unticked to apply to every paid course.</p>
          {errors.courses && <p className="text-xs text-danger">{errors.courses}</p>}
          {courses.error ? (
            <Alert tone="danger">{courses.error}</Alert>
          ) : !courses.data ? (
            <Skeleton className="h-16 w-full" />
          ) : courses.data.length === 0 ? (
            <p className="text-sm text-muted">No courses yet.</p>
          ) : (
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
              {courses.data.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-page">
                  <Checkbox checked={draft.courses.includes(c.id)} onChange={(e) => toggleCourse(c.id, e.target.checked)} />
                  <span className="truncate">{c.title}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}
