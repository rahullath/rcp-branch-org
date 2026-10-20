import type { Actor } from "./auth";
import type { ReadingGroup, ReadingGroupAudience, ReadingGroupContact, ReadingGroupGuest, ReadingGroupLevel, ReadingGroupMember } from "./types";

/*
 * Reading groups stay small and led: a cap on people (comrades + contacts),
 * at least one lead per LEAD_RATIO people, and no second group on the same
 * book while one still has room. Shared by the API (enforces) and the UI
 * (explains).
 */

export const DEFAULT_CAPACITY = 6;
/** One lead for every this-many people in the group. */
export const LEAD_RATIO = 4;

export const bookOf = (g: Pick<ReadingGroup, "book" | "title">) => (g.book || g.title).trim();
export const sameBook = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface GroupStats {
  members: ReadingGroupMember[];
  contacts: ReadingGroupContact[];
  guests: ReadingGroupGuest[];
  people: number;
  capacity: number;
  leads: number;
  full: boolean;
  leadsNeeded: number;
  needsLead: boolean;
}

export function groupStats(g: ReadingGroup, members: ReadingGroupMember[], contacts: ReadingGroupContact[], guests: ReadingGroupGuest[] = []): GroupStats {
  const m = members.filter((x) => x.group_id === g.id);
  const c = contacts.filter((x) => x.group_id === g.id);
  const gu = guests.filter((x) => x.group_id === g.id);
  const people = m.length + c.length + gu.length;
  const capacity = g.capacity || DEFAULT_CAPACITY;
  const leads = m.filter((x) => x.is_lead || x.user_id === g.runner_id).length + gu.filter((x) => x.is_lead).length;
  const leadsNeeded = Math.max(1, Math.ceil(people / LEAD_RATIO));
  return { members: m, contacts: c, guests: gu, people, capacity, leads, full: people >= capacity, leadsNeeded, needsLead: leads < leadsNeeded };
}

/** Account ids of the people who lead this group (runner + co-leads). */
export function groupLeadIds(g: ReadingGroup, members: ReadingGroupMember[]) {
  return [...new Set([g.runner_id, ...members.filter((m) => m.group_id === g.id && m.is_lead).map((m) => m.user_id)].filter((x): x is string => !!x))];
}

/** Leads, the education officer, organisers and the GS run a group: invite, add people, schedule, edit. */
export function canRunGroup(actor: Actor | null, g: ReadingGroup, members: ReadingGroupMember[]) {
  if (!actor) return false;
  if (groupLeadIds(g, members).includes(actor.id)) return true;
  return actor.role.some((r) => r === "general_secretary" || r === "education_officer" || r === "organizer");
}

/** An open group already reading this book, if any — start a new one only when they're all full. */
export function openGroupForBook(book: string, groups: ReadingGroup[], members: ReadingGroupMember[], contacts: ReadingGroupContact[], guests: ReadingGroupGuest[] = []) {
  return groups.find((g) => !g.archived && g.status !== "finished" && sameBook(bookOf(g), book) && !groupStats(g, members, contacts, guests).full) ?? null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const AUDIENCES: ReadingGroupAudience[] = ["members", "new", "contacts", "mixed"];
const LEVELS: ReadingGroupLevel[] = ["intro", "core", "advanced"];

/** The specifics a group is described by: when, where, who for, what level, the plan. */
export function groupDetails(body: Record<string, unknown>): Partial<ReadingGroup> {
  const out: Partial<ReadingGroup> = {};
  if ("schedule" in body) out.schedule = str(body.schedule);
  if ("location" in body) out.location = str(body.location);
  if ("plan" in body) out.plan = str(body.plan);
  if ("audience" in body) out.audience = AUDIENCES.includes(body.audience as ReadingGroupAudience) ? (body.audience as ReadingGroupAudience) : null;
  if ("level" in body) out.level = LEVELS.includes(body.level as ReadingGroupLevel) ? (body.level as ReadingGroupLevel) : null;
  return out;
}

