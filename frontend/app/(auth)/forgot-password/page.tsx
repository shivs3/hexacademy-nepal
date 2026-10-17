"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { applyServerErrors } from "@/lib/forms";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/validation/auth";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post("/auth/password-reset/", values);
      setSent(true);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["email"]));
    }
  });

  return (
    <>
      <title>Reset password | Hexacademy Nepal</title>
      <h1 className="font-display text-2xl font-bold text-navy">Reset your password</h1>
      {sent ? (
        <div className="mt-6 flex flex-col gap-4">
          <Alert tone="success">
            If an account exists for that email, we have sent a link to reset the password. The link expires in 2 hours.
          </Alert>
          <Link href="/login" className="text-sm font-medium text-teal-700 hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-1 mb-6 text-sm text-muted">Enter your account email and we will send you a reset link.</p>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            {formError && <Alert tone="danger">{formError}</Alert>}
            <Field label="Email" htmlFor="email" error={errors.email?.message} required>
              <Input type="email" autoComplete="email" inputMode="email" {...register("email")} />
            </Field>
            <Button type="submit" loading={isSubmitting} className="w-full">
              Send reset link
            </Button>
            <Link href="/login" className="text-center text-sm font-medium text-teal-700 hover:underline">
              Back to sign in
            </Link>
          </form>
        </>
      )}
    </>
  );
}
