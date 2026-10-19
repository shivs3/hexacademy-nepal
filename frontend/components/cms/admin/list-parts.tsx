"use client";

import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, Badge, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import type { Paginated } from "@/types/accounts";
import type { PageStatus } from "@/types/cms-admin";

const STATUS: Record<PageStatus, { label: string; tone: "success" | "neutral" | "warning" }> = {
  published: { label: "Published", tone: "success" },
  draft: { label: "Draft", tone: "neutral" },
  archived: { label: "Archived", tone: "warning" },
};

export function StatusBadge({ status }: { status: PageStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  return (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} className="pl-9" />
    </div>
  );
}

export function Pager<T>({ data, onPage }: { data: Paginated<T>; onPage: (page: number) => void }) {
  if (data.total_pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
      <span className="text-muted">
        Page {data.page} of {data.total_pages} · {data.count} total
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={!data.previous} onClick={() => onPage(data.page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={!data.next} onClick={() => onPage(data.page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </Card>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert tone="danger">
      {message}{" "}
      <button type="button" className="font-medium underline" onClick={onRetry}>
        Retry
      </button>
    </Alert>
  );
}

export const th = "px-4 py-3 font-medium";
export const theadClass = "border-b border-line bg-page text-xs uppercase tracking-wide text-muted";
