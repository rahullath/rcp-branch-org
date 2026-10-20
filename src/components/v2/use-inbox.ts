"use client";

import { useEffect } from "react";
import { useData } from "@/lib/hooks";
import type { InboxPayload } from "@/lib/types";

/** The derived inbox, shared by the nav badge, This Week and the Inbox screen. */
export function useInbox() {
  const res = useData<InboxPayload>("/api/inbox");
  const { refresh } = res;
  useEffect(() => {
    // Answered from a notification while the app is open → refresh.
    const onMessage = (e: MessageEvent) => e.data?.type === "answered" && refresh();
    const onFocus = () => document.visibilityState === "visible" && refresh();
    navigator.serviceWorker?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);
  return res;
}
