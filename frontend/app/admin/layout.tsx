import type { Metadata } from "next";

import { AppShell, type NavItem, type NavSection } from "@/components/shell/app-shell";
import { requireStaff } from "@/lib/auth";
import { canOpenCatalog, canOpenEnrollments, hasAnyPerm, hasPerm } from "@/lib/permissions";

export const metadata: Metadata = { title: { default: "Staff", template: "%s | Staff | Hexacademy Nepal" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();

  // Each later milestone adds its section here, gated by the permission its API requires.
  const people: NavItem[] = [];
  if (hasPerm(user, "accounts.view_user_directory")) people.push({ href: "/admin/users", label: "Users", icon: "users" });

  const learning: NavItem[] = [];
  if (canOpenCatalog(user)) learning.push({ href: "/admin/catalog", label: "Courses", icon: "courses", exact: true, match: ["/admin/catalog/courses", "/admin/catalog/lessons"] });
  if (hasPerm(user, "catalog.manage_catalog"))
    learning.push({ href: "/admin/catalog/categories", label: "Course categories", icon: "categories" });
  if (canOpenEnrollments(user)) learning.push({ href: "/admin/learning/enrollments", label: "Enrollments", icon: "enrollments" });

  const website: NavItem[] = [];
  if (hasAnyPerm(user, ["cms.manage_pages", "cms.manage_blog", "cms.manage_media"]))
    website.push({ href: "/admin/cms", label: "Website overview", icon: "website", exact: true });
  if (hasPerm(user, "cms.manage_pages")) website.push({ href: "/admin/cms/pages", label: "Pages", icon: "pages" });
  if (hasPerm(user, "cms.manage_blog")) website.push({ href: "/admin/cms/blog", label: "Blog", icon: "blog" });
  if (hasAnyPerm(user, ["cms.manage_media", "cms.manage_pages", "cms.manage_blog", "cms.manage_site_settings"]))
    website.push({ href: "/admin/cms/media", label: "Media library", icon: "media" });
  if (hasPerm(user, "cms.manage_menus")) website.push({ href: "/admin/cms/menus", label: "Menus", icon: "menus" });
  if (hasPerm(user, "cms.manage_site_settings")) website.push({ href: "/admin/cms/settings", label: "Site settings", icon: "settings" });
  if (hasPerm(user, "cms.view_newsletter_subscribers"))
    website.push({ href: "/admin/cms/newsletter", label: "Newsletter", icon: "newsletter" });

  const sections: NavSection[] = [
    { items: [{ href: "/admin", label: "Overview", icon: "dashboard", exact: true }] },
    ...(learning.length ? [{ title: "Learning", items: learning }] : []),
    ...(website.length ? [{ title: "Website", items: website }] : []),
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
