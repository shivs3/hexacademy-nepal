import type { Metadata } from "next";

import { AppShell, type NavSection } from "@/components/shell/app-shell";
import { serverGetOrNull } from "@/lib/api/server";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/dashboard");
  // A failed count must not break the dashboard: the label just omits it.
  const unread = (await serverGetOrNull<{ unread: number }>("/me/notifications/unread-count/"))?.unread ?? 0;
  const sections: NavSection[] = [
    {
      items: [
        { href: "/dashboard", label: "Overview", icon: "dashboard", exact: true },
        { href: "/dashboard/courses", label: "My courses", icon: "courses" },
        { href: "/dashboard/classes", label: "Live classes", icon: "live" },
        { href: "/dashboard/assignments", label: "Assignments", icon: "assignments" },
        { href: "/dashboard/exams", label: "Exams", icon: "exams" },
        { href: "/dashboard/certificates", label: "Certificates", icon: "certificates" },
        { href: "/dashboard/orders", label: "Orders", icon: "orders" },
        { href: "/dashboard/notifications", label: unread ? `Notifications (${unread > 99 ? "99+" : unread})` : "Notifications", icon: "notifications" },
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
