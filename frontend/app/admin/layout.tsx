import type { Metadata } from "next";

import { AppShell, type NavItem, type NavSection } from "@/components/shell/app-shell";
import { requireStaff } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";

export const metadata: Metadata = { title: { default: "Staff", template: "%s | Staff | Hexacademy Nepal" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();

  // Each later milestone adds its section here, gated by the permission its API requires.
  const people: NavItem[] = [];
  if (hasPerm(user, "accounts.view_user_directory")) people.push({ href: "/admin/users", label: "Users", icon: "users" });

  const sections: NavSection[] = [
    { items: [{ href: "/admin", label: "Overview", icon: "dashboard", exact: true }] },
    ...(people.length ? [{ title: "People", items: people }] : []),
  ];

  return (
    <AppShell
      sections={sections}
      user={{ full_name: user.full_name, email: user.email }}
      area="Staff"
      switchLink={{ href: "/dashboard", label: "Open student dashboard" }}
    >
      {children}
    </AppShell>
  );
}
