import type { Metadata } from "next";

import { Logo } from "@/components/brand/logo";
import { getSiteSettings } from "@/lib/cms";

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = "force-dynamic";

/** The exam player has no site navigation, so a stray click cannot leave the attempt. */
export default async function ExamLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
          <Logo siteName={settings.site_name} logoUrl={settings.logo?.url} />
        </div>
      </header>
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
