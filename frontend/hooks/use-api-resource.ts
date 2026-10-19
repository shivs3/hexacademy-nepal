"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";

type Query = Record<string, string | number | boolean | undefined | null>;

/**
 * GET a resource from the browser and keep it in state. Refetches when the
 * path or query changes; stale responses are aborted. `setData` lets callers
 * apply the result of a mutation without a refetch.
 */
export function useApiResource<T>(path: string | null, query?: Query) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const queryKey = JSON.stringify(query ?? {});

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api
      .get<T>(path, { query: JSON.parse(queryKey) as Query, signal: controller.signal })
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      });
    return () => controller.abort();
  }, [path, queryKey, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { data, error, reload, setData };
}

/** Debounce a fast-changing value such as a search box. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
