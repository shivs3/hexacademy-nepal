import Link from "next/link";
import type * as React from "react";

/** Link to a CMS-provided URL: site paths use client navigation, everything else a plain anchor. */
export function isInternalHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

export function CmsLink({
  href,
  newTab,
  className,
  children,
  ...rest
}: { href: string; newTab?: boolean; className?: string; children: React.ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  if (isInternalHref(href) && !newTab) {
    return (
      <Link href={href} className={className} {...rest}>
        {children}
      </Link>
    );
  }
  const external = !isInternalHref(href) && !href.startsWith("#");
  return (
    <a
      href={href}
      className={className}
      {...(newTab || external ? { target: newTab ? "_blank" : undefined, rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {children}
    </a>
  );
}
