"use client";

import { useCallback, useMemo, useState } from "react";
import { useData } from "@/lib/hooks";
import { useProfiles } from "@/lib/profiles-context";
import { londonDay } from "@/lib/follow-through";
import { loadHint, workload } from "@/lib/tasks";
import type { AgendaAction, Availability, Event, FollowUp } from "@/lib/types";

/**
 * Everyone's current load, for wherever work is handed out: "3 tasks ·
 * away till 20 Oct" next to a name stops the same reliable person getting
 * everything. Pass `enabled = false` to skip the fetches.
 */
export function useWorkload(enabled = true) {
  const { profiles } = useProfiles();
  const { data: actions } = useData<AgendaAction[]>(enabled ? "/api/agenda-actions" : null);
  const { data: followUps } = useData<FollowUp[]>(enabled ? "/api/follow-ups" : null);
  const { data: events } = useData<Event[]>(enabled ? "/api/events" : null);
  const { data: availability } = useData<Availability[]>(enabled ? "/api/availability" : null);
  const [now] = useState(() => Date.now());
  const today = londonDay(now);
  const load = useMemo(
    () => workload(profiles, { actions: actions ?? [], followUps: followUps ?? [], events: events ?? [], availability: availability ?? [] }, today, now),
    [profiles, actions, followUps, events, availability, today, now],
  );
  const hint = useCallback((id: string) => (actions ? loadHint(load.get(id), today) : ""), [load, today, actions]);
  return { load, hint, today, now, actions, followUps, events, availability };
}
