import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { serverGetOrNull } from "@/lib/api/server";
import type { CurrentUser } from "@/types/accounts";

/** Current user for this request, or null. Deduplicated per render. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  return serverGetOrNull<CurrentUser>("/users/me/");
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

/**
 * UI gate for the staff dashboard. This only decides what to render; every
 * admin API endpoint enforces its own permission on the backend.
 */
export async function requireStaff(): Promise<CurrentUser> {
  const user = await requireUser("/admin");
  if (!user.is_staff_member) redirect("/dashboard");
  return user;
}
