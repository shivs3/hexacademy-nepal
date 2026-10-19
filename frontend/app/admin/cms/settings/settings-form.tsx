"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { LoadError, TableSkeleton } from "@/components/cms/admin/list-parts";
import { ImageInput } from "@/components/cms/admin/media-picker";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { useSaveShortcut, useUnsavedWarning } from "@/hooks/use-unsaved-warning";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { contrastWithWhite, HEX_COLOR } from "@/lib/color";
import { formatDateTime, toLocalInput } from "@/lib/utils";
import type { MediaRef } from "@/types/cms";
import type { AdminSiteSettings, SocialPlatform } from "@/types/cms-admin";

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "youtube", label: "YouTube" },
  { value: "x", label: "X" },
  { value: "tiktok", label: "TikTok" },
  { value: "github", label: "GitHub" },
  { value: "whatsapp", label: "WhatsApp" },
];

type Form = Omit<AdminSiteSettings, "updated_at" | "announcement_starts_at" | "announcement_ends_at"> & {
  /** `datetime-local` strings in the browser's zone; "" means no limit. */
  announcement_starts_at: string;
  announcement_ends_at: string;
};
type Errors = Record<string, string>;

type ImageKey = "logo" | "logo_inverted" | "favicon" | "default_og_image";

function toForm(s: AdminSiteSettings): Form {
  return {
    ...s,
    announcement_starts_at: s.announcement_starts_at ? toLocalInput(new Date(s.announcement_starts_at)) : "",
    announcement_ends_at: s.announcement_ends_at ? toLocalInput(new Date(s.announcement_ends_at)) : "",
  };
}

function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function payload(f: Form) {
  return {
    site_name: f.site_name,
    tagline: f.tagline,
    logo: f.logo,
    logo_inverted: f.logo_inverted,
    favicon: f.favicon,
    color_primary: f.color_primary,
    color_accent: f.color_accent,
    color_secondary: f.color_secondary,
    contact_email: f.contact_email,
    contact_phone: f.contact_phone,
    address: f.address,
    social_links: f.social_links,
    footer_text: f.footer_text,
    default_meta_title: f.default_meta_title,
    default_meta_description: f.default_meta_description,
    default_og_image: f.default_og_image,
    allow_indexing: f.allow_indexing,
    default_language: f.default_language,
    announcement_enabled: f.announcement_enabled,
    announcement_text: f.announcement_text,
    announcement_link_label: f.announcement_link_label,
    announcement_link_url: f.announcement_link_url,
    announcement_starts_at: toIso(f.announcement_starts_at),
    announcement_ends_at: toIso(f.announcement_ends_at),
    auth_panel_heading: f.auth_panel_heading,
    auth_panel_text: f.auth_panel_text,
  };
}

export function SettingsForm({ canUpload }: { canUpload: boolean }) {
  const { data, error, reload } = useApiResource<AdminSiteSettings>("/admin/cms/site-settings/");
  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data) return <TableSkeleton rows={8} />;
  return <SettingsEditor key={data.updated_at} initial={data} canUpload={canUpload} />;
}

function SettingsEditor({ initial, canUpload }: { initial: AdminSiteSettings; canUpload: boolean }) {
  const toast = useToast();
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(payload(form)) !== JSON.stringify(payload(toForm(saved)));

  useUnsavedWarning(dirty);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setImage = (key: ImageKey, id: number | null, ref: MediaRef | null) =>
    setForm((f) => ({ ...f, [key]: id, [`${key}_detail`]: ref }));

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      const updated = await api.patch<AdminSiteSettings>("/admin/cms/site-settings/", payload(form));
      setSaved(updated);
      setForm(toForm(updated));
      toast.success("Site settings saved. The public site now uses them.");
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  useSaveShortcut(() => void save(), dirty && !saving);

  const textField = (key: keyof Form & string, label: string, opts: { max?: number; hint?: string; required?: boolean; type?: string } = {}) => (
    <Field label={label} htmlFor={`ss-${key}`} error={errors[key]} hint={opts.hint} required={opts.required}>
      <Input
        type={opts.type ?? "text"}
        value={form[key] as string}
        maxLength={opts.max}
        onChange={(e) => set(key, e.target.value as never)}
      />
    </Field>
  );

  const imageField = (key: ImageKey, label: string, hint: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`ss-${key}`}>{label}</Label>
      <ImageInput
        id={`ss-${key}`}
        value={form[key]}
        detail={form[`${key}_detail`]}
        canUpload={canUpload}
        invalid={!!errors[key]}
        onChange={(id, ref) => setImage(key, id, ref)}
      />
      {errors[key] ? <p className="text-xs text-danger">{errors[key]}</p> : <p className="text-xs text-muted">{hint}</p>}
    </div>
  );

  const usedPlatforms = new Set(form.social_links.map((l) => l.platform));

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 md:grid-cols-2">
          {textField("site_name", "Site name", { max: 100, required: true })}
          {textField("tagline", "Tagline", { max: 200 })}
          {imageField("logo", "Logo", "Shown in the header on light backgrounds. A wide PNG or WebP works best.")}
          {imageField("logo_inverted", "Logo for dark backgrounds", "Used in the footer. Leave empty to show the site name.")}
          {imageField("favicon", "Favicon", "Square image, at least 64×64 pixels.")}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brand colours</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            White text is placed on these colours, so the primary and accent colours must keep enough contrast to stay readable.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <ColorField label="Primary" hint="Header, footer and main buttons." name="color_primary" min={4.5} value={form.color_primary} error={errors.color_primary} onChange={(v) => set("color_primary", v)} />
            <ColorField label="Accent" hint="Highlights, links and secondary buttons." name="color_accent" min={3} value={form.color_accent} error={errors.color_accent} onChange={(v) => set("color_accent", v)} />
            <ColorField label="Secondary" hint="Decorative details only." name="color_secondary" min={1} value={form.color_secondary} error={errors.color_secondary} onChange={(v) => set("color_secondary", v)} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact and footer</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            {textField("contact_email", "Contact email", { type: "email" })}
            {textField("contact_phone", "Contact phone", { max: 40 })}
          </div>
          <Field label="Address" htmlFor="ss-address" error={errors.address}>
            <Textarea value={form.address} maxLength={300} rows={2} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Footer text" htmlFor="ss-footer_text" error={errors.footer_text} hint="A short line about the academy shown in the footer.">
            <Textarea value={form.footer_text} maxLength={500} rows={3} onChange={(e) => set("footer_text", e.target.value)} />
          </Field>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium text-navy">Social links</legend>
            {form.social_links.length === 0 && <p className="text-sm text-muted">No social links yet.</p>}
            {form.social_links.map((link, i) => (
              <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <Select
                  aria-label={`Platform ${i + 1}`}
                  value={link.platform}
                  className="sm:w-40"
                  onChange={(e) =>
                    set("social_links", form.social_links.map((l, j) => (j === i ? { ...l, platform: e.target.value as SocialPlatform } : l)))
                  }
                >
                  {PLATFORMS.map((p) => (
                    <option key={p.value} value={p.value} disabled={p.value !== link.platform && usedPlatforms.has(p.value)}>
                      {p.label}
                    </option>
                  ))}
                </Select>
                <div className="flex flex-1 flex-col gap-1">
                  <Input
                    aria-label={`${link.platform} address`}
                    aria-invalid={errors[`social_links.${i}.url`] ? true : undefined}
                    value={link.url}
                    maxLength={500}
                    placeholder="https://"
                    onChange={(e) => set("social_links", form.social_links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
                  />
                  {errors[`social_links.${i}.url`] && <p className="text-xs text-danger">{errors[`social_links.${i}.url`]}</p>}
                </div>
                <Button variant="ghost" size="sm" aria-label="Remove social link" className="text-danger" onClick={() => set("social_links", form.social_links.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={usedPlatforms.size >= PLATFORMS.length}
              onClick={() => {
                const next = PLATFORMS.find((p) => !usedPlatforms.has(p.value));
                if (next) set("social_links", [...form.social_links, { platform: next.value, url: "" }]);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add social link
            </Button>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Announcement banner</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Checkbox id="ss-announcement_enabled" checked={form.announcement_enabled} onChange={(e) => set("announcement_enabled", e.target.checked)} />
            <Label htmlFor="ss-announcement_enabled" className="font-normal">
              Show an announcement above the site header
            </Label>
          </div>
          <Field label="Text" htmlFor="ss-announcement_text" error={errors.announcement_text} required={form.announcement_enabled}>
            <Input value={form.announcement_text} maxLength={300} onChange={(e) => set("announcement_text", e.target.value)} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            {textField("announcement_link_label", "Link label", { max: 60 })}
            {textField("announcement_link_url", "Link", { max: 500, hint: "A site path such as /courses, or a full https:// address." })}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Show from" htmlFor="ss-announcement_starts_at" error={errors.announcement_starts_at} hint="Optional. In your time zone.">
              <Input type="datetime-local" value={form.announcement_starts_at} onChange={(e) => set("announcement_starts_at", e.target.value)} />
            </Field>
            <Field label="Show until" htmlFor="ss-announcement_ends_at" error={errors.announcement_ends_at} hint="Optional. In your time zone.">
              <Input type="datetime-local" value={form.announcement_ends_at} onChange={(e) => set("announcement_ends_at", e.target.value)} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search and sharing defaults</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p className="text-sm text-muted">Used for any page or post that does not set its own.</p>
          {textField("default_meta_title", "Default meta title", { max: 70, hint: `${form.default_meta_title.length}/70` })}
          <Field label="Default meta description" htmlFor="ss-default_meta_description" error={errors.default_meta_description} hint={`${form.default_meta_description.length}/170`}>
            <Textarea value={form.default_meta_description} maxLength={170} rows={2} onChange={(e) => set("default_meta_description", e.target.value)} />
          </Field>
          {imageField("default_og_image", "Default sharing image", "Shown when a link is shared on social media. 1200×630 pixels is ideal.")}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Site language" htmlFor="ss-default_language" error={errors.default_language}>
              <Select value={form.default_language} onChange={(e) => set("default_language", e.target.value as Form["default_language"])}>
                <option value="en">English</option>
                <option value="ne">Nepali</option>
              </Select>
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Checkbox id="ss-allow_indexing" checked={form.allow_indexing} onChange={(e) => set("allow_indexing", e.target.checked)} />
              <Label htmlFor="ss-allow_indexing" className="font-normal">
                Allow search engines to index the site
              </Label>
            </div>
            {!form.allow_indexing && <Alert tone="warning">Search engines are asked not to index any page. Turn this on when the site is ready to launch.</Alert>}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign-in pages</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {textField("auth_panel_heading", "Panel heading", { max: 150, hint: "Shown beside the sign-in and registration forms." })}
          <Field label="Panel text" htmlFor="ss-auth_panel_text" error={errors.auth_panel_text}>
            <Textarea value={form.auth_panel_text} maxLength={400} rows={3} onChange={(e) => set("auth_panel_text", e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-page/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-[var(--radius-card)] sm:border">
        <span className="text-xs text-muted">{dirty ? "You have unsaved changes." : `Last saved ${formatDateTime(saved.updated_at)}`}</span>
        <div className="ml-auto flex gap-2">
          <Button
            variant="ghost"
            disabled={!dirty || saving}
            onClick={() => {
              setForm(toForm(saved));
              setErrors({});
            }}
          >
            Discard changes
          </Button>
          <Button onClick={save} loading={saving} disabled={!dirty}>
            Save settings
          </Button>
        </div>
      </div>
    </div>
  );
}

function ColorField({
  label,
  hint,
  name,
  min,
  value,
  error,
  onChange,
}: {
  label: string;
  hint: string;
  name: string;
  min: number;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const valid = HEX_COLOR.test(value);
  const ratio = contrastWithWhite(value);
  const tooLow = ratio !== null && ratio < min;
  const id = `ss-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={valid ? value.toLowerCase() : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-10 w-12 cursor-pointer rounded-md border border-line bg-white p-1"
        />
        <Input
          id={id}
          value={value}
          maxLength={7}
          aria-invalid={error || !valid || tooLow ? true : undefined}
          aria-describedby={`${id}-hint`}
          onChange={(e) => onChange(e.target.value.trim())}
          className="font-mono uppercase"
        />
      </div>
      <div className="flex h-9 items-center justify-center rounded-md text-sm font-medium text-white" style={{ background: valid ? value : "transparent" }} aria-hidden="true">
        {valid ? "Sample text" : ""}
      </div>
      <p id={`${id}-hint`} className={error || tooLow || !valid ? "text-xs text-danger" : "text-xs text-muted"}>
        {error ??
          (!valid
            ? "Use a six-digit hex colour such as #102A43."
            : tooLow
              ? `Contrast ${ratio!.toFixed(1)}:1 is too low; at least ${min}:1 is needed.`
              : min > 1
                ? `${hint} Contrast ${ratio!.toFixed(1)}:1.`
                : hint)}
      </p>
    </div>
  );
}
