"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/input";
import type { FieldDescriptor } from "@/types/cms-admin";

import { ImageInput } from "./media-picker";
import { ReferencePicker } from "./reference-picker";
import { RichTextEditor } from "./rich-text-editor";

export type FieldErrors = Record<string, string>;

/** Initial value for a field, matching what the backend stores for "empty". */
export function emptyValue(field: FieldDescriptor): unknown {
  switch (field.kind) {
    case "refs":
      return [];
    case "list":
      return Array.from({ length: field.min_items ?? 0 }, () => emptyData(field.fields ?? []));
    case "boolean":
      return Boolean(field.default);
    case "select":
      return (field.default as string | undefined) ?? field.choices?.[0]?.value ?? "";
    case "image":
    case "integer":
    case "ref":
      return null;
    default:
      return "";
  }
}

export function emptyData(fields: FieldDescriptor[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((f) => [f.name, emptyValue(f)]));
}

/** True if any error path starts with `prefix` (used to flag collapsed sections). */
export function hasErrorsUnder(errors: FieldErrors, prefix: string) {
  return Object.keys(errors).some((k) => k === prefix || k.startsWith(`${prefix}.`));
}

function domId(path: string) {
  return `f-${path.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

export function FieldsForm({
  fields,
  data,
  onChange,
  path,
  errors,
}: {
  fields: FieldDescriptor[];
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  path: string;
  errors: FieldErrors;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => (
        <div
          key={f.name}
          className={f.kind === "richtext" || f.kind === "list" || f.kind === "textarea" || f.kind === "image" || f.kind === "refs" ? "sm:col-span-2" : undefined}
        >
          <FieldControl
            field={f}
            value={data[f.name]}
            onChange={(v) => onChange({ ...data, [f.name]: v })}
            path={`${path}.${f.name}`}
            errors={errors}
          />
        </div>
      ))}
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  path,
  errors,
}: {
  field: FieldDescriptor;
  value: unknown;
  onChange: (value: unknown) => void;
  path: string;
  errors: FieldErrors;
}) {
  const id = domId(path);
  const error = errors[path];
  const common = { label: field.label, htmlFor: id, error, hint: field.help, required: field.required };
  const text = typeof value === "string" ? value : "";

  switch (field.kind) {
    case "text":
    case "link":
    case "video":
      return (
        <Field {...common} hint={field.help ?? (field.kind === "video" ? "A YouTube or Vimeo address." : undefined)}>
          <Input
            value={text}
            maxLength={field.max_length}
            inputMode={field.kind === "text" ? undefined : "url"}
            placeholder={field.kind === "link" ? "/courses" : field.kind === "video" ? "https://www.youtube.com/watch?v=…" : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );
    case "textarea":
      return (
        <Field {...common}>
          <Textarea value={text} rows={3} maxLength={field.max_length} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "richtext":
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>
            {field.label}
            {field.required && <span className="ml-0.5 text-danger" aria-hidden="true">*</span>}
          </Label>
          <RichTextEditor id={id} value={text} onChange={onChange} invalid={Boolean(error)} minimal={path.includes(".items.")} />
          {error ? <p className="text-xs text-danger">{error}</p> : field.help ? <p className="text-xs text-muted">{field.help}</p> : null}
        </div>
      );
    case "select":
      return (
        <Field {...common}>
          <Select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
            {!field.required && !field.default && <option value="">—</option>}
            {(field.choices ?? []).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "boolean":
      return (
        <div className="flex flex-col gap-1">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox id={id} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
            {field.label}
          </Label>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      );
    case "integer":
      return (
        <Field {...common}>
          <Input
            type="number"
            inputMode="numeric"
            step={1}
            min={field.min_value}
            max={field.max_value}
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? null : Number.parseInt(e.target.value, 10))}
          />
        </Field>
      );
    case "image":
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{field.label}</Label>
          <ImageInput id={id} value={typeof value === "number" ? value : null} onChange={(v) => onChange(v)} invalid={Boolean(error)} />
          {error ? <p className="text-xs text-danger">{error}</p> : field.help ? <p className="text-xs text-muted">{field.help}</p> : null}
        </div>
      );
    case "ref":
    case "refs":
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>
            {field.label}
            {field.required && <span className="ml-0.5 text-danger" aria-hidden="true">*</span>}
          </Label>
          <ReferencePicker
            id={id}
            reference={field.ref ?? ""}
            multiple={field.kind === "refs"}
            max={field.max_items}
            value={field.kind === "refs" ? (Array.isArray(value) ? (value as number[]) : []) : typeof value === "number" ? [value] : []}
            onChange={(ids) => onChange(field.kind === "refs" ? ids : (ids[0] ?? null))}
            invalid={Boolean(error)}
          />
          {error ? <p className="text-xs text-danger">{error}</p> : field.help ? <p className="text-xs text-muted">{field.help}</p> : null}
        </div>
      );
    case "list":
      return <ListControl field={field} value={Array.isArray(value) ? value : []} onChange={onChange} path={path} errors={errors} />;
    default:
      return null;
  }
}

function ListControl({
  field,
  value,
  onChange,
  path,
  errors,
}: {
  field: FieldDescriptor;
  value: unknown[];
  onChange: (value: unknown[]) => void;
  path: string;
  errors: FieldErrors;
}) {
  const items = value as Record<string, unknown>[];
  const max = field.max_items ?? Infinity;
  const itemFields = field.fields ?? [];
  const singular = field.label.replace(/s$/, "").toLowerCase() || "item";

  function move(from: number, to: number) {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-sm font-medium text-navy">
        {field.label}
        {field.max_items ? <span className="ml-2 text-xs font-normal text-muted">{items.length} of {field.max_items}</span> : null}
      </legend>
      {errors[path] && <p className="text-xs text-danger">{errors[path]}</p>}
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-line bg-page/60 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              {field.label.replace(/s$/, "")} {i + 1}
            </span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${singular} ${i + 1} up`}>
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${singular} ${i + 1} down`}>
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-danger"
                disabled={items.length <= (field.min_items ?? 0)}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                aria-label={`Remove ${singular} ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <FieldsForm
            fields={itemFields}
            data={item}
            onChange={(d) => onChange(items.map((it, j) => (j === i ? d : it)))}
            path={`${path}.${i}`}
            errors={errors}
          />
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={items.length >= max} onClick={() => onChange([...items, emptyData(itemFields)])}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add {singular}
        </Button>
      </div>
    </fieldset>
  );
}
