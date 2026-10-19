import type * as React from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CmsLink } from "../cms-link";

/** The first section on a page renders its heading as the page's <h1>. */
export type HeadingLevel = "h1" | "h2";

export function SectionContainer({
  children,
  className,
  inner,
  tone = "default",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  inner?: string;
  tone?: "default" | "white" | "dark" | "accent";
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "py-16 sm:py-20",
        tone === "white" && "bg-white",
        tone === "dark" && "bg-navy text-white",
        tone === "accent" && "bg-teal text-white",
        className,
      )}
    >
      <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", inner)}>{children}</div>
    </section>
  );
}

export function SectionHeading({
  heading,
  intro,
  center = true,
  inverted,
  level = "h2",
}: {
  heading?: string;
  intro?: string;
  center?: boolean;
  inverted?: boolean;
  level?: HeadingLevel;
}) {
  if (!heading && !intro) return null;
  const H = level;
  return (
    <div className={cn("mb-10 max-w-2xl", center && "mx-auto text-center")}>
      {heading && (
        <H className={cn("text-3xl font-bold leading-tight sm:text-4xl", inverted && "text-white")}>{heading}</H>
      )}
      {intro && <p className={cn("mt-3 text-lg", inverted ? "text-white/80" : "text-muted")}>{intro}</p>}
    </div>
  );
}

export function CtaButton({
  label,
  url,
  variant = "primary",
  className,
}: {
  label?: string;
  url?: string;
  variant?: "primary" | "secondary" | "outline" | "inverted";
  className?: string;
}) {
  if (!label || !url) return null;
  const classes =
    variant === "inverted"
      ? cn(buttonVariants({ size: "lg" }), "bg-white text-navy hover:bg-white/90", className)
      : cn(buttonVariants({ variant, size: "lg" }), className);
  return (
    <CmsLink href={url} className={classes}>
      {label}
    </CmsLink>
  );
}
