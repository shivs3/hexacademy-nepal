"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { VerifyEmailNotice, isUnverifiedError } from "@/components/account/verify-email-notice";
import { RichText } from "@/components/cms/rich-text";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatPrice } from "@/lib/catalog";
import { ACCESS_REQUEST_STATUS } from "@/lib/commerce";
import { formatDateTime } from "@/lib/utils";
import { z } from "@/lib/zod";
import type { CheckoutItem, MyAccessRequest } from "@/types/access";

const schema = z.object({
  full_name: z.string().trim().min(1, "Enter your full name.").max(150),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a phone number, digits only (a leading + is fine)."),
  payment_reference: z.string().trim().max(120).optional(),
  message: z.string().trim().max(2000).optional(),
});

type Values = z.infer<typeof schema>;
const FIELDS = ["full_name", "phone", "payment_reference", "message"] as const;

/**
 * Checkout while no payment gateway is connected: the learner sends their
 * details and how they paid. Staff check the payment and add the course or
 * exam to the learner's account. The price shown comes from the server and
 * is never sent back.
 */
export function AccessRequestForm({ item, defaultName }: { item: CheckoutItem; defaultName: string }) {
  const [sent, setSent] = useState<MyAccessRequest | null>(item.pending_request);
  const [unverified, setUnverified] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: defaultName, phone: "", payment_reference: "", message: "" },
  });

  async function submit(values: Values) {
    setUnverified(false);
    try {
      setSent(await api.post<MyAccessRequest>("/access-requests/", { ...values, [item.kind]: item.slug }));
    } catch (err) {
      if (isUnverifiedError(err)) {
        setUnverified(true);
        return;
      }
      if (isApiError(err)) {
        const fields = err.fieldErrors();
        const matched = FIELDS.filter((k) => fields[k]);
        matched.forEach((k) => setError(k, { message: fields[k] }));
        if (matched.length) return;
      }
      setError("root", { message: errorMessage(err) });
    }
  }

  const summary = (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>{item.kind === "course" ? "Course" : "Exam"}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-2">
        <p className="font-medium text-navy">{item.title}</p>
        <p className="flex items-baseline justify-between border-t border-line pt-3 text-sm">
          <span className="text-muted">Price</span>
          <span className="flex items-baseline gap-2">
            {item.list_price !== item.price && (
              <span className="text-muted line-through">
                <span className="sr-only">Regular price </span>
                {formatPrice(item.list_price)}
              </span>
            )}
            <span className="text-lg font-semibold text-navy">{formatPrice(item.price)}</span>
          </span>
        </p>
      </CardBody>
    </Card>
  );

  if (sent) {
    const status = ACCESS_REQUEST_STATUS[sent.status];
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardBody className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden="true" />
              <div>
                <h2 className="text-lg font-semibold text-navy">Request received</h2>
                <p className="text-sm text-muted">
                  Request {sent.number} · sent {formatDateTime(sent.created_at)}
                </p>
              </div>
              <Badge tone={status.tone} className="ml-auto">
                {status.label}
              </Badge>
            </div>
            <p className="text-sm text-body">
              Our team will check your payment and add this {item.kind} to your account. You&apos;ll get a notification
              when it&apos;s ready, usually within one working day.
            </p>
            {item.instructions && (
              <div className="rounded-lg border border-line bg-page p-3">
                <RichText html={item.instructions} className="text-sm" />
              </div>
            )}
            <div>
              <Button asChild variant="outline">
                <Link href="/dashboard/requests">See my requests</Link>
              </Button>
            </div>
          </CardBody>
        </Card>
        {summary}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardHeader>
          <CardTitle>Request access</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {item.instructions ? (
            <div className="rounded-lg border border-line bg-page p-3">
              <RichText html={item.instructions} className="text-sm" />
            </div>
          ) : (
            <p className="text-sm text-body">
              Send your details and we&apos;ll contact you about payment. Once it&apos;s confirmed, we add the {item.kind} to
              your account.
            </p>
          )}
          {unverified && <VerifyEmailNotice>Verify your email address before sending a request.</VerifyEmailNotice>}
          <form onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Full name" htmlFor="full_name" error={errors.full_name?.message} required>
              <Input {...register("full_name")} autoComplete="name" />
            </Field>
            <Field label="Phone number" htmlFor="phone" error={errors.phone?.message} required>
              <Input type="tel" inputMode="tel" {...register("phone")} autoComplete="tel" placeholder="98XXXXXXXX" />
            </Field>
            <Field
              label="Payment reference (optional)"
              htmlFor="payment_reference"
              error={errors.payment_reference?.message}
              hint="If you've already paid: the eSewa, Khalti or bank transaction ID."
              className="sm:col-span-2"
            >
              <Input {...register("payment_reference")} autoComplete="off" />
            </Field>
            <Field label="Message (optional)" htmlFor="message" error={errors.message?.message} className="sm:col-span-2">
              <Textarea rows={3} {...register("message")} />
            </Field>
            {errors.root?.message && (
              <div className="sm:col-span-2">
                <Alert tone="danger">{errors.root.message}</Alert>
              </div>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" size="lg" loading={isSubmitting}>
                Send request
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
      {summary}
    </div>
  );
}
