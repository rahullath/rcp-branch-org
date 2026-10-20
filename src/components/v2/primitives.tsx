"use client";

import { Check, ChevronRight, Minus, X } from "lucide-react";
import { useCallback } from "react";
import { useActor } from "@/lib/actor-context";
import { useProfiles } from "@/lib/profiles-context";
import type { Rsvp as RsvpRow } from "@/lib/types";
import { initials } from "@/lib/utils";

export const RSVP_LABEL: Record<RsvpRow["status"], string> = { going: "Going", maybe: "Maybe", no: "Can't" };

/** Going / Maybe / Can't as one segmented control. Tapping the active one clears it. */
export function Rsvp({ value, onChange }: { value?: RsvpRow["status"] | null; onChange: (v: RsvpRow["status"]) => void }) {
  const opts: [RsvpRow["status"], string, typeof Check][] = [
    ["going", "Going", Check],
    ["maybe", "Maybe", Minus],
    ["no", "Can't", X],
  ];
  return (
    <div className="seg" role="group" aria-label="RSVP">
      {opts.map(([v, label, Glyph]) => (
        <button
          key={v}
          type="button"
          className={"seg-b" + (value === v ? " on" : "")}
          aria-pressed={value === v}
          onClick={(e) => {
            e.stopPropagation();
            onChange(v);
          }}
        >
          <Glyph size={14} strokeWidth={2.25} />
          {label}
        </button>
      ))}
    </div>
  );
}

/** The small "Going" / "Reply" tag on the right of event rows. */
export function StateTag({ status }: { status?: RsvpRow["status"] | null }) {
  return <span className={"state " + (status ?? "")}>{status ? RSVP_LABEL[status] : "Reply"}</span>;
}

export function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="sh">
      <h2>{title}</h2>
      {action && (
        <button type="button" className="link" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

export function Chev() {
  return <ChevronRight className="chev" size={18} strokeWidth={2.25} />;
}

/** Name helpers: "You" for the signed-in comrade, first names otherwise. */
export function usePeople() {
  const actor = useActor();
  const { profiles } = useProfiles();
  const full = useCallback((id?: string | null) => profiles.find((p) => p.id === id)?.name ?? null, [profiles]);
  const name = useCallback(
    (id?: string | null) => {
      if (!id) return "—";
      if (id === actor?.id) return "You";
      const n = full(id);
      return n ? n.replace(/^Comrade\s+/i, "").split(/\s+/)[0] : "A comrade";
    },
    [actor?.id, full],
  );
  /** Same as `name`, but "you" for mid-sentence use ("With you"). */
  const nameIn = useCallback((id?: string | null) => (id && id === actor?.id ? "you" : name(id)), [actor?.id, name]);
  const ini = useCallback((id?: string | null) => profiles.find((p) => p.id === id)?.initials || initials(full(id) ?? "?"), [profiles, full]);
  return { me: actor?.id ?? null, name, nameIn, full, ini, profiles };
}

export function Av({ id, className }: { id?: string | null; className?: string }) {
  const { ini } = usePeople();
  return <span className={"av" + (className ? " " + className : "")}>{ini(id)}</span>;
}

/*
 * Date pieces the screens print ("Sat 3 Oct", "18:30"). Assembled from parts
 * and pinned to UK time so the server render and the browser agree exactly
 * (Node and browsers punctuate toLocaleDateString differently).
 */
const TZ = "Europe/London";
const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
function parts(iso: string) {
  const out: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(new Date(iso))) out[p.type] = p.value;
  return out;
}
export function fmtDay(iso: string) {
  const p = parts(iso);
  return `${p.weekday} ${p.day} ${p.month}`;
}
export function fmtTime(iso?: string | null) {
  if (!iso) return "";
  const p = parts(iso);
  return `${p.hour}:${p.minute}`;
}
export function fmtWeekday(iso: string) {
  return parts(iso).weekday;
}
export function fmtDayNum(iso: string) {
  return parts(iso).day.padStart(2, "0");
}
export function fmtMonth(iso: string) {
  return parts(iso).month;
}
export function firstPart(text: string, sep = ",") {
  return text.split(sep)[0];
}

const longFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
/** "Saturday 3 October". */
export function fmtLongDay(iso: string) {
  const p: Record<string, string> = {};
  for (const x of longFmt.formatToParts(new Date(iso))) p[x.type] = x.value;
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "https://www.marxists.org/…" → "marxists.org". */
export function hostOf(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
