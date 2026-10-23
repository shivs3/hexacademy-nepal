import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const tones = {
  info: { box: "border-teal/30 bg-teal-50 text-navy", icon: Info },
  success: { box: "border-success/30 bg-success-50 text-success", icon: CheckCircle2 },
  warning: { box: "border-warning/30 bg-warning-50 text-warning", icon: TriangleAlert },
  danger: { box: "border-danger/30 bg-danger-50 text-danger", icon: AlertCircle },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = tones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-3 text-sm", box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-body/90">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line bg-white px-6 py-12 text-center", className)}>
      {Icon && (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-teal">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div>
        <p className="font-semibold text-navy">{title}</p>
        {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-page text-muted border-line",
  teal: "bg-teal-50 text-teal-700 border-teal/20",
  mint: "bg-mint-50 text-mint border-mint/25",
  navy: "bg-navy text-white border-navy",
  success: "bg-success-50 text-success border-success/20",
  warning: "bg-warning-50 text-warning border-warning/20",
  danger: "bg-danger-50 text-danger border-danger/20",
} as const;

export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", badgeTones[tone], className)}
      {...props}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-line/60", className)} aria-hidden="true" />;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
