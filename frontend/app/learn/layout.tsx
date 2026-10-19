import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { getCurrentUser } from "@/lib/auth";
import { getSiteSettings } from "@/lib/cms";

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = "force-dynamic";

/** The course player gets a slim header so lesson content has the whole screen. */
export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const [settings, user] = await Promise.all([getSiteSettings(), getCurrentUser()]);
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
          <Logo siteName={settings.site_name} logoUrl={settings.logo?.url} />
          <nav aria-label="Account" className="flex items-center gap-4 text-sm font-medium">
            <Link href="/courses" className="text-navy hover:text-teal-700">
              Courses
            </Link>
            {user ? (
              <Link href="/dashboard" className="text-navy hover:text-teal-700">
                My dashboard
              </Link>
            ) : (
              <Link href="/login" className="text-navy hover:text-teal-700">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
