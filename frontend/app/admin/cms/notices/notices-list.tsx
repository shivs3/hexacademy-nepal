"use client";

import { FileText, ImageIcon, Megaphone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LoadError, Pager, SearchBox, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Checkbox } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { AdminNotice } from "@/types/cms-admin";

import { NoticeStatus } from "./notice-status";

export function NoticesList() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<number | null>(null);
  const q = useDebounced(search);
  const { data, error, reload, setData } = useApiResource<Paginated<AdminNotice>>("/admin/cms/notices/", { search: q, page });

  async function toggle(notice: AdminNotice, field: "is_active" | "show_in_popup", value: boolean) {
    setBusy(notice.id);
    try {
      const saved = await api.patch<AdminNotice>(`/admin/cms/notices/${notice.id}/`, { [field]: value });
      setData((d) => (d ? { ...d, results: d.results.map((n) => (n.id === saved.id ? saved : n)) } : d));
      toast.success(
        field === "is_active"
          ? `“${saved.title}” is ${value ? "switched on" : "switched off"}.`
          : `“${saved.title}” ${value ? "will" : "won’t"} appear in the pop-up.`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SearchBox
        value={search}
        onChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        label="Search notices"
        placeholder="Search title or message"
      />

      {error && <LoadError message={error} onRetry={reload} />}

      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={q ? "No notices match your search" : "No notices yet"}
          description={q ? undefined : "Create a notice to show it in a pop-up on the website."}
        />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Notice</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>Active</th>
                  <th scope="col" className={th}>Pop-up</th>
                  <th scope="col" className={th}>Order</th>
                  <th scope="col" className={th}>Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((n) => (
                  <tr key={n.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <NoticeThumb notice={n} />
                        <div className="min-w-0">
                          <Link href={`/admin/cms/notices/${n.id}`} className="font-medium text-navy hover:text-teal-700 hover:underline">
                            {n.title}
                          </Link>
                          {n.summary && <p className="line-clamp-2 text-xs text-muted">{n.summary}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <NoticeStatus notice={n} />
                    </td>
                    <td className="px-4 py-3">
                      <Checkbox
                        aria-label={`Show “${n.title}” on the site`}
                        checked={n.is_active}
                        disabled={busy === n.id}
                        onChange={(e) => toggle(n, "is_active", e.target.checked)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Checkbox
                        aria-label={`Show “${n.title}” in the pop-up`}
                        checked={n.show_in_popup}
                        disabled={busy === n.id}
                        onChange={(e) => toggle(n, "show_in_popup", e.target.checked)}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{n.position}</td>
                    <td className="px-4 py-3 text-xs text-muted">{formatDateTime(n.updated_at)}</td>
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

function NoticeThumb({ notice }: { notice: AdminNotice }) {
  const src = notice.pages[0]?.url ?? (notice.attachment_detail?.kind === "image" ? notice.attachment_detail.url : null);
  return (
    <span className="flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-page">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
        <img src={src} alt="" className="h-full w-full object-cover object-top" />
      ) : notice.attachment_detail ? (
        <FileText className="h-4 w-4 text-muted" aria-hidden="true" />
      ) : (
        <ImageIcon className="h-4 w-4 text-line" aria-hidden="true" />
      )}
    </span>
  );
}
