"use client";

import { useCallback, useMemo } from "react";
import { post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import type { Rsvp } from "@/lib/types";

/**
 * One RSVP source of truth for every page. Tapping a button updates the UI
 * immediately (and the shared cache, so other pages agree) and syncs in the
 * background — it only rolls back, with the server's answer, if the call fails.
 */
export function useRsvps() {
  const actor = useActor();
  const { data, setData, refresh } = useData<Rsvp[]>("/api/rsvps");
  const rsvps = useMemo(() => data ?? [], [data]);

  const mine = useCallback(
    (eventId: string) => rsvps.find((r) => r.event_id === eventId && r.user_id === actor?.id),
    [rsvps, actor?.id],
  );

  const respond = useCallback(
    async (eventId: string, status: Rsvp["status"]) => {
      if (!actor) return;
      const before = data ?? [];
      const current = before.find((r) => r.event_id === eventId && r.user_id === actor.id);
      // Tapping the active answer again clears it — a one-tap undo.
      const next = current?.status === status ? null : status;
      setData([
        ...before.filter((r) => !(r.event_id === eventId && r.user_id === actor.id)),
        ...(next ? [{ event_id: eventId, user_id: actor.id, status: next, name: actor.name }] : []),
      ]);
      try {
        await post(`/api/events/${eventId}/rsvp`, { status: next });
        revalidate("/api/inbox");
      } catch {
        refresh();
      }
    },
    [actor, data, setData, refresh],
  );

  const goingCount = useCallback(
    (eventId: string) => rsvps.filter((r) => r.event_id === eventId && r.status === "going").length,
    [rsvps],
  );

  return { rsvps, mine, respond, goingCount };
}
