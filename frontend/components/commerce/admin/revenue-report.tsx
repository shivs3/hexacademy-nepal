"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { LoadError, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { useApiResource } from "@/hooks/use-api-resource";
import { buildPath } from "@/lib/api/client";
import { decimalToMinor, formatPrice } from "@/lib/catalog";
import { formatDate } from "@/lib/utils";
import type { RevenueBreakdown, RevenueReport } from "@/types/commerce";

const AXIS = { fontSize: 12, fill: "var(--color-muted)" };

function nepalToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());
}

function daysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Rupees as a plain number, for chart geometry only; every figure shown as text uses the exact decimal. */
const chartRupees = (amount: string) => (decimalToMinor(amount) ?? 0) / 100;

export function RevenueReportView() {
  const [end, setEnd] = useState(nepalToday);
  const [start, setStart] = useState(() => daysBefore(nepalToday(), 29));
  const [group, setGroup] = useState<"day" | "month">("day");
  const { data, error, reload } = useApiResource<RevenueReport>("/admin/commerce/reports/revenue/", { start, end, group });
  const exportHref = `/api/v1${buildPath("/admin/commerce/orders/export/", { start, end })}`;
  const series = (data?.series ?? []).map((b) => ({
    label: group === "month" ? formatDate(b.period, { month: "short", year: "numeric" }) : formatDate(b.period, { day: "numeric", month: "short" }),
    net: chartRupees(b.net),
    netText: formatPrice(b.net),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="From" htmlFor="rev-start">
          <Input type="date" value={start} max={end} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="rev-end">
          <Input type="date" value={end} min={start} onChange={(e) => e.target.value && setEnd(e.target.value)} />
        </Field>
        <Field label="Group by" htmlFor="rev-group">
          <Select value={group} onChange={(e) => setGroup(e.target.value === "month" ? "month" : "day")}>
            <option value="day">Day</option>
            <option value="month">Month</option>
          </Select>
        </Field>
        <Button asChild variant="outline" className="sm:ml-auto">
          <a href={exportHref} download>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export orders (CSV)
          </a>
        </Button>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {data && (data.needs_review > 0 || data.transfers_awaiting_review > 0) && (
        <Alert tone="warning" title="Waiting for finance">
          {data.transfers_awaiting_review > 0 && (
            <Link href="/admin/commerce/orders" className="mr-4 font-medium underline">
              {data.transfers_awaiting_review} bank transfer{data.transfers_awaiting_review === 1 ? "" : "s"} to review
            </Link>
          )}
          {data.needs_review > 0 && <span>{data.needs_review} order{data.needs_review === 1 ? "" : "s"} flagged for review</span>}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Paid orders" value={data ? String(data.orders) : null} />
        <Stat label="Gross" value={data ? formatPrice(data.gross) : null} />
        <Stat label="Refunds" value={data ? formatPrice(data.refunds) : null} />
        <Stat label="Net" value={data ? formatPrice(data.net) : null} strong />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Net revenue</CardTitle>
        </CardHeader>
        <CardBody>
          {!data ? (
            <Skeleton className="h-64 w-full" />
          ) : series.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No verified payments in this period.</p>
          ) : (
            <div className="h-64" role="img" aria-label={`Net revenue: ${series.map((s) => `${s.label} ${s.netText}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ left: 0, right: 8, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-line)" />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} />
                  <Tooltip formatter={(_v, _n, item) => [(item.payload as { netText: string }).netText, "Net"]} />
                  <Bar dataKey="net" fill="var(--color-teal)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Breakdown title="By payment method" rows={data?.by_provider} />
        <Breakdown title="By course" rows={data?.by_course} />
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string | null; strong?: boolean }) {
  return (
    <Card>
      <CardBody>
        <p className="text-sm text-muted">{label}</p>
        {value === null ? (
          <Skeleton className="mt-1 h-7 w-24" />
        ) : (
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${strong ? "text-teal-700" : "text-navy"}`}>{value}</p>
        )}
      </CardBody>
    </Card>
  );
}

function Breakdown({ title, rows }: { title: string; rows: RevenueBreakdown[] | undefined }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {!rows ? (
        <CardBody>
          <Skeleton className="h-24 w-full" />
        </CardBody>
      ) : rows.length === 0 ? (
        <CardBody>
          <p className="text-sm text-muted">Nothing in this period.</p>
        </CardBody>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={th}>Name</th>
                <th scope="col" className={`${th} text-right`}>Orders</th>
                <th scope="col" className={`${th} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="px-4 py-2">{r.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.orders}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatPrice(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
