import { z } from "zod";

/** Client-side checks for fast feedback only; the API re-validates everything. */
export const newsletterSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address.").max(254),
  consent: z.boolean().refine((v) => v, "Please confirm that you want to receive our emails."),
});
export type NewsletterValues = z.infer<typeof newsletterSchema>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slug limits match the model fields: pages 120, blog posts 140, categories 90. */
export function slugField(max: number) {
  return z
    .string()
    .trim()
    .min(1, "Enter a slug.")
    .max(max, `Use at most ${max} characters.`)
    .regex(SLUG, "Use lowercase letters, numbers and single hyphens.");
}

export const slugSchema = slugField(120);

export function slugify(value: string, max = 80): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
}
