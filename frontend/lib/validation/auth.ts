import { z } from "@/lib/zod";

/**
 * Client-side validation mirrors the backend rules for fast feedback only;
 * the API re-validates everything (including Django's password validators).
 */
const email = z.string().trim().min(1, "Email is required.").email("Enter a valid email address.").max(254);
const password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use at most 128 characters.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required."),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, "Enter your full name.").max(150),
    email,
    phone: z
      .string()
      .trim()
      .regex(/^(\+?[0-9\- ]{7,20})?$/, "Enter a valid phone number.")
      .optional()
      .or(z.literal("")),
    password,
    confirm_password: z.string(),
    accept_terms: z.boolean().refine((v) => v, "You must accept the terms to continue."),
  })
  .refine((v) => v.password === v.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match.",
  });
export type RegisterValues = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({ new_password: password, confirm_password: z.string() })
  .refine((v) => v.new_password === v.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match.",
  });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Enter your current password."),
    new_password: password,
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match.",
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
