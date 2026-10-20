import type { Comrade } from "./types";

/*
 * Candidacy: a new member's first three months (or longer, if extended).
 * Candidates get given things to do, roles to try and closer follow-up,
 * so both sides can tell whether the party suits them. At the review date
 * the GS (and whoever follows them up) decides: full member, extend, or
 * they've left.
 */

export const CANDIDATE_MONTHS = 3;
/** Follow-up nudge after this many quiet days for a candidate (others wait longer). */
export const CANDIDATE_QUIET_DAYS = 7;

export const isCandidate = (c: Pick<Comrade, "candidate_since" | "candidate_until" | "left_at">) => !!c.candidate_since && !!c.candidate_until && !c.left_at;

export function addMonths(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** "Week 5 of 13" style progress. */
export function candidacyProgress(c: Pick<Comrade, "candidate_since" | "candidate_until">, today: string) {
  if (!c.candidate_since || !c.candidate_until) return null;
  const day = 86400_000;
  const total = Math.max(1, Math.round((Date.parse(c.candidate_until) - Date.parse(c.candidate_since)) / (7 * day)));
  const week = Math.min(total, Math.max(1, Math.floor((Date.parse(today) - Date.parse(c.candidate_since)) / (7 * day)) + 1));
  const daysLeft = Math.round((Date.parse(c.candidate_until) - Date.parse(today)) / day);
  return { week, total, daysLeft };
}
