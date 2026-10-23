"use client";

import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LoadError, Pager } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { useApiResource } from "@/hooks/use-api-resource";
import { cn } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { LearnerSession } from "@/types/live-classes";

import { SessionCard } from "./session-card";

const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
] as const;

export function MyClasses() {
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const [page, setPage] = useState(1);
  const { data, error, reload } = useApiResource<Paginated<LearnerSession>>("/me/class-sessions/", { scope, page });

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Classes" className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={scope === t.id}
            aria-controls="classes-panel"
            onClick={() => {
              setScope(t.id);
              setPage(1);
            }}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal",
              scope === t.id ? "border-teal text-navy" : "border-transparent text-muted hover:text-navy",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="classes-panel" aria-labelledby={`tab-${scope}`} className="flex flex-col gap-4">
        {error && <LoadError message={error} onRetry={reload} />}
        {!data && !error ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : data && data.results.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={scope === "upcoming" ? "No upcoming live classes" : "No past classes yet"}
            description={
              scope === "upcoming"
                ? "When your instructor adds you to a batch and schedules a class, it appears here. You will also get a reminder an hour before."
                : "Classes you were scheduled for appear here after they end, with recordings when available."
            }
            action={
              scope === "upcoming" ? (
                <Button asChild variant="outline">
                  <Link href="/dashboard/courses">Go to my courses</Link>
                </Button>
              ) : undefined
            }
          />
        ) : data ? (
          <>
            <ul className="grid gap-4 md:grid-cols-2">
              {data.results.map((s) => (
                <li key={s.id}>
                  <SessionCard session={s} />
                </li>
              ))}
            </ul>
            <Pager data={data} onPage={setPage} />
          </>
        ) : null}
      </div>
    </div>
  );
}
