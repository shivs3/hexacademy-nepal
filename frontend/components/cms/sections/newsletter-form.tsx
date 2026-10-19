"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { applyServerErrors } from "@/lib/forms";
import { newsletterSchema, type NewsletterValues } from "@/lib/validation/cms";

export function NewsletterForm({ buttonLabel, consentText }: { buttonLabel: string; consentText: string }) {
  const id = useId();
  const pathname = usePathname();
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NewsletterValues>({ resolver: zodResolver(newsletterSchema), defaultValues: { email: "", consent: false } });

  if (done) {
    return (
      <p role="status" className="flex items-center gap-2 font-medium text-success">
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        Thanks — you are subscribed.
      </p>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post("/newsletter/subscribe/", { ...values, source: pathname });
      setDone(true);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["email", "consent"]));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <Input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? `${id}-email-error` : undefined}
          {...register("email")}
        />
        <Button type="submit" loading={isSubmitting} className="sm:w-auto">
          {buttonLabel}
        </Button>
      </div>
      {errors.email && (
        <p id={`${id}-email-error`} className="text-xs text-danger">
          {errors.email.message}
        </p>
      )}
      <label className="flex items-start gap-2 text-sm text-muted">
        <Checkbox className="mt-0.5" aria-invalid={errors.consent ? true : undefined} {...register("consent")} />
        <span>{consentText}</span>
      </label>
      {errors.consent && <p className="text-xs text-danger">{errors.consent.message}</p>}
    </form>
  );
}
