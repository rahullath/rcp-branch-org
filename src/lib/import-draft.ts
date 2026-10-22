"use client";

import { useSyncExternalStore } from "react";

/* Text pasted on the main Import page that turned out to be plain notes: handed to the page that reads that kind of notes. */

export type DraftKind = "contacts" | "actions";
const key = (k: DraftKind) => `import-draft:${k}`;
const noop = () => () => {};

export function stashImportDraft(kind: DraftKind, text: string) {
  try {
    sessionStorage.setItem(key(kind), text);
  } catch {
    /* storage blocked: the other page just starts empty */
  }
}

export function clearImportDraft(kind: DraftKind) {
  try {
    sessionStorage.removeItem(key(kind));
  } catch {
    /* nothing to clear */
  }
}

/** The stashed text for this page, "" on the server and when there is none. */
export function useImportDraft(kind: DraftKind): string {
  return useSyncExternalStore(
    noop,
    () => {
      try {
        return sessionStorage.getItem(key(kind)) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
}
