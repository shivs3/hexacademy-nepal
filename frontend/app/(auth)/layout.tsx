import { Logo } from "@/components/brand/logo";
import { getSiteSettings } from "@/lib/cms";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  const panel = settings.auth_panel;
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,34rem)]">
      <aside className="relative hidden overflow-hidden bg-navy lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Logo inverted siteName={settings.site_name} logoUrl={settings.logo_inverted?.url ?? null} />
        <div className="max-w-md">
          <p className="font-display text-3xl font-semibold leading-tight text-white">
            {panel.heading || settings.tagline || settings.site_name}
          </p>
          {panel.text && <p className="mt-4 text-lg text-white/75">{panel.text}</p>}
        </div>
        <svg className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 opacity-20" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M20 2 36 11v18L20 38 4 29V11z" fill="none" stroke="var(--brand-mint)" strokeWidth="0.4" />
          <path d="M20 9 30 14.5v11L20 31l-10-5.5v-11z" fill="none" stroke="var(--brand-teal)" strokeWidth="0.4" />
        </svg>
      </aside>
      <main id="main" className="flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo siteName={settings.site_name} logoUrl={settings.logo?.url ?? null} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
