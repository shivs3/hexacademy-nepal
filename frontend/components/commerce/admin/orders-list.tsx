"use client";

import { Receipt } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LoadError, Pager, SearchBox, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/input";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { formatPrice } from "@/lib/catalog";
import { ORDER_STATUS, compareMoney } from "@/lib/commerce";
import { formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { AdminOrder } from "@/types/commerce";

const PROVIDERS = [
  ["khalti", "Khalti"],
  ["esewa", "eSewa"],
  ["bank_transfer", "Bank transfer"],
  ["sandbox", "Test gateway"],
] as const;

const QUEUES = [
  ["", "All orders"],
  ["awaiting_transfer_review", "Transfers to review"],
  ["needs_review", "Flagged for review"],
] as const;

export function OrdersList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [queue, setQueue] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<AdminOrder>>("/admin/commerce/orders/", {
    search: q,
    status,
    provider,
    page,
    needs_review: queue === "needs_review" ? "true" : undefined,
    awaiting_transfer_review: queue === "awaiting_transfer_review" ? "true" : undefined,
  });
  const filtered = Boolean(q || status || provider || queue);
  const set = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Order queues">
        {QUEUES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={queue === value}
            onClick={() => set(setQueue)(value)}
            className={
              queue === value
                ? "rounded-full bg-navy px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-full border border-line bg-white px-3 py-1.5 text-sm text-body hover:border-teal/50"
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchBox value={search} onChange={set(setSearch)} label="Search orders" placeholder="Order number, payment reference, name or email" />
        <Select aria-label="Filter by status" value={status} onChange={(e) => set(setStatus)(e.target.value)} className="sm:w-44">
          <option value="">Any status</option>
          {Object.entries(ORDER_STATUS).map(([value, s]) => (
            <option key={value} value={value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by payment method" value={provider} onChange={(e) => set(setProvider)(e.target.value)} className="sm:w-44">
          <option value="">Any method</option>
          {PROVIDERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Receipt} title={filtered ? "No orders match these filters" : "No orders yet"} />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Order</th>
                  <th scope="col" className={th}>Learner</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={`${th} text-right`}>Total</th>
                  <th scope="col" className={th}>Placed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((o) => (
                  <tr key={o.number}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/commerce/orders/${encodeURIComponent(o.number)}`} className="font-medium text-navy hover:text-teal-700">
                        {o.number}
                      </Link>
                      <p className="max-w-xs truncate text-xs text-muted">{o.item_titles.join(", ")}</p>
                    </td>
                    <td className="px-4 py-3">
                      {o.user.full_name}
                      <p className="text-xs text-muted">{o.user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={ORDER_STATUS[o.status].tone}>{o.status_label}</Badge>
                        {o.needs_review && <Badge tone="danger">Review</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatPrice(o.total)}
                      {compareMoney(o.refunded_amount, "0") > 0 && (
                        <p className="text-xs text-muted">− {formatPrice(o.refunded_amount)} refunded</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDateTime(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager data={data} onPage={setPage} />
        </Card>
      ) : null}
    </div>
  );
}
