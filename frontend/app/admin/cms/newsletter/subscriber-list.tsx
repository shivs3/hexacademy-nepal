"use client";

import { Download, Mail } from "lucide-react";
import { useState } from "react";

import { LoadError, Pager, SearchBox, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/input";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { buildPath } from "@/lib/api/client";
import { formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { NewsletterSubscriber } from "@/types/cms-admin";

export function SubscriberList() {
  const [search, setSearch] = useState("");
  const [state, setState] = useState("active");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<NewsletterSubscriber>>("/admin/cms/newsletter/", { search: q, state, page });
  // A plain link so the browser handles the download with the session cookie.
  const exportHref = `/api/v1${buildPath("/admin/cms/newsletter/export/", { search: q })}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search subscribers"
          placeholder="Search email"
        />
        <Select
          aria-label="Filter by subscription state"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
          className="sm:w-44"
        >
          <option value="active">Subscribed</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="">Everyone</option>
        </Select>
        <a href={exportHref} className={buttonVariants({ variant: "outline" })} download>
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </a>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={Mail}
          title={q || state !== "active" ? "No subscribers match these filters" : "No subscribers yet"}
          description={q || state !== "active" ? undefined : "Add a newsletter section to a page so visitors can sign up."}
        />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Email</th>
                  <th scope="col" className={th}>Source</th>
                  <th scope="col" className={th}>Signed up</th>
                  <th scope="col" className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-medium text-navy">{s.email}</td>
                    <td className="px-4 py-3 text-xs text-muted">{s.source || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDateTime(s.consented_at)}</td>
                    <td className="px-4 py-3">
                      {s.unsubscribed_at ? (
                        <Badge tone="neutral">Unsubscribed {formatDateTime(s.unsubscribed_at)}</Badge>
                      ) : (
                        <Badge tone="success">Subscribed</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-2 text-xs text-muted">{data.count} total</p>
          <Pager data={data} onPage={setPage} />
        </Card>
      ) : null}
    </div>
  );
}
