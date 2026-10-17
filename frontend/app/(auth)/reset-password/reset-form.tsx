"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { applyServerErrors } from "@/lib/forms";
import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/validation/auth";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const uid = params.get("uid");
  const token = params.get("token");
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { new_password: "", confirm_password: "" },
  });

  if (!uid || !token) {
    return (
      <Alert tone="danger" className="mt-6">
        This reset link is incomplete. <Link href="/forgot-password" className="font-medium underline">Request a new one</Link>.
      </Alert>
    );
  }

  if (done) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <Alert tone="success">Your password has been changed. You can now sign in with the new password.</Alert>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = handleSubmit(async ({ new_password }) => {
    setFormError(null);
    try {
      await api.post("/auth/password-reset/confirm/", { uid, token, new_password });
      setDone(true);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["new_password"]));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
      {formError && (
        <Alert tone="danger">
          {formError}{" "}
          <Link href="/forgot-password" className="font-medium underline">
            Request a new link
          </Link>
        </Alert>
      )}
      <Field label="New password" htmlFor="new_password" error={errors.new_password?.message} hint="At least 10 characters." required>
        <Input type="password" autoComplete="new-password" {...register("new_password")} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm_password" error={errors.confirm_password?.message} required>
        <Input type="password" autoComplete="new-password" {...register("confirm_password")} />
      </Field>
      <Button type="submit" loading={isSubmitting} className="w-full">
        Set new password
      </Button>
    </form>
  );
}
