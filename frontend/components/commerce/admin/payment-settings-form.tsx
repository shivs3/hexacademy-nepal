"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { useState } from "react";

import { LoadError } from "@/components/cms/admin/list-parts";
import { RichTextEditor } from "@/components/cms/admin/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils";
import type { PaymentSettings } from "@/types/commerce";

type Draft = Pick<PaymentSettings, "khalti_enabled" | "esewa_enabled" | "bank_transfer_enabled" | "bank_transfer_instructions"> & {
  order_ttl_minutes: string;
};

const TOGGLES = [
  ["khalti", "khalti_enabled", "Khalti"],
  ["esewa", "esewa_enabled", "eSewa"],
] as const;

export function PaymentSettingsForm() {
  const { data, error, reload, setData } = useApiResource<PaymentSettings>("/admin/commerce/settings/");
  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96 w-full" />;
  // Keyed by save time so a successful save restarts the form from the server's copy.
  return <SettingsEditor key={data.updated_at} initial={data} onSaved={setData} />;
}

function SettingsEditor({ initial, onSaved }: { initial: PaymentSettings; onSaved: (s: PaymentSettings) => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>({
    khalti_enabled: initial.khalti_enabled,
    esewa_enabled: initial.esewa_enabled,
    bank_transfer_enabled: initial.bank_transfer_enabled,
    bank_transfer_instructions: initial.bank_transfer_instructions,
    order_ttl_minutes: String(initial.order_ttl_minutes),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const configured = Object.fromEntries(initial.gateways.map((g) => [g.key, g.configured]));
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    if (!/^\d{1,5}$/.test(draft.order_ttl_minutes)) {
      setErrors({ order_ttl_minutes: "Enter whole minutes." });
      return;
    }
    setSaving(true);
    try {
      const saved = await api.patch<PaymentSettings>("/admin/commerce/settings/", {
        ...draft,
        order_ttl_minutes: Number(draft.order_ttl_minutes),
      });
      toast.success("Payment settings saved.");
      onSaved(saved);
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setErrors(fields);
      setFormError(fields.non_field_errors ?? (Object.keys(fields).length ? null : errorMessage(err)));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex max-w-3xl flex-col gap-6" noValidate>
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Online gateways</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {TOGGLES.map(([key, field, label]) => (
            <div key={key} className="flex flex-col gap-1 rounded-lg border border-line p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`pay-${key}`}
                  checked={draft[field]}
                  disabled={!configured[key] && !draft[field]}
                  onChange={(e) => update({ [field]: e.target.checked })}
                />
                <Label htmlFor={`pay-${key}`}>Offer {label}</Label>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                {configured[key] ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" /> Merchant credentials are set on the server.
                  </>
                ) : (
                  <>
                    <CircleAlert className="h-3.5 w-3.5 text-warning" aria-hidden="true" /> No merchant credentials on the server. See docs/deployment.md
                    to activate {label}.
                  </>
                )}
              </p>
              {errors[field] && <p className="text-xs text-danger">{errors[field]}</p>}
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank transfer</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="pay-bank"
              checked={draft.bank_transfer_enabled}
              onChange={(e) => update({ bank_transfer_enabled: e.target.checked })}
            />
            <Label htmlFor="pay-bank">Offer bank transfer (finance confirms each transfer by hand)</Label>
          </div>
          <Field
            label="Instructions shown to learners"
            htmlFor="pay-bank-instructions"
            error={errors.bank_transfer_instructions}
            hint="Bank name, account name and number, branch. Required while bank transfer is offered."
          >
            <RichTextEditor
              id="pay-bank-instructions"
              value={draft.bank_transfer_instructions}
              onChange={(html) => update({ bank_transfer_instructions: html })}
              invalid={Boolean(errors.bank_transfer_instructions)}
              minimal
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
        </CardHeader>
        <CardBody>
          <Field
            label="Unpaid orders expire after (minutes)"
            htmlFor="pay-ttl"
            error={errors.order_ttl_minutes}
            hint="Between 15 minutes and 7 days (10080). Reported bank transfers are held longer while finance reviews them."
          >
            <Input inputMode="numeric" className="sm:w-40" value={draft.order_ttl_minutes} onChange={(e) => update({ order_ttl_minutes: e.target.value.trim() })} />
          </Field>
        </CardBody>
      </Card>

      <div className="flex items-center gap-4">
        <Button type="submit" loading={saving}>
          Save settings
        </Button>
        <span className="text-xs text-muted">Last saved {formatDateTime(initial.updated_at)}</span>
      </div>
    </form>
  );
}
