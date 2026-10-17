import type { CurrentUser } from "@/types/accounts";

/**
 * UI-only permission checks (hide controls the user cannot use). The backend
 * enforces every permission independently; never rely on these for security.
 */
export function hasPerm(user: Pick<CurrentUser, "permissions" | "is_superuser"> | null, perm: string): boolean {
  if (!user) return false;
  return user.is_superuser || user.permissions.includes(perm);
}

export function hasAnyPerm(user: Pick<CurrentUser, "permissions" | "is_superuser"> | null, perms: string[]): boolean {
  return perms.some((p) => hasPerm(user, p));
}
