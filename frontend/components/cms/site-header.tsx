"use client";

import { ChevronDown, Menu as MenuIcon, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MenuLink } from "@/types/cms";

import { CmsLink } from "./cms-link";

type Props = {
  siteName: string;
  logoUrl: string | null;
  items: MenuLink[];
  signedIn: boolean;
};

function isActive(pathname: string, url: string) {
  if (!url.startsWith("/")) return false;
  return url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(`${url}/`);
}

export function SiteHeader({ siteName, logoUrl, items, signedIn }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openPath, setOpenPath] = useState(pathname);

  // Close the mobile menu after navigation (state is keyed to the path it was opened on).
  const menuVisible = mobileOpen && openPath === pathname;

  useEffect(() => {
    if (!menuVisible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuVisible]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo siteName={siteName} logoUrl={logoUrl} />

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {items.map((item) =>
            item.children.length ? (
              <Dropdown key={item.label} item={item} pathname={pathname} />
            ) : (
              <CmsLink
                key={item.label}
                href={item.url}
                newTab={item.open_in_new_tab}
                aria-current={isActive(pathname, item.url) ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium text-navy/80 transition-colors hover:bg-teal-50 hover:text-navy",
                  isActive(pathname, item.url) && "text-teal-700",
                )}
              >
                {item.label}
              </CmsLink>
            ),
          )}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <AccountLinks signedIn={signedIn} />
        </div>

        <button
          type="button"
          className="rounded-md p-2 text-navy hover:bg-teal-50 lg:hidden"
          aria-expanded={menuVisible}
          aria-controls="mobile-nav"
          aria-label={menuVisible ? "Close menu" : "Open menu"}
          onClick={() => {
            setOpenPath(pathname);
            setMobileOpen(!menuVisible);
          }}
        >
          {menuVisible ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      {menuVisible && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-line bg-white px-4 pb-6 pt-2 lg:hidden">
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.label} className="border-b border-line/70 last:border-0">
                {item.children.length ? (
                  <>
                    <p className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">{item.label}</p>
                    <ul className="pb-2">
                      {item.children.map((child) => (
                        <li key={child.label}>
                          <CmsLink href={child.url} newTab={child.open_in_new_tab} className="block py-2 pl-2 text-navy">
                            {child.label}
                          </CmsLink>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <CmsLink
                    href={item.url}
                    newTab={item.open_in_new_tab}
                    aria-current={isActive(pathname, item.url) ? "page" : undefined}
                    className="block py-3 font-medium text-navy"
                  >
                    {item.label}
                  </CmsLink>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <AccountLinks signedIn={signedIn} />
          </div>
        </nav>
      )}
    </header>
  );
}

function AccountLinks({ signedIn }: { signedIn: boolean }) {
  if (signedIn) {
    return (
      <Button asChild size="sm" className="col-span-2">
        <Link href="/dashboard">My dashboard</Link>
      </Button>
    );
  }
  return (
    <>
      <Button asChild variant="outline" size="sm">
        <Link href="/login">Sign in</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/register">Create account</Link>
      </Button>
    </>
  );
}

function Dropdown({ item, pathname }: { item: MenuLink; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = item.children.some((c) => isActive(pathname, c.url));

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-navy/80 hover:bg-teal-50 hover:text-navy",
          active && "text-teal-700",
        )}
      >
        {item.label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <ul className="absolute left-0 top-full z-40 mt-1 min-w-52 rounded-lg border border-line bg-white p-1 shadow-lg">
          {item.children.map((child) => (
            <li key={child.label}>
              <CmsLink
                href={child.url}
                newTab={child.open_in_new_tab}
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-navy hover:bg-teal-50"
              >
                {child.label}
              </CmsLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
