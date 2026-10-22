"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

/**
 * Module-level stale-while-revalidate cache. Navigating back to a page shows
 * the last data instantly and refreshes it in the background, instead of a
 * spinner on every tab switch. Lives for the lifetime of the tab only.
 */
const cache = new Map<string, unknown>();

const listeners = new Map<string, Set<() => void>>();

/** One request per URL at a time: several components asking for /api/comrades share it. */
const inflight = new Map<string, Promise<unknown>>();
function load<T>(url: string): Promise<T> {
  const running = inflight.get(url);
  if (running) return running as Promise<T>;
  const p = api<T>(url).finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/**
 * Refetch every mounted `useData` for these URLs (and drop their cache for
 * unmounted ones) — e.g. after an RSVP, so the inbox badge agrees.
 */
export function revalidate(...urls: string[]) {
  for (const url of urls) {
    const set = listeners.get(url);
    if (set && set.size > 0) set.forEach((fn) => fn());
    else cache.delete(url);
  }
}

/** Call on logout / user switch so one user's cached data never shows for another. */
export function clearDataCache() {
  cache.clear();
}

type Updater<T> = T | null | ((prev: T | null) => T | null);

export function useData<T>(url: string | null) {
  const cached = url ? (cache.get(url) as T | undefined) : undefined;
  const [data, setDataState] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  // Adjust state when the URL changes (render-phase, per React's guidance).
  const [lastUrl, setLastUrl] = useState(url);
  if (url !== lastUrl) {
    setLastUrl(url);
    const next = url ? (cache.get(url) as T | undefined) : undefined;
    setDataState(next ?? null);
    setLoading(next === undefined && !!url);
  }

  // Background refresh — keeps whatever is on screen, no spinner.
  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  /** Set data locally (optimistic update) and keep the cache in sync. */
  const setData = useCallback(
    (next: Updater<T>) => {
      setDataState((prev) => {
        const value = typeof next === "function" ? (next as (p: T | null) => T | null)(prev) : next;
        if (url && value !== null) cache.set(url, value);
        return value;
      });
    },
    [url],
  );

  useEffect(() => {
    if (!url) return;
    const set = listeners.get(url) ?? new Set();
    set.add(refresh);
    listeners.set(url, set);
    return () => {
      set.delete(refresh);
    };
  }, [url, refresh]);

  useEffect(() => {
    if (!url) return;
    let active = true;
    load<T>(url)
      .then((d) => {
        if (!active) return;
        cache.set(url, d);
        setDataState(d);
        setError("");
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [url, version]);

  return { data, loading, error, refresh, setData };
}
