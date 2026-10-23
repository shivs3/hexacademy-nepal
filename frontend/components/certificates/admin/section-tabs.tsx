"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/certificates", label: "Issued", manage: false },
  { href: "/admin/certificates/rules", label: "Course rules", manage: true },
  { href: "/admin/certificates/templates", label: "Templates", manage: true },
];

export function CertificateTabs({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => canManage || !t.manage);
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Certificate sections" className="mb-6 flex gap-1 border-b border-line">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              active ? "border-teal text-navy" : "border-transparent text-muted hover:text-navy",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
