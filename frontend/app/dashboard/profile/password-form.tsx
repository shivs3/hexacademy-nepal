"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { applyServerErrors } from "@/lib/forms";
import { changePasswordSchema, type ChangePasswordValues } from "@/lib/validation/auth";

export function ChangePasswordForm() {
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  const onSubmit = handleSubmit(async ({ current_password, new_password }) => {
    setFormError(null);
    try {
      await api.post("/users/me/password/", { current_password, new_password });
      reset();
      toast.success("Password changed.");
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["current_password", "new_password"]));
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field label="Current password" htmlFor="current_password" error={errors.current_password?.message} required>
            <Input type="password" autoComplete="current-password" {...register("current_password")} />
          </Field>
          <Field label="New password" htmlFor="new_password" error={errors.new_password?.message} required>
            <Input type="password" autoComplete="new-password" {...register("new_password")} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm_password" error={errors.confirm_password?.message} required>
            <Input type="password" autoComplete="new-password" {...register("confirm_password")} />
          </Field>
          <Button type="submit" variant="secondary" loading={isSubmitting}>
            Update password
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
