"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LoadError, Pager } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { cn, formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { AppNotification } from "@/types/live-classes";

export function NotificationsList() {
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const { data, error, reload } = useApiResource<Paginated<AppNotification>>("/me/notifications/", {
    unread: unreadOnly ? "true" : undefined,
    page,
  });
  const anyUnread = data?.results.some((n) => !n.read_at) ?? false;

  async function markRead(ids?: number[]) {
    setBusy(true);
    try {
      await api.post("/me/notifications/read/", ids ? { ids } : {});
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="notifications-unread"
            checked={unreadOnly}
            onChange={(e) => {
              setUnreadOnly(e.target.checked);
              setPage(1);
            }}
          />
          <Label htmlFor="notifications-unread" className="font-normal">
            Unread only
          </Label>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => markRead()} loading={busy} disabled={!anyUnread}>
          <CheckCheck className="h-4 w-4" aria-hidden="true" />
          Mark all as read
        </Button>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}
      {!data && !error ? (
        <Skeleton className="h-40" />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Bell} title={unreadOnly ? "Nothing unread" : "No notifications yet"} description="Class reminders, schedule changes and grades appear here." />
      ) : data ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {data.results.map((n) => (
              <li key={n.id} className={cn("flex gap-3 px-4 py-3", !n.read_at && "bg-teal-50/50")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-teal")} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-navy">
                    {n.title}
                    {!n.read_at && <span className="sr-only"> (unread)</span>}
                  </p>
                  {n.body && <p className="text-sm text-muted">{n.body}</p>}
                  <p className="mt-1 text-xs text-muted">{formatDateTime(n.created_at)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                  {n.link && (
                    <Link href={n.link} onClick={() => !n.read_at && void markRead([n.id])} className="font-medium text-teal-700 hover:underline">
                      Open
                    </Link>
                  )}
                  {!n.read_at && (
                    <button type="button" onClick={() => markRead([n.id])} className="text-xs text-muted hover:text-navy">
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pager data={data} onPage={setPage} />
        </Card>
      ) : null}
    </div>
  );
}
