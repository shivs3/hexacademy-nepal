import type { Metadata } from "next";

import { AppShell, type NavSection } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/dashboard");
  const sections: NavSection[] = [
    {
      items: [
        { href: "/dashboard", label: "Overview", icon: "dashboard", exact: true },
        { href: "/dashboard/courses", label: "My courses", icon: "courses" },
        { href: "/dashboard/exams", label: "Exams", icon: "exams" },
        { href: "/dashboard/profile", label: "Profile & security", icon: "profile" },
      ],
    },
  ];
  return (
    <AppShell
      sections={sections}
      user={{ full_name: user.full_name, email: user.email }}
      area="Student"
      switchLink={user.is_staff_member ? { href: "/admin", label: "Open staff dashboard" } : undefined}
    >
      {children}
    </AppShell>
  );
}
