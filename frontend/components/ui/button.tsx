import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

import { Spinner } from "./spinner";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-colors disabled:pointer-events-none disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal",
  {
    variants: {
      variant: {
        primary: "bg-teal-700 text-white hover:bg-teal-800",
        secondary: "bg-navy text-white hover:bg-navy-900",
        outline: "border border-line bg-white text-navy hover:bg-teal-50 hover:border-teal/40",
        ghost: "text-navy hover:bg-teal-50",
        danger: "bg-danger text-white hover:opacity-90",
        link: "text-teal-700 underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({ className, variant, size, asChild, loading, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Spinner className="h-4 w-4" />}
          {children}
        </>
      )}
    </Comp>
  );
}
