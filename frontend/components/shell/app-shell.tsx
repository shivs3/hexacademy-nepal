"use client";

import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/brand/logo";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { cn, initials } from "@/lib/utils";

import { NavIcon, type NavIconName } from "./nav-icons";

/** `exact` limits the highlight to the href itself; `match` adds the path prefixes that also count as this item. */
export type NavItem = { href: string; label: string; icon: NavIconName; exact?: boolean; match?: string[] };
export type NavSection = { title?: string; items: NavItem[] };

export function isActive(pathname: string, item: Pick<NavItem, "href" | "exact" | "match">): boolean {
  if (item.match?.some((prefix) => pathname.startsWith(`${prefix}/`))) return true;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppShell({
  sections,
  user,
  area,
  switchLink,
  children,
}: {
  sections: NavSection[];
  user: { full_name: string; email: string };
  area: string;
  switchLink?: { href: string; label: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await api.post("/auth/logout/");
      router.replace("/login");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setSigningOut(false);
    }
  }

  const nav = (
    <nav aria-label={`${area} navigation`} className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {sections.map((section, i) => (
        <div key={section.title ?? i}>
          {section.title && (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/45">{section.title}</p>
          )}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active ? "bg-white/12 font-medium text-white" : "text-white/70 hover:bg-white/8 hover:text-white",
                    )}
                  >
                    <NavIcon name={item.icon} className={cn("h-4 w-4", active && "text-mint")} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 p-3">
      {switchLink && (
        <Link href={switchLink.href} className="mb-2 block rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/8 hover:text-white">
          {switchLink.label}
        </Link>
      )}
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal text-xs font-semibold text-white">
          {initials(user.full_name || user.email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user.full_name}</p>
          <p className="truncate text-xs text-white/55">{user.email}</p>
        </div>
        <button
          onClick={signOut}
          disabled={signingOut}
          className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-50"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy lg:flex">
        <div className="flex h-16 items-center px-6">
          <Logo inverted />
        </div>
        {nav}
        {footer}
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
        <Logo />
        <button onClick={() => setOpen(true)} className="rounded p-2 text-navy hover:bg-page" aria-label="Open menu" aria-expanded={open}>
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={`${area} menu`}>
          <div className="absolute inset-0 bg-navy/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-navy">
            <div className="flex h-14 items-center justify-between px-4">
              <Logo inverted />
              <button onClick={() => setOpen(false)} className="rounded p-2 text-white/70 hover:bg-white/10" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {footer}
          </div>
        </div>
      )}

      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
