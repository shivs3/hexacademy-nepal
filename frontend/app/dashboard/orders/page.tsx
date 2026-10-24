import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { serverGet } from "@/lib/api/server";
import { formatPrice } from "@/lib/catalog";
import { ORDER_STATUS, transferUnderReview } from "@/lib/commerce";
import { formatDate } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { MyOrder } from "@/types/commerce";

export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 20;

export default async function MyOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const raw = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Number.isFinite(raw) && raw > 0 ? raw : 1;
  const orders = await serverGet<Paginated<MyOrder>>("/me/orders/", { page, page_size: PAGE_SIZE }).catch((err: { status?: number }) => {
    if (err.status === 404) return null;
    throw err;
  });

  return (
    <>
      <PageHeader title="Orders" description="Your purchases, payments and receipts." />
      {!orders || orders.results.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={page > 1 ? "No more orders" : "No orders yet"}
          description="When you buy a course, the order and its receipt appear here."
          action={
            <Button asChild variant="outline">
              <Link href={page > 1 ? "/dashboard/orders" : "/courses"}>{page > 1 ? "Back to first page" : "Browse courses"}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {orders.results.map((order) => {
              const status = ORDER_STATUS[order.status];
              const reviewing = order.status === "pending" && transferUnderReview(order);
              return (
                <li key={order.number}>
                  <Link
                    href={`/dashboard/orders/${encodeURIComponent(order.number)}`}
                    className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-white p-4 transition-colors hover:border-teal/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-navy">{order.items.map((i) => i.title).join(", ")}</span>
                      <span className="text-sm text-muted">
                        {order.number} · {formatDate(order.created_at)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <Badge tone={reviewing ? "teal" : status.tone}>{reviewing ? "Transfer under review" : status.label}</Badge>
                      <span className="font-semibold tabular-nums text-navy">{formatPrice(order.total)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {orders.total_pages > 1 && (
            <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-4 text-sm">
              {page > 1 ? (
                <Link href={`/dashboard/orders?page=${page - 1}`} className="font-medium text-teal-700 hover:underline">
                  ← Previous
                </Link>
              ) : (
                <span aria-disabled="true" className="cursor-default text-muted">← Previous</span>
              )}
              <span className="text-muted">
                Page {orders.page} of {orders.total_pages}
              </span>
              {orders.next ? (
                <Link href={`/dashboard/orders?page=${page + 1}`} className="font-medium text-teal-700 hover:underline">
                  Next →
                </Link>
              ) : (
                <span aria-disabled="true" className="cursor-default text-muted">Next →</span>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
