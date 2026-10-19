import { Logo } from "@/components/brand/logo";
import type { MenuLink, SiteSettings } from "@/types/cms";

import { CmsLink } from "./cms-link";

const SOCIAL_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  x: "X",
  tiktok: "TikTok",
  github: "GitHub",
  whatsapp: "WhatsApp",
};

export function SiteFooter({
  settings,
  footer,
  legal,
}: {
  settings: SiteSettings;
  footer: MenuLink[];
  legal: MenuLink[];
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto bg-navy text-white/80">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo siteName={settings.site_name} logoUrl={settings.logo_inverted?.url ?? null} inverted />
          {settings.tagline && <p className="mt-4 text-sm">{settings.tagline}</p>}
          {settings.footer_text && <p className="mt-3 text-sm text-white/60">{settings.footer_text}</p>}
        </div>

        {footer.length > 0 && (
          <nav aria-label="Footer">
            <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 md:grid-cols-1">
              {footer.flatMap((item) => [item, ...item.children]).map((item) => (
                <li key={`${item.label}-${item.url}`}>
                  <CmsLink href={item.url} newTab={item.open_in_new_tab} className="hover:text-white hover:underline">
                    {item.label}
                  </CmsLink>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {(settings.contact_email || settings.contact_phone || settings.social_links.length > 0) && (
          <div className="text-sm">
            <p className="font-semibold text-white">Contact</p>
            <ul className="mt-3 space-y-2">
              {settings.contact_email && (
                <li>
                  <a href={`mailto:${settings.contact_email}`} className="hover:text-white hover:underline">
                    {settings.contact_email}
                  </a>
                </li>
              )}
              {settings.contact_phone && (
                <li>
                  <a href={`tel:${settings.contact_phone.replace(/\s/g, "")}`} className="hover:text-white hover:underline">
                    {settings.contact_phone}
                  </a>
                </li>
              )}
            </ul>
            {settings.social_links.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="Social media">
                {settings.social_links.map((link) => (
                  <li key={link.url}>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="hover:text-white hover:underline">
                      {SOCIAL_LABELS[link.platform] ?? link.platform}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-5 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {year} {settings.site_name}
          </p>
          {legal.length > 0 && (
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              {legal.map((item) => (
                <li key={`${item.label}-${item.url}`}>
                  <CmsLink href={item.url} newTab={item.open_in_new_tab} className="hover:text-white hover:underline">
                    {item.label}
                  </CmsLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </footer>
  );
}
