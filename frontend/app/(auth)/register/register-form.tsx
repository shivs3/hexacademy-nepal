"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { applyServerErrors } from "@/lib/forms";
import { registerSchema, type RegisterValues } from "@/lib/validation/auth";

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { full_name: "", email: "", phone: "", password: "", confirm_password: "", accept_terms: false },
  });

  const onSubmit = handleSubmit(async ({ full_name, email, phone, password }) => {
    setFormError(null);
    try {
      await api.post("/auth/register/", { full_name, email, phone: phone ?? "", password });
      router.replace("/dashboard?welcome=1");
      router.refresh();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["full_name", "email", "phone", "password"]));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Field label="Full name" htmlFor="full_name" error={errors.full_name?.message} required>
        <Input autoComplete="name" {...register("full_name")} />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email?.message} required>
        <Input type="email" autoComplete="email" inputMode="email" {...register("email")} />
      </Field>
      <Field label="Phone" htmlFor="phone" error={errors.phone?.message} hint="Optional. Used for class reminders.">
        <Input type="tel" autoComplete="tel" inputMode="tel" {...register("phone")} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message} hint="At least 10 characters." required>
        <Input type="password" autoComplete="new-password" {...register("password")} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm_password" error={errors.confirm_password?.message} required>
        <Input type="password" autoComplete="new-password" {...register("confirm_password")} />
      </Field>
      <div>
        <label className="flex items-start gap-2 text-sm text-body">
          <Checkbox
            {...register("accept_terms")}
            aria-invalid={errors.accept_terms ? true : undefined}
            aria-describedby={errors.accept_terms ? "accept_terms-error" : undefined}
            className="mt-0.5"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="font-medium text-teal-700 hover:underline">
              terms of service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-teal-700 hover:underline">
              privacy policy
            </Link>
            .
          </span>
        </label>
        {errors.accept_terms && (
          <p id="accept_terms-error" className="mt-1 text-xs text-danger">
            {errors.accept_terms.message}
          </p>
        )}
      </div>
      <Button type="submit" loading={isSubmitting} className="w-full">
        Create account
      </Button>
    </form>
  );
}
