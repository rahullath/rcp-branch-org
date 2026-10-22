"use client";

import { useData } from "./hooks";
import type { Festival } from "./types";

/** The current festival from the database (null while loading, or when none is set up). */
export function useFestival() {
  const { data, loading } = useData<Festival | null>("/api/festival-config");
  return { festival: data ?? null, loading };
}
