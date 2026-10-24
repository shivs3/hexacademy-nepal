import { cn } from "@/lib/utils";
import type { SectionDataMap } from "@/types/cms";

import { MediaImage } from "../media-image";
import { CtaButton } from "./shared";

export function HeroSection({ data, first }: { data: SectionDataMap["hero"]; first?: boolean }) {
  const dark = data.theme === "dark";
  const Heading = first ? "h1" : "h2";
  return (
    <section className={cn("relative overflow-hidden", dark ? "bg-navy text-white" : "bg-white")}>
      <HexPattern dark={dark} />
      <div
        className={cn(
          "relative mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24",
          data.image && "lg:grid-cols-[1.1fr_1fr] lg:items-center",
        )}
      >
        <div className={cn("max-w-2xl", !data.image && "mx-auto text-center")}>
          {data.eyebrow && (
            <p
              className={cn(
                "mb-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider",
                // White, not mint: mint on navy is below 4.5:1, while white is guaranteed by the navy check.
                dark ? "bg-white/10 text-white" : "bg-teal-50 text-teal-700",
              )}
            >
              {data.eyebrow}
            </p>
          )}
          <Heading
            className={cn(
              "text-4xl font-bold leading-[1.1] sm:text-5xl lg:text-[3.4rem]",
              dark ? "text-white" : "text-navy",
            )}
          >
            {data.heading}
          </Heading>
          {data.subheading && (
            <p className={cn("mt-5 text-lg leading-relaxed", dark ? "text-white/80" : "text-muted")}>
              {data.subheading}
            </p>
          )}
          {(data.primary_cta_label || data.secondary_cta_label) && (
            <div className={cn("mt-8 flex flex-wrap gap-3", !data.image && "justify-center")}>
              <CtaButton label={data.primary_cta_label} url={data.primary_cta_url} />
              <CtaButton
                label={data.secondary_cta_label}
                url={data.secondary_cta_url}
                variant={dark ? "inverted" : "outline"}
              />
            </div>
          )}
        </div>
        {data.image && (
          <div className="overflow-hidden rounded-[var(--radius-card)] shadow-xl ring-1 ring-black/5">
            <MediaImage image={data.image} priority={first} sizes="(min-width: 1024px) 45vw, 100vw" />
          </div>
        )}
      </div>
    </section>
  );
}

/** Subtle hexagon line pattern echoing the logo mark. */
function HexPattern({ dark }: { dark: boolean }) {
  return (
    <svg
      className={cn("pointer-events-none absolute -right-32 -top-32 h-[34rem] w-[34rem]", dark ? "opacity-15" : "opacity-[0.07]")}
      viewBox="0 0 40 40"
      aria-hidden="true"
    >
      <path d="M20 2 36 11v18L20 38 4 29V11z" fill="none" stroke="var(--brand-teal)" strokeWidth="0.3" />
      <path d="M20 9 30 14.5v11L20 31l-10-5.5v-11z" fill="none" stroke="var(--brand-mint)" strokeWidth="0.3" />
      <path d="M20 15.5 25 18.3v5.4L20 26.5l-5-2.8v-5.4z" fill="none" stroke="var(--brand-teal)" strokeWidth="0.3" />
    </svg>
  );
}
