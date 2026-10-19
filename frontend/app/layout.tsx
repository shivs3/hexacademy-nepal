import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

import { ToastProvider } from "@/components/ui/toast";
import { brandStyle, getSiteSettings, SITE_URL } from "@/lib/cms";

import "katex/dist/katex.min.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: settings.default_meta_title || settings.site_name, template: `%s | ${settings.site_name}` },
    description: settings.default_meta_description || undefined,
    applicationName: settings.site_name,
    icons: settings.favicon ? { icon: settings.favicon.url } : undefined,
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = await getSiteSettings();
  return (
    <html
      lang={settings.default_language || "en"}
      className={`${inter.variable} ${jakarta.variable}`}
      style={brandStyle(settings)}
    >
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow">
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
