import type { AgendaAction, Event, EventGuest } from "./types";

/*
 * The secretary doc's rule, made mechanical: a decision is a task with a
 * person and a date, and an event that needs N people is either confirmed
 * or called off by a set time — nobody turns up to find they're alone.
 * Pure helpers, shared by the API, the inbox and the screens.
 */

const TZ = "Europe/London";

/** Following someone up has no date — but quiet this long gets one nudge. */
export const QUIET_DAYS = 10;

/** Today's date in London as YYYY-MM-DD. */
export function londonDay(ms: number) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export type DueState = "none" | "later" | "soon" | "today" | "overdue";

/** How close an open action is to its date. "soon" = within two days. */
export function dueState(a: Pick<AgendaAction, "due_date" | "done">, today: string): DueState {
  if (a.done || !a.due_date) return "none";
  if (a.due_date < today) return "overdue";
  if (a.due_date === today) return "today";
  const days = (Date.parse(`${a.due_date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400_000;
  return days <= 2 ? "soon" : "later";
}

/** People going: app RSVPs plus people without an account the organiser marked going. */
export function goingCount(e: Pick<Event, "id">, rsvps: { event_id: string; status: string }[], guests: Pick<EventGuest, "event_id" | "status">[]) {
  return rsvps.filter((r) => r.event_id === e.id && r.status === "going").length + guests.filter((g) => g.event_id === e.id && g.status === "going").length;
}

export const isTentative = (e: Pick<Event, "status">) => e.status === "tentative";
export const isOff = (e: Pick<Event, "status">) => e.status === "off";

/** Reached its number — it's on. */
export function reachedTarget(e: Pick<Event, "target">, going: number) {
  return !!e.target && going >= e.target;
}

/** The lead has to call it: still tentative, deadline passed, short of its number. */
export function needsDecision(e: Pick<Event, "status" | "confirm_by" | "target">, going: number, now: number) {
  return isTentative(e) && !!e.confirm_by && Date.parse(e.confirm_by) <= now && !reachedTarget(e, going);
}

/**
 * "Needs 4 · 2 going · decided Wed 17:00" — the line every screen shows for
 * a tentative event, so nobody has to ask in the chat whether it's happening.
 */
export function tentativeLine(e: Pick<Event, "target" | "confirm_by">, going: number) {
  const parts = [`Needs ${e.target ?? "?"}`, `${going} going`];
  if (e.confirm_by) {
    const d = new Date(e.confirm_by);
    const day = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: TZ });
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
    parts.push(`decided ${day} ${time}`);
  }
  return parts.join(" · ");
}

/* ============================= "X to Y" action capture ============================= */

export interface CapturedAction {
  /** As written: "DP", "Ben", "Kit and Jo". Empty when no owner was found. */
  who: string[];
  text: string;
  /** YYYY-MM-DD when the line said "by Thursday", "tomorrow", "12/10". */
  due: string | null;
  line: string;
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SHORT_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** The next date (after today) that falls on `weekday` (0 = Sunday). */
function nextWeekday(today: string, weekday: number) {
  const d = new Date(`${today}T12:00:00Z`);
  const diff = (weekday - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** "by Thursday" / "before Friday" / "tomorrow" / "by 12/10" → a date, plus the line without it. */
function extractDue(text: string, today: string): { text: string; due: string | null } {
  const dayRe = new RegExp(`\\b(?:by|before|on|this|next)\\s+(${[...DAYS, ...SHORT_DAYS].join("|")})\\b`, "i");
  let m = text.match(dayRe);
  if (m) {
    const name = m[1].toLowerCase().slice(0, 3);
    return { text: text.replace(m[0], "").replace(/\s{2,}/g, " ").trim(), due: nextWeekday(today, SHORT_DAYS.indexOf(name)) };
  }
  m = text.match(/\b(?:by\s+)?tomorrow\b/i);
  if (m) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return { text: text.replace(m[0], "").replace(/\s{2,}/g, " ").trim(), due: d.toISOString().slice(0, 10) };
  }
  m = text.match(/\b(?:by|before|on)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(today.slice(0, 4));
    let due = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (!m[3] && due < today) due = `${year + 1}${due.slice(4)}`;
    return { text: text.replace(m[0], "").replace(/\s{2,}/g, " ").trim(), due };
  }
  return { text, due: null };
}

const NAME = String.raw`[A-Z][\w'’-]*(?:\s[A-Z][\w'’-]*)?`;
const NAMES = String.raw`${NAME}(?:\s*(?:,|&|\band\b)\s*${NAME})*`;
const LEAD = new RegExp(String.raw`^(${NAMES})\s+(?:to|will|is going to|should)\s+(.+)$`);
const TRAIL = /^(.+?)\s*[(\-–—:]\s*([A-Z]{2,3}|[A-Z][a-z]+)\s*\)?\s*$/;

/**
 * Turn a pasted list of actions — minutes, a BC summary, a chat message —
 * into tasks: "DP to send article to JB", "5) BN to buy spray for Sunday",
 * "Plan the order for LB to collect from CC by Thursday (JB)". Lines with no
 * owner come back with `who: []` so the screen can ask.
 */
export function parseActionLines(raw: string, today: string): CapturedAction[] {
  const out: CapturedAction[] = [];
  // "Ben talk to Morgan, Kit to talk to Ivy" is two tasks.
  const lines = raw.split(/\r?\n/).flatMap((l) => l.split(/,\s*(?=[A-Z][\w'’-]*\s+to\s)/));
  for (const original of lines) {
    let line = original
      .replace(/^\s*(?:[-*•·]|\d+[.)]|\(\d+\))\s*/, "")
      .replace(/^actions?:?\s*$/i, "")
      .trim();
    if (!line || line.length < 4 || /^(bc|branch|actions?|minutes)\b.*\d/i.test(line) && !/\bto\b/.test(line)) continue;
    line = line.replace(/\s+/g, " ");
    let who: string[] = [];
    let text = line;
    const lead = line.match(LEAD);
    if (lead) {
      who = splitNames(lead[1]);
      text = lead[2];
    } else {
      const trail = line.match(TRAIL);
      if (trail && !/\b(?:to|and)$/i.test(trail[1])) {
        who = [trail[2]];
        text = trail[1];
      }
    }
    const { text: clean, due } = extractDue(text.replace(/[.;]+$/, "").trim(), today);
    if (!clean) continue;
    out.push({ who, text: clean.charAt(0).toUpperCase() + clean.slice(1), due, line: original.trim() });
  }
  return out;
}

function splitNames(s: string) {
  return s
    .split(/\s*(?:,|&|\band\b)\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}
