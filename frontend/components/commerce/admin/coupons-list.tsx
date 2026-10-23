"use client";

import { MoreHorizontal, Plus, TicketPercent } from "lucide-react";
import { useState } from "react";

import { LoadError, Pager, SearchBox, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Checkbox, Label } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatPrice } from "@/lib/catalog";
import { formatDateTime } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { Coupon } from "@/types/commerce";

import { CouponDialog } from "./coupon-dialog";

export function couponValue(c: Pick<Coupon, "kind" | "value" | "max_discount">): string {
  if (c.kind === "fixed") return `${formatPrice(c.value)} off`;
  const pct = c.value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return `${pct}% off${c.max_discount ? ` (up to ${formatPrice(c.max_discount)})` : ""}`;
}

function availability(c: Coupon): { label: string; tone: "success" | "neutral" | "warning" } {
  const now = Date.now();
  if (!c.is_active) return { label: "Inactive", tone: "neutral" };
  if (c.ends_at && new Date(c.ends_at).getTime() <= now) return { label: "Ended", tone: "neutral" };
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: "Scheduled", tone: "warning" };
  if (c.max_redemptions !== null && c.redemption_count >= c.max_redemptions) return { label: "Used up", tone: "neutral" };
  return { label: "Active", tone: "success" };
}

export function CouponsList() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const [deleting, setDeleting] = useState<Coupon | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<Coupon>>("/admin/commerce/coupons/", {
    search: q,
    active: activeOnly ? "true" : undefined,
    page,
  });
  const filtered = Boolean(q || activeOnly);

  async function toggle(c: Coupon) {
    try {
      await api.patch(`/admin/commerce/coupons/${c.id}/`, { is_active: !c.is_active });
      toast.success(c.is_active ? `${c.code} deactivated.` : `${c.code} activated.`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/admin/commerce/coupons/${deleting.id}/`);
      toast.success(`${deleting.code} deleted.`);
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search coupons"
          placeholder="Code or description"
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="coupons-active"
            checked={activeOnly}
            onChange={(e) => {
              setActiveOnly(e.target.checked);
              setPage(1);
            }}
          />
          <Label htmlFor="coupons-active" className="font-normal">
            Active only
          </Label>
        </div>
        <Button onClick={() => setEditing("new")} className="sm:ml-auto">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New coupon
        </Button>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={TicketPercent}
          title={filtered ? "No coupons match" : "No coupons yet"}
          description={filtered ? undefined : "Create a code for a promotion, a partner or a scholarship."}
        />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[50rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>Code</th>
                  <th scope="col" className={th}>Discount</th>
                  <th scope="col" className={th}>Applies to</th>
                  <th scope="col" className={`${th} text-right`}>Used</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((c) => {
                  const state = availability(c);
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setEditing(c)} className="font-mono font-medium text-navy hover:text-teal-700">
                          {c.code}
                        </button>
                        {c.description && <p className="max-w-xs truncate text-xs text-muted">{c.description}</p>}
                      </td>
                      <td className="px-4 py-3">{couponValue(c)}</td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {c.course_details.length ? c.course_details.map((d) => d.title).join(", ") : "All paid courses"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {c.redemption_count}
                        {c.max_redemptions !== null && ` / ${c.max_redemptions}`}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={state.tone}>{state.label}</Badge>
                        {c.ends_at && <p className="mt-1 text-xs text-muted">until {formatDateTime(c.ends_at)}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Menu
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${c.code}`}>
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          }
                        >
                          <MenuItem onSelect={() => setEditing(c)}>Edit</MenuItem>
                          <MenuItem onSelect={() => toggle(c)}>{c.is_active ? "Deactivate" : "Activate"}</MenuItem>
                          <MenuItem danger disabled={c.redemption_count > 0} onSelect={() => setDeleting(c)}>
                            Delete
                          </MenuItem>
                        </Menu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager data={data} onPage={setPage} />
        </Card>
      ) : null}

      {editing && (
        <CouponDialog
          coupon={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, created) => {
            setEditing(null);
            toast.success(created ? `${saved.code} created.` : `${saved.code} saved.`);
            reload();
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.code ?? "coupon"}?`}
        description="Only unused coupons can be deleted. Deactivate a used coupon instead."
        confirmLabel="Delete"
        tone="danger"
        loading={busy}
        onConfirm={remove}
      />
    </div>
  );
}
