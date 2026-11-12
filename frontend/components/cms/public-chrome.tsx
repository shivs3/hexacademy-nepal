import { getCurrentUser } from "@/lib/auth";
import { getMenu, getSiteSettings, SITE_URL } from "@/lib/cms";
import { getNotices } from "@/lib/notices";

import { AnnouncementBar } from "./announcement-bar";
import { JsonLd } from "./json-ld";
import { NoticePopup } from "./notice-popup";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/** Public site frame: announcement, CMS header and footer menus, organisation structured data. */
export async function PublicChrome({ children, banner }: { children: React.ReactNode; banner?: React.ReactNode }) {
  const [settings, header, footer, legal, user, notices] = await Promise.all([
    getSiteSettings(),
    getMenu("header"),
    getMenu("footer"),
    getMenu("legal"),
    getCurrentUser().catch(() => null),
    getNotices(),
  ]);
  const popupNotices = notices.filter((n) => n.show_in_popup);

  return (
    <div className="flex min-h-screen flex-col">
      {banner}
      <AnnouncementBar announcement={settings.announcement} />
      <SiteHeader siteName={settings.site_name} logoUrl={settings.logo?.url ?? null} showName={settings.show_name_with_logo} items={header} signedIn={!!user} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter settings={settings} footer={footer} legal={legal} />
      {popupNotices.length > 0 && <NoticePopup notices={popupNotices} />}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "EducationalOrganization",
          name: settings.site_name,
          url: SITE_URL,
          ...(settings.logo ? { logo: new URL(settings.logo.url, SITE_URL).toString() } : {}),
          ...(settings.contact_email ? { email: settings.contact_email } : {}),
          ...(settings.social_links.length ? { sameAs: settings.social_links.map((l) => l.url) } : {}),
        }}
      />
    </div>
  );
}
