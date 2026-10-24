import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Brand mark. When the CMS provides an uploaded logo it is used; otherwise a
 * typographic hexagon mark is rendered so the layout never shows a broken image.
 */
export function Logo({
  siteName = "Hexacademy Nepal",
  logoUrl,
  className,
  inverted,
}: {
  siteName?: string;
  logoUrl?: string | null;
  className?: string;
  inverted?: boolean;
}) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5", className)} aria-label={`${siteName} home`} data-brand-logo>
      {logoUrl ? (
        <Image src={logoUrl} alt="" width={140} height={36} className="h-9 w-auto" unoptimized />
      ) : (
        <>
          <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden="true">
            <path d="M20 2 36 11v18L20 38 4 29V11z" fill="var(--brand-navy)" />
            <path d="M20 9 30 14.5v11L20 31l-10-5.5v-11z" fill="var(--brand-teal)" />
            <path d="M20 15.5 25 18.3v5.4L20 26.5l-5-2.8v-5.4z" fill="var(--brand-mint)" />
          </svg>
          <span className={cn("font-display text-lg font-bold leading-none tracking-tight", inverted ? "text-white" : "text-navy")}>
            {siteName.split(" ")[0]}
            <span className={cn("ml-1 font-semibold", inverted ? "text-mint" : "text-teal")}>
              {siteName.split(" ").slice(1).join(" ")}
            </span>
          </span>
        </>
      )}
    </Link>
  );
}
