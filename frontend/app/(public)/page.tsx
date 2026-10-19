import type { Metadata } from "next";
import Link from "next/link";

import { SectionRenderer } from "@/components/cms/section-renderer";
import { Button } from "@/components/ui/button";
import { serverGetOrNull } from "@/lib/api/server";
import { buildMetadata, getSiteSettings } from "@/lib/cms";
import type { PublicPage } from "@/types/cms";

const getHome = () => serverGetOrNull<PublicPage>("/home-page/");

export async function generateMetadata(): Promise<Metadata> {
  const [settings, page] = await Promise.all([getSiteSettings(), getHome()]);
  return buildMetadata(settings, { title: page?.title, seo: page?.seo, path: "/", isHome: true });
}

export default async function HomePage() {
  const [settings, page] = await Promise.all([getSiteSettings(), getHome()]);
  if (!page) {
    // No home page has been published yet: show a neutral holding page rather than a 404.
    return (
      <section className="mx-auto flex max-w-2xl flex-col items-center px-4 py-28 text-center">
        <h1 className="text-4xl font-bold">{settings.site_name}</h1>
        {settings.tagline && <p className="mt-4 text-lg text-muted">{settings.tagline}</p>}
        <div className="mt-8 flex gap-3">
          <Button asChild>
            <Link href="/register">Create an account</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </section>
    );
  }
  return <SectionRenderer sections={page.sections} settings={settings} />;
}
