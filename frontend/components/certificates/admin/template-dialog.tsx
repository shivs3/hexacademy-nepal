"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { CertificateTemplate } from "@/types/certificates";

type Form = Pick<CertificateTemplate, "name" | "heading" | "statement" | "signatory_name" | "signatory_title" | "footer_note">;

const EMPTY: Form = {
  name: "",
  heading: "Certificate of Completion",
  statement: "has successfully completed the course",
  signatory_name: "",
  signatory_title: "",
  footer_note: "",
};

const FIELDS: {
  key: keyof Form;
  label: string;
  max: number;
  hint?: string;
  required?: boolean;
}[] = [
  {
    key: "name",
    label: "Template name",
    max: 120,
    hint: "Only staff see this.",
    required: true,
  },
  { key: "heading", label: "Heading", max: 120, required: true },
  {
    key: "statement",
    label: "Statement",
    max: 300,
    hint: "Printed between the learner's name and the course title.",
    required: true,
  },
  {
    key: "signatory_name",
    label: "Signatory name",
    max: 120,
    hint: "Leave empty to print no signature line.",
  },
  { key: "signatory_title", label: "Signatory title", max: 120 },
  { key: "footer_note", label: "Footer note", max: 300 },
];

export function TemplateDialog({
  template,
  onClose,
  onSaved,
}: {
  template: CertificateTemplate | null;
  onClose: () => void;
  onSaved: (t: CertificateTemplate) => void;
}) {
  const [form, setForm] = useState<Form>(template ? { ...template } : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    for (const f of FIELDS) if (f.required && !form[f.key].trim()) e[f.key] = "Required.";
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = Object.fromEntries(FIELDS.map((f) => [f.key, form[f.key].trim()]));
      const saved = template
        ? await api.patch<CertificateTemplate>(`/admin/certificates/templates/${template.id}/`, body)
        : await api.post<CertificateTemplate>("/admin/certificates/templates/", body);
      onSaved(saved);
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? null : errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !saving && onClose()}
      title={template ? "Edit template" : "New certificate template"}
      description={template?.certificate_count ? "Changes apply to every certificate using this template, including ones already issued." : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save template
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`template-${f.key}`} error={errors[f.key]} hint={f.hint} required={f.required}>
            <Input maxLength={f.max} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          </Field>
        ))}
      </div>
    </Dialog>
  );
}
