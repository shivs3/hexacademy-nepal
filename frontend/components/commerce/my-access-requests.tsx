"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatPrice } from "@/lib/catalog";
import { ACCESS_REQUEST_STATUS } from "@/lib/commerce";
import { formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { MyAccessRequest } from "@/types/access";

function itemHref(r: MyAccessRequest): string | null {
  if (!r.item_slug) return null;
  const slug = encodeURIComponent(r.item_slug);
  if (r.kind === "exam") return `/dashboard/exams/${slug}`;
  return r.status === "approved" ? `/learn/${slug}` : `/courses/${slug}`;
}

export function MyAccessRequests() {
  const { data, error, setData } = useApiResource<Paginated<MyAccessRequest>>("/me/access-requests/");
  const [cancelling, setCancelling] = useState<MyAccessRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function cancel() {
    if (!cancelling || !data) return;
    setBusy(true);
    try {
      const updated = await api.post<MyAccessRequest>(`/me/access-requests/${encodeURIComponent(cancelling.number)}/cancel/`);
      setData({ ...data, results: data.results.map((r) => (r.number === updated.number ? updated : r)) });
      toast.success("Request cancelled.");
      setCancelling(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (data.results.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No requests yet"
        description="When you request a paid course or exam, it appears here with its status."
        action={
          <Button asChild variant="outline">
            <Link href="/courses">Browse courses</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {data.results.map((r) => {
          const status = ACCESS_REQUEST_STATUS[r.status];
          const href = itemHref(r);
          return (
            <li key={r.number} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-navy">
                    {href ? (
                      <Link href={href} className="hover:text-teal-700 hover:underline">
                        {r.item_title}
                      </Link>
                    ) : (
                      r.item_title
                    )}
                  </p>
                  <p className="text-sm text-muted">
                    {r.kind === "course" ? "Course" : "Exam"} · {r.number} · {formatDateTime(r.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <span className="font-semibold tabular-nums text-navy">{formatPrice(r.price)}</span>
                </div>
              </div>
              {r.staff_note && (
                <p className="rounded-lg bg-page px-3 py-2 text-sm text-body">
                  <span className="font-medium text-navy">Note from our team: </span>
                  {r.staff_note}
                </p>
              )}
              {(r.status === "pending" || (r.status === "approved" && href)) && (
                <div className="flex flex-wrap gap-2">
                  {r.status === "approved" && href && (
                    <Button asChild size="sm">
                      <Link href={href}>{r.kind === "course" ? "Start learning" : "Open exam"}</Link>
                    </Button>
                  )}
                  {r.status === "pending" && (
                    <Button size="sm" variant="outline" onClick={() => setCancelling(r)}>
                      Cancel request
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancel this request?"
        description={cancelling ? `We'll stop reviewing your request for ${cancelling.item_title}. You can send a new one later.` : ""}
        confirmLabel="Cancel request"
        tone="danger"
        loading={busy}
        onConfirm={cancel}
      />
    </>
  );
}
