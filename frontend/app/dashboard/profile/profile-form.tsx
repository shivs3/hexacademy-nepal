"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { applyServerErrors } from "@/lib/forms";
import type { CurrentUser } from "@/types/accounts";

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name.").max(150),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?[0-9\- ]{7,20})?$/, "Enter a valid phone number."),
  headline: z.string().trim().max(160),
  bio: z.string().trim().max(2000),
  city: z.string().trim().max(80),
  marketing_opt_in: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function ProfileForm({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: user.full_name,
      phone: user.phone,
      headline: user.profile?.headline ?? "",
      bio: user.profile?.bio ?? "",
      city: user.profile?.city ?? "",
      marketing_opt_in: user.profile?.marketing_opt_in ?? false,
    },
  });

  const onSubmit = handleSubmit(async ({ full_name, phone, ...profile }) => {
    setFormError(null);
    try {
      const updated = await api.patch<CurrentUser>("/users/me/", { full_name, phone, profile });
      reset({
        full_name: updated.full_name,
        phone: updated.phone,
        headline: updated.profile?.headline ?? "",
        bio: updated.profile?.bio ?? "",
        city: updated.profile?.city ?? "",
        marketing_opt_in: updated.profile?.marketing_opt_in ?? false,
      });
      toast.success("Profile saved.");
      router.refresh();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["full_name", "phone"]));
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal details</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field label="Email" htmlFor="email" hint="Contact support to change your sign-in email.">
            <Input value={user.email} readOnly disabled />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="full_name" error={errors.full_name?.message} required>
              <Input autoComplete="name" {...register("full_name")} />
            </Field>
            <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
              <Input type="tel" autoComplete="tel" {...register("phone")} />
            </Field>
          </div>
          <Field label="Headline" htmlFor="headline" error={errors.headline?.message} hint="For example: BE Computer student, Pulchowk">
            <Input {...register("headline")} />
          </Field>
          <Field label="City" htmlFor="city" error={errors.city?.message}>
            <Input autoComplete="address-level2" {...register("city")} />
          </Field>
          <Field label="Bio" htmlFor="bio" error={errors.bio?.message}>
            <Textarea rows={4} {...register("bio")} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-body">
            <Checkbox {...register("marketing_opt_in")} />
            Email me about new courses and events
          </label>
          <div className="flex justify-end">
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
              Save changes
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
