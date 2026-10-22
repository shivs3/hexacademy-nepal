"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { RichText } from "@/components/cms/rich-text";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatPrice } from "@/lib/catalog";
import type { PaymentMethods } from "@/types/commerce";

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
}

const schema = z.object({
  payer_name: z.string().trim().min(1, "Enter the name on the sending account.").max(120),
  bank_reference: z.string().trim().min(1, "Enter the transaction reference from your bank.").max(100),
  transferred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of the transfer.")
    .refine((d) => d <= today(), "The transfer date cannot be in the future."),
  note: z.string().max(500).optional(),
});

type Values = z.infer<typeof schema>;

/** Learner reports a transfer; finance staff confirm it against the bank statement before enrollment. */
export function BankTransferForm({
  reference,
  amount,
  defaultName,
  justCreated,
  onSubmitted,
}: {
  reference: string;
  amount: string;
  defaultName: string;
  justCreated: boolean;
  onSubmitted: () => Promise<void>;
}) {
  const toast = useToast();
  const methods = useApiResource<PaymentMethods>("/payments/methods/");
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { payer_name: defaultName, bank_reference: "", transferred_on: today(), note: "" },
  });

  async function submit(values: Values) {
    try {
      await api.post(`/payments/${encodeURIComponent(reference)}/bank-transfer/`, values);
      toast.success("Thanks. We will confirm your transfer shortly.");
      await onSubmitted();
    } catch (err) {
      if (isApiError(err)) {
        const fields = err.fieldErrors();
        let matched = false;
        for (const key of ["payer_name", "bank_reference", "transferred_on", "note"] as const) {
          if (fields[key]) {
            setError(key, { message: fields[key] });
            matched = true;
          }
        }
        if (matched) return;
      }
      setError("root", { message: errorMessage(err) });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pay by bank transfer</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {justCreated && <Alert tone="success">Your order is reserved. Transfer the amount below, then tell us the reference.</Alert>}
        <p className="text-sm">
          Transfer exactly <strong className="text-navy">{formatPrice(amount)}</strong> and include <strong className="text-navy">{reference}</strong>{" "}
          in the remarks if your bank allows it.
        </p>
        {methods.data ? (
          methods.data.bank_transfer_instructions && (
            <div className="rounded-lg border border-line bg-page p-3">
              <RichText html={methods.data.bank_transfer_instructions} className="text-sm" />
            </div>
          )
        ) : methods.error ? null : (
          <Skeleton className="h-16 w-full" />
        )}
        <form onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Name on the sending account" htmlFor="payer_name" error={errors.payer_name?.message} required>
            <Input {...register("payer_name")} autoComplete="name" />
          </Field>
          <Field label="Bank transaction reference" htmlFor="bank_reference" error={errors.bank_reference?.message} required>
            <Input {...register("bank_reference")} autoComplete="off" />
          </Field>
          <Field label="Date of transfer" htmlFor="transferred_on" error={errors.transferred_on?.message} required>
            <Input type="date" max={today()} {...register("transferred_on")} />
          </Field>
          <Field label="Note (optional)" htmlFor="note" error={errors.note?.message} className="sm:col-span-2">
            <Textarea rows={2} {...register("note")} />
          </Field>
          {errors.root?.message && (
            <div className="sm:col-span-2">
              <Alert tone="danger">{errors.root.message}</Alert>
            </div>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" loading={isSubmitting}>
              I have made the transfer
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
