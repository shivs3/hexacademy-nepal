"use client";

import { CheckCircle2, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert, Badge, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatPrice } from "@/lib/catalog";
import type { AccessOption, AccessOptions, AccessPerson, AssignAccessResult } from "@/types/access";

const MAX_PEOPLE = 100;

/** "3 people", "1 course" */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Give one or more people any number of courses and exams in one step.
 * The backend checks the permission, grants everything in one transaction and
 * records each grant in the audit log; already-held items are left as they are.
 */
export function AssignAccess({ initialPerson }: { initialPerson?: AccessPerson | null }) {
  const toast = useToast();
  const options = useApiResource<AccessOptions>("/admin/access/options/");
  const [people, setPeople] = useState<AccessPerson[]>(initialPerson ? [initialPerson] : []);
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const found = useApiResource<AccessPerson[]>(term.length >= 2 ? "/admin/access/people/" : null, { search: term });
  const [courses, setCourses] = useState<Set<number>>(new Set());
  const [exams, setExams] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssignAccessResult | null>(null);

  const chosen = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const itemCount = courses.size + exams.size;
  const ready = people.length > 0 && itemCount > 0;

  const addPerson = (p: AccessPerson) => {
    if (chosen.has(p.id) || people.length >= MAX_PEOPLE) return;
    setPeople((list) => [...list, p]);
    setResult(null);
  };

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<AssignAccessResult>("/admin/access/assign/", {
        users: people.map((p) => p.id),
        courses: [...courses],
        exams: [...exams],
      });
      setResult(res);
      toast.success(res.added ? `Added ${plural(res.added, "item")}.` : "Everyone already had these.");
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setError(Object.values(fields)[0] ?? errorMessage(err));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const summary = `${plural(itemCount, "item")} to ${plural(people.length, "person", "people")}`;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>1. People</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <label htmlFor="assign-search" className="sr-only">
            Find people by name, email or phone
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input
              id="assign-search"
              type="search"
              className="pl-9"
              placeholder="Name, email or phone (at least 2 characters)"
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {term.length >= 2 && (
            <div aria-live="polite">
              {found.error ? (
                <Alert tone="danger">{found.error}</Alert>
              ) : !found.data ? (
                <Skeleton className="h-10" />
              ) : found.data.length === 0 ? (
                <p className="text-sm text-muted">No active account matches “{term}”.</p>
              ) : (
                <ul className="divide-y divide-line rounded-[var(--radius-control)] border border-line">
                  {found.data.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-navy">{p.full_name || p.email}</span>
                        <span className="block truncate text-xs text-muted">{p.email}</span>
                      </span>
                      {chosen.has(p.id) ? (
                        <Badge tone="success">Added</Badge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => addPerson(p)} disabled={people.length >= MAX_PEOPLE}>
                          Add
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {people.length === 0 ? (
            <p className="text-sm text-muted">Nobody chosen yet. Search above and add one or more people.</p>
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium text-navy">{plural(people.length, "person", "people")} chosen</p>
              <ul className="flex flex-wrap gap-2">
                {people.map((p) => (
                  <li key={p.id} className="flex items-center gap-1 rounded-full border border-line bg-white py-1 pl-3 pr-1 text-sm">
                    <span title={p.email}>{p.full_name || p.email}</span>
                    <button
                      type="button"
                      className="rounded-full p-1 text-muted hover:bg-page hover:text-danger focus-visible:outline-2 focus-visible:outline-teal"
                      aria-label={`Remove ${p.full_name || p.email}`}
                      onClick={() => {
                        setPeople((list) => list.filter((x) => x.id !== p.id));
                        setResult(null);
                      }}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <ItemPicker
          title="2. Courses"
          empty="No published courses yet."
          items={options.data?.courses}
          error={options.error}
          selected={courses}
          onChange={(s) => {
            setCourses(s);
            setResult(null);
          }}
        />
        <ItemPicker
          title="3. Exams"
          empty="No published exams yet."
          hint="Any published exam, including exams that normally come with a course."
          items={options.data?.exams}
          error={options.error}
          selected={exams}
          onChange={(s) => {
            setExams(s);
            setResult(null);
          }}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-body">{ready ? `Ready to give ${summary}.` : "Choose at least one person and one course or exam."}</p>
        <Button disabled={!ready} onClick={() => setConfirming(true)}>
          Assign access
        </Button>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {result && <AssignSummary result={result} />}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Assign access?"
        description={`This gives ${summary}, without payment. They can start using everything straight away. You can remove items later from each person's access page.`}
        confirmLabel="Assign access"
        loading={busy}
        onConfirm={() => void run()}
      />
    </div>
  );
}

function ItemPicker({
  title,
  hint,
  empty,
  items,
  error,
  selected,
  onChange,
}: {
  title: string;
  hint?: string;
  empty: string;
  items: AccessOption[] | undefined;
  error: string | null;
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (items ?? []).filter((i) => !f || `${i.title} ${i.detail}`.toLowerCase().includes(f));
  }, [items, filter]);
  const toggle = (id: number, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onChange(next);
  };
  const id = title.replace(/\W+/g, "-").toLowerCase();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {selected.size > 0 && (
          <button type="button" className="text-sm text-teal-700 hover:underline" onClick={() => onChange(new Set())}>
            Clear ({selected.size})
          </button>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        {hint && <p className="text-sm text-muted">{hint}</p>}
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : !items ? (
          <Skeleton className="h-32" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">{empty}</p>
        ) : (
          <>
            {items.length > 6 && (
              <>
                <label htmlFor={`${id}-filter`} className="sr-only">
                  Filter {title}
                </label>
                <Input id={`${id}-filter`} type="search" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </>
            )}
            <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-[var(--radius-control)] border border-line">
              {shown.map((item) => (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-page">
                    <Checkbox className="mt-0.5" checked={selected.has(item.id)} onChange={(e) => toggle(item.id, e.target.checked)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-navy">{item.title}</span>
                      <span className="block text-xs text-muted">{item.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{Number(item.price) > 0 ? formatPrice(item.price) : "Free"}</span>
                  </label>
                </li>
              ))}
              {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nothing matches “{filter}”.</li>}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export function AssignSummary({ result }: { result: AssignAccessResult }) {
  const byPerson = new Map<number, { name: string; added: string[]; had: string[] }>();
  for (const r of result.results) {
    const row = byPerson.get(r.user) ?? { name: r.user_name, added: [], had: [] };
    (r.added ? row.added : row.had).push(r.title);
    byPerson.set(r.user, row);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
          Done: {plural(result.added, "item")} added
          {result.already_had > 0 && `, ${result.already_had} already held`}
        </CardTitle>
      </CardHeader>
      <ul className="divide-y divide-line">
        {[...byPerson.entries()].map(([userId, row]) => (
          <li key={userId} className="flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
            <Link href={`/admin/users/${userId}`} className="font-medium text-teal-700 hover:underline">
              {row.name}
            </Link>
            <span className="text-muted sm:text-right">
              {row.added.length > 0 && <span className="block text-body">Added: {row.added.join(", ")}</span>}
              {row.had.length > 0 && <span className="block">Already had: {row.had.join(", ")}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
