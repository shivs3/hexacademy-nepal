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

/** Staff who see courses in the staff area: catalog managers, publishers, and anyone on a teaching team. */
export function canOpenCatalog(user: Pick<CurrentUser, "permissions" | "is_superuser" | "roles"> | null): boolean {
  if (!user) return false;
  return (
    hasAnyPerm(user, ["catalog.manage_catalog", "catalog.publish_courses", "catalog.author_assigned_courses"]) ||
    user.roles.includes("teaching_assistant")
  );
}

/** Staff who see learners' enrollments: support staff, and teaching staff for their own courses. */
export function canOpenEnrollments(user: Pick<CurrentUser, "permissions" | "is_superuser" | "roles"> | null): boolean {
  if (!user) return false;
  return (
    hasAnyPerm(user, ["learning.manage_enrollments", "learning.view_learner_progress", "catalog.manage_catalog"]) ||
    user.roles.includes("instructor") ||
    user.roles.includes("teaching_assistant")
  );
}
