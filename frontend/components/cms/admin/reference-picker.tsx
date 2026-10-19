"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounced } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { ReferenceOption } from "@/types/cms-admin";

type Props = {
  id: string;
  reference: string;
  multiple: boolean;
  max?: number;
  value: number[];
  onChange: (ids: number[]) => void;
  invalid?: boolean;
};

/**
 * Picks records owned by another app (courses, categories) for a page section.
 * Options come from /admin/cms/references/{type}/; the backend re-validates
 * every id on save and only shows published records to visitors.
 */
export function ReferencePicker({ id, reference, multiple, max, value, onChange, invalid }: Props) {
  const [labels, setLabels] = useState<Record<number, ReferenceOption>>({});
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<ReferenceOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const q = useDebounced(search);
  const missing = value.filter((v) => !labels[v]);
  const missingKey = missing.join(",");

  // Label the stored selection (it may include records the search would not list, e.g. archived ones).
  useEffect(() => {
    if (!missingKey) return;
    const controller = new AbortController();
    api
      .get<ReferenceOption[]>(`/admin/cms/references/${reference}/`, { query: { ids: missingKey }, signal: controller.signal })
      .then((found) => setLabels((prev) => ({ ...prev, ...Object.fromEntries(found.map((o) => [o.id, o])) })))
      .catch(() => undefined);
    return () => controller.abort();
  }, [reference, missingKey]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<ReferenceOption[]>(`/admin/cms/references/${reference}/`, { query: { search: q }, signal: controller.signal })
      .then((found) => {
        setOptions(found);
        setError(null);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      });
    return () => controller.abort();
  }, [reference, q]);

  function choose(option: ReferenceOption) {
    setLabels((prev) => ({ ...prev, [option.id]: option }));
    onChange(multiple ? [...value, option.id] : [option.id]);
  }

  function move(from: number, to: number) {
    const next = [...value];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  const full = multiple ? max !== undefined && value.length >= max : false;
  const available = options.filter((o) => !value.includes(o.id));

  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border border-line bg-white p-3", invalid && "border-danger")}>
      {value.length > 0 ? (
        <ol className="flex flex-col gap-1.5">
          {value.map((itemId, i) => {
            const option = labels[itemId];
            return (
              <li key={itemId} className="flex items-center gap-2 rounded-md bg-page px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-navy">{option?.label ?? `#${itemId}`}</span>
                  {option?.description && <span className="ml-2 text-xs text-muted">{option.description}</span>}
                </span>
                {multiple && (
                  <>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${option?.label ?? itemId} up`}>
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === value.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${option?.label ?? itemId} down`}>
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-danger"
                  onClick={() => onChange(value.filter((v) => v !== itemId))}
                  aria-label={`Remove ${option?.label ?? itemId}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted">Nothing selected.</p>
      )}

      {!full && (
        <div className="flex flex-col gap-2">
          <Input
            id={id}
            type="search"
            value={search}
            placeholder={multiple || value.length === 0 ? "Search to add…" : "Search to replace…"}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search options"
          />
          {error ? (
            <p className="text-xs text-danger">{error}</p>
          ) : available.length === 0 ? (
            <p className="text-xs text-muted">{q ? "No matches." : "No more options."}</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto rounded-md border border-line">
              {available.map((option) => (
                <li key={option.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => choose(option)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-teal-50 focus-visible:bg-teal-50 focus-visible:outline-none"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                    <span className="flex-1">{option.label}</span>
                    {option.description && <span className="text-xs text-muted">{option.description}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {multiple && max !== undefined && <p className="text-xs text-muted">{value.length} of {max} selected</p>}
    </div>
  );
}
