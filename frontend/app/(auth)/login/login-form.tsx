"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { applyServerErrors } from "@/lib/forms";
import { safeNextPath } from "@/lib/navigation";
import { loginSchema, type LoginValues } from "@/lib/validation/auth";
import type { CurrentUser } from "@/types/accounts";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const user = await api.post<CurrentUser>("/auth/login/", values);
      const fallback = user.is_staff_member ? "/admin" : "/dashboard";
      router.replace(safeNextPath(params.get("next"), fallback));
      router.refresh();
    } catch (err) {
      if (isApiError(err) && err.code === "throttled") {
        setFormError("Too many sign-in attempts. Please wait a few minutes and try again.");
        return;
      }
      setFormError(applyServerErrors(err, setError, ["email", "password"]));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Field label="Email" htmlFor="email" error={errors.email?.message} required>
        <Input type="email" autoComplete="email" inputMode="email" {...register("email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message} required>
        <Input type="password" autoComplete="current-password" {...register("password")} />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-teal-700 hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" loading={isSubmitting} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
