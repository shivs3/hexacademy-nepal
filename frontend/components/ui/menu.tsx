"use client";

import { DropdownMenu as M } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/** Accessible dropdown (keyboard navigation and focus handling from Radix). */
export function Menu({ trigger, children, align = "end" }: { trigger: React.ReactNode; children: React.ReactNode; align?: "start" | "end" }) {
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-48 rounded-lg border border-line bg-white p-1 text-sm shadow-lg"
        >
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function MenuItem({
  children,
  onSelect,
  disabled,
  danger,
  asChild,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  asChild?: boolean;
}) {
  return (
    <M.Item
      asChild={asChild}
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-navy outline-none data-[disabled]:cursor-default data-[disabled]:opacity-45 data-[highlighted]:bg-teal-50",
        danger && "text-danger data-[highlighted]:bg-danger-50",
      )}
    >
      {children}
    </M.Item>
  );
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-line" />;
}
