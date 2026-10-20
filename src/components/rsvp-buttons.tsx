"use client";

import { useCallback, useMemo } from "react";
import { post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import type { Rsvp } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui";

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

const OPTIONS: { value: Rsvp["status"]; label: string; icon: string }[] = [
  { value: "going", label: "Going", icon: "check" },
  { value: "maybe", label: "Maybe", icon: "remove" },
  { value: "no", label: "Can't", icon: "close" },
];

export function RsvpButtons({
  mine,
  onChange,
  compact,
}: {
  mine?: Rsvp | undefined;
  onChange: (s: Rsvp["status"]) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="RSVP">
      {OPTIONS.map((o) => {
        const active = mine?.status === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            aria-label={o.label}
            className={cn(
              "flex items-center justify-center gap-1 rounded-none border text-xs font-bold uppercase tracking-wider transition active-press",
              compact ? "h-10 w-10" : "h-10 min-w-[4.5rem] px-3",
              active
                ? "border-primary bg-primary text-on-primary"
                : "border-paper-shadow bg-surface-container-lowest text-on-surface-variant hover:border-primary",
            )}
          >
            <Icon name={o.icon} className="text-sm" />
            {!compact && o.label}
          </button>
        );
      })}
    </div>
  );
}
