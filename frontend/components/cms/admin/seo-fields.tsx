"use client";

import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Textarea } from "@/components/ui/input";
import type { MediaRef } from "@/types/cms";

import { ImageInput } from "./media-picker";

export type SeoValues = {
  meta_title: string;
  meta_description: string;
  canonical_url: string;
  og_image: number | null;
  og_image_detail: MediaRef | null;
  noindex: boolean;
};

/** SEO and social-sharing fields shared by the page and blog post editors. */
export function SeoFields({
  value,
  onChange,
  errors,
  fallbackTitle,
  canPickImage = true,
}: {
  value: SeoValues;
  onChange: (patch: Partial<SeoValues>) => void;
  errors: Record<string, string>;
  fallbackTitle: string;
  canPickImage?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Meta title"
        htmlFor="seo-title"
        error={errors.meta_title}
        hint={`${value.meta_title.length}/70 · Leave blank to use “${fallbackTitle || "the title"}”.`}
      >
        <Input value={value.meta_title} maxLength={70} onChange={(e) => onChange({ meta_title: e.target.value })} />
      </Field>
      <Field
        label="Meta description"
        htmlFor="seo-description"
        error={errors.meta_description}
        hint={`${value.meta_description.length}/170 · Shown in search results. Leave blank to use the site default.`}
      >
        <Textarea rows={3} value={value.meta_description} maxLength={170} onChange={(e) => onChange({ meta_description: e.target.value })} />
      </Field>
      <Field label="Canonical URL" htmlFor="seo-canonical" error={errors.canonical_url} hint="Only set this when the same content is published at another address.">
        <Input type="url" inputMode="url" value={value.canonical_url} onChange={(e) => onChange({ canonical_url: e.target.value })} placeholder="https://…" />
      </Field>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seo-og">Social sharing image</Label>
        <ImageInput
          id="seo-og"
          value={value.og_image}
          detail={value.og_image_detail}
          onChange={(og_image, og_image_detail) => onChange({ og_image, og_image_detail })}
          invalid={Boolean(errors.og_image)}
          readOnly={!canPickImage}
        />
        {errors.og_image ? (
          <p className="text-xs text-danger">{errors.og_image}</p>
        ) : (
          <p className="text-xs text-muted">Recommended 1200 × 630 px. Falls back to the site default.</p>
        )}
      </div>
      <Label className="flex items-center gap-2 font-normal">
        <Checkbox checked={value.noindex} onChange={(e) => onChange({ noindex: e.target.checked })} />
        Hide from search engines (noindex)
      </Label>
    </div>
  );
}
