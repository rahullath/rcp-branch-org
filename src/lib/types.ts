export type Role =
  | "general_secretary"
  | "education_officer"
  | "finance_officer"
  | "paper_sales_officer"
  | "social_media_officer"
  | "organizer"
  | "leading_comrade"
  | "member";

export const ROLE_LABEL: Record<Role, string> = {
  general_secretary: "General Secretary",
  education_officer: "Education Officer",
  finance_officer: "Finance Officer",
  paper_sales_officer: "Paper Sales Officer",
  social_media_officer: "Social Media Officer",
  organizer: "Organiser",
  leading_comrade: "Leading comrade",
  member: "Member",
};

export type SubKind = "none" | "digital" | "physical";
export const SUB_KINDS: { value: SubKind; label: string }[] = [
  { value: "none", label: "None" },
  { value: "digital", label: "Digital" },
  { value: "physical", label: "Print" },
];

export interface Profile {
  id: string;
  name: string;
  /** How the branch writes you — "JB". Falls back to the first letters of your name. */
  initials?: string | null;
  /** The branch you belong to. Null until you join or start one. */
  branch_id?: string | null;
  role: Role[];
  email?: string;
  monthly_subs?: number | null;
  subs_last_paid?: string | null;
  subs_verified?: boolean;
  paper_sub?: boolean;
  idom_sub?: boolean;
  /** What they say they get — print copies are handed out by the branch. */
  paper_sub_kind?: SubKind;
  idom_sub_kind?: SubKind;
  branch_tag?: string;
  pronouns?: string | null;
  notification_prefs?: Partial<NotificationPrefs> | null;
  /** WhatsApp number (+44…), optional — your branch can message you from the app. */
  phone?: string | null;
  /** Admin of this copy: approves new branches, can work in any branch. */
  is_admin?: boolean;
  /** Sees the branch but can't change anything; contacts, money and follow-ups are hidden. */
  view_only?: boolean;
  /** Set when they finish onboarding (who they are, role, install). */
  onboarded_at?: string | null;
  created_at?: string;
}

/** A note from someone trying the app: broken, confusing, an idea, or what works. */
export interface Feedback {
  id: string;
  user_id: string;
  kind: "bug" | "confusing" | "idea" | "works";
  text: string;
  page?: string | null;
  device?: string | null;
  status: "open" | "fixed" | "wontfix";
  reply?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

/** A suggested topic for a branch meeting or an open meeting. */
export interface TopicIdea {
  id: string;
  title: string;
  kind: "branch" | "open_meeting";
  note?: string | null;
  interested: string[];
  used_event_id?: string | null;
  archived?: boolean;
  created_by?: string | null;
  created_at: string;
}

/** "I'm the education officer" — waits for the general secretary to confirm. */
export interface RoleRequest {
  id: string;
  user_id: string;
  role: Role;
  note?: string | null;
  status: "pending" | "approved" | "declined";
  decided_by?: string | null;
  decided_at?: string | null;
  created_at: string;
}

/** An officer's import, waiting for the admin to check it against what's already there. */
export interface ImportRequest {
  id: string;
  user_id: string | null;
  data: Record<string, unknown>;
  /** Rows the sender left ticked, per module. */
  only_rows?: Record<string, number[]> | null;
  note?: string | null;
  status: "pending" | "approved" | "declined";
  decided_by?: string | null;
  decided_at?: string | null;
  reply?: string | null;
  /** How many went in, once approved. */
  result?: { imported: number } | null;
  created_at: string;
}

export type ContactStatus = "new" | "contacted" | "in_reading_group" | "cold" | "call_today";

export type MaterialCategory = "gear" | "book" | "literature";
export type LocationCategory = "paper_sale" | "meeting" | "uni_stall" | "social";
export type AgendaSection = "paper" | "political" | "organizational";
export type SocialPostStatus = "ready" | "draft" | "needs_review";

export interface ContactNote {
  text: string;
  created_by?: string;
  created_at?: string;
}

export interface Contact {
  id: string;
  name: string;
  met_date?: string | null;
  location_type?: string | null;
  about?: string | null;
  what_worked?: string | null;
  phone?: string | null;
  paper_sold?: string | null;
  pamphlet_sold?: string | null;
  status: ContactStatus;
  /** Where they are on the way to joining — the number that matters is recruits. */
  stage?: ContactStage | null;
  stage_at?: string | null;
  labels: string[];
  notes: ContactNote[];
  buddy_id?: string | null;
  consent_given_at?: string | null;
  created_by?: string;
  /** Who currently works this contact. Defaults to the creator; changes on hand-over. */
  owner_id?: string | null;
  /** Priority, potential or cold: the list a contact sits in day to day. */
  tier?: ContactTier | null;
  /** Last time the owner messaged/invited them — drives "quiet for N days". */
  last_contact_at?: string | null;
  /** The stall/sale they were logged at, so it counts toward that event's report. */
  met_event_id?: string | null;
  archived?: boolean;
  created_at: string;
}

export type ContactTier = "priority" | "potential" | "cold";

export type ContactStage = "met" | "talked" | "came" | "joined";
export const CONTACT_STAGES: { value: ContactStage; label: string; hint: string }[] = [
  { value: "met", label: "Met", hint: "Got their number" },
  { value: "talked", label: "Talked", hint: "Had a proper chat or a coffee" },
  { value: "came", label: "Came", hint: "Came to something" },
  { value: "joined", label: "Joined", hint: "Joined the party" },
];
const STAGE_ORDER: ContactStage[] = ["met", "talked", "came", "joined"];
/** Stages only move forward on their own (a "came" never drops back to "talked"). */
export const laterStage = (a: ContactStage | null | undefined, b: ContactStage) => (STAGE_ORDER.indexOf(a ?? "met") >= STAGE_ORDER.indexOf(b) ? (a ?? "met") : b);

/** A contact invited to an event, by the comrade who works them. */
export interface EventInvite {
  id: string;
  event_id: string;
  contact_id: string;
  invited_by: string | null;
  status: "invited" | "coming" | "maybe" | "no" | "came" | "missed";
  created_at: string;
  updated_at: string;
}

export const CONTACT_TIERS: { value: ContactTier; label: string; hint: string }[] = [
  { value: "priority", label: "Priority", hint: "Keen. Call or message this week, invite to the branch." },
  { value: "potential", label: "Potential", hint: "Interested. Invite to socials and reading groups." },
  { value: "cold", label: "Cold", hint: "No reply or not interested. Kept, but no nudges." },
];

/** Contacts saved before tiers existed fall back to their old status. */
export function contactTier(c: Pick<Contact, "tier" | "status">): ContactTier {
  if (c.tier) return c.tier;
  if (c.status === "cold") return "cold";
  if (c.status === "call_today") return "priority";
  return "potential";
}

/** The comrade responsible for a contact — see `owner_id`. */
/** Events worth bringing a contact to: the inbox suggests inviting your people. */
export const INVITE_EVENT_TYPES: EventType[] = ["open_meeting", "branch", "social"];

export function contactOwner(c: Pick<Contact, "owner_id" | "created_by">): string | null {
  return c.owner_id ?? c.created_by ?? null;
}

export type EventType =
  | "paper_sale"
  | "social"
  | "branch"
  | "open_meeting"
  | "uni_stall"
  | "phonebank"
  | "postering"
  | "mobilization"
  | "one_on_one"
  | "committee"
  | "reading_group";

export const EVENT_TYPE_META: Record<EventType, { label: string; icon: string; tone: string }> = {
  paper_sale: { label: "Paper sale", icon: "newspaper", tone: "primary" },
  reading_group: { label: "Reading group", icon: "menu_book", tone: "tertiary" },
  social: { label: "Social", icon: "celebration", tone: "tertiary" },
  branch: { label: "Branch", icon: "flag", tone: "neutral" },
  open_meeting: { label: "Open meeting", icon: "campaign", tone: "primary" },
  committee: { label: "Committee", icon: "badge", tone: "tertiary" },
  one_on_one: { label: "1-on-1", icon: "person", tone: "neutral" },
  uni_stall: { label: "Uni stall", icon: "school", tone: "primary" },
  phonebank: { label: "Phone banking", icon: "call", tone: "neutral" },
  postering: { label: "Postering", icon: "image", tone: "primary" },
  mobilization: { label: "Mobilization", icon: "campaign", tone: "danger" },
};

/** Whole-meeting types that get a chair/minutes-taker, unlike a stall or a social. */
export const MEETING_EVENT_TYPES: EventType[] = ["branch", "committee"];

export interface Event {
  id: string;
  title: string;
  event_type: EventType;
  start_time: string;
  location: string;
  description?: string | null;
  is_mobilization: boolean;
  meetup_time?: string | null;
  posted_by?: string;
  /** Committee meetings only: comrades invited who aren't officers (they see this one meeting, nothing else). */
  invitees?: string[];
  chair_id?: string | null;
  minutes_id?: string | null;
  /** Who runs it on the day. Falls back to `posted_by` — see `eventLead`. */
  lead_id?: string | null;
  /** How many people it needs; 0/null means no target. */
  target?: number | null;
  /** The education session this event is (reading groups). */
  session_id?: string | null;
  /**
   * "on" by default. "tentative" while it waits to reach `target` by
   * `confirm_by`; the lead then calls it on or "off" (and everyone going hears).
   */
  status?: EventStatus | null;
  confirm_by?: string | null;
  /** Paper sales: which issue, and how many copies went out. */
  paper_issue?: string | null;
  copies_out?: number | null;
  /** A session of this reading group. */
  reading_group_id?: string | null;
  /** Owning branch (set by the database from whoever made it). */
  branch_id?: string | null;
  scope?: EventScope | null;
  archived?: boolean;
  created_at: string;
}

export type EventStatus = "tentative" | "on" | "off";

/** Who an event is for. District and national events show to every branch. */
export type EventScope = "branch" | "district" | "national";

export const EVENT_SCOPE_LABEL: Record<EventScope, string> = {
  branch: "This branch",
  district: "Whole district",
  national: "National",
};

/** A branch. Everything branch-owned belongs to one; people join with its code. */
export interface Branch {
  id: string;
  name: string;
  district: string;
  join_code?: string;
  /** Waiting for an admin of this copy to approve it. */
  approved?: boolean;
  /** Joining with this code gives a view-only account. Null when the viewer link is off. */
  viewer_code?: string | null;
  created_at?: string;
}

/** Someone without an account, marked going/maybe by the organiser. */
export interface EventGuest {
  id: string;
  event_id: string;
  comrade_id: string;
  status: "going" | "maybe" | "no";
  added_by?: string | null;
  created_at: string;
  /** Said "I'm coming" on the share link — no People entry, just the name they gave. */
  via_link?: boolean;
  name?: string;
  who_sent?: string | null;
  extra?: number;
  note?: string | null;
}

export function eventLead(e: Pick<Event, "lead_id" | "posted_by">): string | null {
  return e.lead_id ?? e.posted_by ?? null;
}

/** Events that get a report afterwards. */
export const REPORT_EVENT_TYPES: EventType[] = ["paper_sale", "uni_stall", "reading_group"];

/** The event role for whoever writes the report afterwards. */
export const REPORT_ROLE = "Writes the report";

/** Who's asked for the report: whoever has the report role, else the lead. */
export function reportWriter(e: Pick<Event, "id" | "lead_id" | "posted_by">, roles: Pick<EventRole, "event_id" | "role" | "user_id">[]): string | null {
  return roles.find((r) => r.event_id === e.id && r.role === REPORT_ROLE && r.user_id)?.user_id ?? eventLead(e);
}

/** One thing that has to get to an event. Usually a material, so claiming
 * it also moves that material to you; free-text items have no material. */
export interface BringItem {
  id: string;
  event_id: string;
  material_id?: string | null;
  label?: string | null;
  qty?: string | null;
  claimed_by?: string | null;
  /** Ticked "here" on the day. */
  brought_at?: string | null;
  created_at: string;
}

/** A job on the day (chair, minutes, photos for social…), claimable by anyone. */
export interface EventRole {
  id: string;
  event_id: string;
  role: string;
  user_id?: string | null;
  created_at: string;
}

/** A lead's message to everyone going — replaces the per-event WhatsApp group. */
export interface EventUpdate {
  id: string;
  event_id: string;
  author_id: string;
  text: string;
  created_at: string;
}

export interface EventExtras {
  bring: BringItem[];
  roles: EventRole[];
  updates: EventUpdate[];
}

/** The lead's one prompt after a paper sale: copies, money, contacts. */
export interface EventReport {
  id: string;
  event_id: string;
  sold: number;
  money: number;
  contacts: number;
  /** Reading group sessions: how many came, and what to take further. */
  attended?: number | null;
  notes?: string | null;
  reported_by: string;
  created_at: string;
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  created_by: string;
  closes_at?: string | null;
  archived?: boolean;
  created_at: string;
}

export interface PollVote {
  poll_id: string;
  user_id: string;
  option: string;
}

export interface Rsvp {
  event_id: string;
  user_id: string;
  status: "going" | "maybe" | "no";
  name?: string;
}

/** Event types a checklist applies to — stalls and socials, not meetings. */
/** Events that take a photo for Social. */
export const CHECKLIST_EVENT_TYPES: EventType[] = ["paper_sale", "social", "uni_stall", "open_meeting", "mobilization"];

/** A single checklist item. `by`/`at` record who last toggled it. */
export interface ChecklistItemValue {
  checked: boolean;
  by?: string;
  at?: string;
}

export interface ChecklistItems {
  papers_ready?: ChecklistItemValue;
  table_set_up?: ChecklistItemValue;
  materials?: ChecklistItemValue;
  banners?: ChecklistItemValue;
  collection_tin?: ChecklistItemValue;
  sum_up_done?: ChecklistItemValue;
}

/** Reads `checked` from an item, tolerating the legacy boolean shape
 * (`{ papers_ready: true }`) stored before per-item attribution existed. */
export function itemChecked(item: ChecklistItemValue | boolean | undefined): boolean {
  if (typeof item === "boolean") return item;
  return item ? item.checked : false;
}

export const CHECKLIST_ITEM_LABELS: Record<keyof ChecklistItems, string> = {
  papers_ready: "Papers ready",
  table_set_up: "Table / stall set up",
  materials: "Materials (books, pamphlets)",
  banners: "Banners",
  collection_tin: "Collection tin",
  sum_up_done: "Sum-up done",
};

export interface EventChecklist {
  id: string;
  event_id: string;
  items: ChecklistItems;
  photo_url?: string | null;
  video_urls?: string[];
  completed_by?: string | null;
  completed_at?: string | null;
  acknowledged: boolean;
  created_by?: string | null;
  created_at: string;
}

export interface Series {
  id: string;
  name: string;
  description: string;
  total_sessions: number;
  completed_sessions: number;
}

export interface Session {
  id: string;
  series_id: string;
  position: number;
  topic: string;
  session_date?: string | null;
  start_time?: string | null;
  location?: string | null;
  leadoff_name?: string | null;
  chair_name?: string | null;
  reading_link?: string | null;
  prep_questions?: string[] | null;
  summary?: string | null;
  completed: boolean;
}

export interface ReadingGroup {
  id: string;
  title: string;
  /** The text being read — one group per book while it has space. Falls back to `title`. */
  book?: string | null;
  /** People (comrades + contacts) before the group counts as full. */
  capacity?: number | null;
  runner_id?: string | null;
  cadence?: string | null;
  current_chapter?: string | null;
  /** "proposed" topics gather interest until someone leads; "finished" ones are kept for the record. */
  status?: ReadingGroupStatus | null;
  /** When it meets, as people say it: "Fridays 4pm", "every other Tue". */
  schedule?: string | null;
  location?: string | null;
  audience?: ReadingGroupAudience | null;
  level?: ReadingGroupLevel | null;
  /** The sessions ahead: chapters, sections, a stopping point. */
  plan?: string | null;
  archived: boolean;
  created_by?: string | null;
  created_at: string;
}

export type ReadingGroupStatus = "proposed" | "running" | "finished";
export type ReadingGroupAudience = "members" | "new" | "contacts" | "mixed";
export type ReadingGroupLevel = "intro" | "core" | "advanced";

export const RG_AUDIENCE_LABEL: Record<ReadingGroupAudience, string> = {
  members: "Comrades",
  new: "New recruits",
  contacts: "Contacts",
  mixed: "Comrades + strong contacts",
};
export const RG_LEVEL_LABEL: Record<ReadingGroupLevel, string> = {
  intro: "Intro",
  core: "Core",
  advanced: "Advanced",
};

/** A member without an account (a new recruit not on the app yet). */
export interface ReadingGroupGuest {
  id: string;
  group_id: string;
  comrade_id: string;
  is_lead: boolean;
  added_by?: string | null;
  created_at: string;
}

/** A lead inviting a member, or a member asking to join. */
export interface ReadingGroupInvite {
  id: string;
  group_id: string;
  user_id: string;
  kind: "invite" | "request";
  note?: string | null;
  status: "open" | "accepted" | "declined";
  created_by?: string | null;
  created_at: string;
}

export interface ReadingGroupMember {
  id: string;
  group_id: string;
  user_id: string;
  /** Leads the discussion and answers questions. */
  is_lead?: boolean;
  joined_at: string;
}

/** A contact brought into a reading group by the comrade who works them. */
export interface ReadingGroupContact {
  id: string;
  group_id: string;
  contact_id: string;
  added_by: string;
  created_at: string;
}

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** Standing "which days am I usually free" per activity, instead of a
 * weekly WhatsApp poll. */
export interface Availability {
  id: string;
  user_id: string;
  activity: string;
  days: Weekday[];
  /** Weekly grid, `activity = "general"` rows only: "mon:eve", "sat:am"… */
  slots?: string[];
  /** Exams or trips — no nudges between these dates. */
  away?: AwayRange[];
  note?: string | null;
  updated_at: string;
}

export interface AwayRange {
  from: string;
  to: string;
  /** Part of a day only ("HH:MM"), e.g. can't do 2–5pm. Both or neither. */
  start?: string | null;
  end?: string | null;
  /** Why — optional; passed on if it means dropping out of something. */
  note?: string | null;
}

export type DaySlot = "am" | "aft" | "eve";
export const DAY_SLOTS: { value: DaySlot; label: string }[] = [
  { value: "am", label: "Morning" },
  { value: "aft", label: "Afternoon" },
  { value: "eve", label: "Evening" },
];

/** Something to say someone has with a material, logged with a name and date. */
export interface MaterialMove {
  id: string;
  material_id: string;
  actor_id: string;
  action: string;
  created_at: string;
}

/** An action point from the minutes, with an owner. Sits in their inbox until done. */
export interface AgendaAction {
  id: string;
  event_id?: string | null;
  text: string;
  /** Null while the person has no account yet — see `owner_comrade_id`. */
  owner_id: string | null;
  /** Who it's for when they aren't in the app yet; moves to `owner_id` on linking. */
  owner_comrade_id?: string | null;
  done: boolean;
  done_at?: string | null;
  /** By when (YYYY-MM-DD). Minutes without a date get buried. */
  due_date?: string | null;
  /** Where it was decided: "Branch 12 Oct", "BC 7 Oct", "Chat". */
  source?: string | null;
  /** Times it's been pushed back a week — shows at the next branch. */
  pushed?: number | null;
  /** Set while nobody has it: an open ask anyone can take. */
  open_since?: string | null;
  claimed_at?: string | null;
  /** Handed on by (and why) — so whoever picks it up has the context. */
  handed_from?: string | null;
  hand_note?: string | null;
  created_by?: string | null;
  created_at: string;
}

/**
 * Who follows up whom — a standing responsibility, not a dated task. One
 * follower per person; "last spoke" drives a nudge when it goes quiet.
 */
export interface FollowUp {
  id: string;
  /** The person being followed up (People entry). */
  person_id: string;
  /** The follower's account, or their People entry while they have none. */
  follower_id: string | null;
  follower_comrade_id?: string | null;
  last_touched_at?: string | null;
  note?: string | null;
  /** History: what was talked about, handovers. Newest last. */
  notes?: FollowUpNote[];
  /** Someone more experienced going along / helping — pairing new comrades. */
  with_id?: string | null;
  active: boolean;
  created_by?: string | null;
  created_at: string;
}

export interface FollowUpNote {
  text: string;
  by: string;
  at: string;
  kind?: "note" | "handover";
}

/** A no-account link to one event, with the graphic it shares. */
export interface EventShare {
  id: string;
  event_id: string;
  token: string;
  graphic?: { tpl: "event"; f: Record<string, string>; o: Record<string, unknown> } | null;
  /** The rendered graphic (JPEG data URL) — the page's picture and the link preview. */
  image?: string | null;
  created_by?: string | null;
  created_at: string;
  revoked_at?: string | null;
}

/** "I'm coming" from the public page. */
export interface ShareRsvp {
  id: string;
  share_id: string;
  event_id: string;
  name: string;
  note?: string | null;
  /** Free text: who sent them the link. Lets the branch place a stranger without asking for contact details. */
  who_sent?: string | null;
  /** How many more they're bringing. */
  extra?: number;
  created_at: string;
}

/**
 * A person as the branch writes them — "Dan Price", "DP", "Dan" — with
 * or without an account. Lets imports match initials and nicknames, and
 * holds follow-ups for people who haven't joined the app yet.
 */
export interface Comrade {
  id: string;
  name: string;
  aliases: string[];
  profile_id?: string | null;
  /** WhatsApp number for someone not on the app (people with accounts set their own). */
  phone?: string | null;
  /** Candidacy (YYYY-MM-DD): started, and when it's reviewed (3 months, or later if extended). */
  candidate_since?: string | null;
  candidate_until?: string | null;
  /** Running notes on how the candidacy is going (extensions, the review). */
  candidate_note?: string | null;
  /** Left the party (or never joined after candidacy). */
  left_at?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface NotificationPrefs {
  new_events: boolean;
  reminders: boolean;
  lead_updates: boolean;
  polls: boolean;
  bring_gaps: boolean;
  sunday_digest: boolean;
  quiet_start: string;
  quiet_end: string;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  new_events: true,
  reminders: true,
  lead_updates: true,
  polls: true,
  bring_gaps: true,
  sunday_digest: false,
  quiet_start: "22:00",
  quiet_end: "08:00",
};

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  created_at: string;
}

/** Something waiting on the signed-in comrade. Derived, never authored. */
export type Ask =
  | { k: string; kind: "rsvp"; event: Event }
  | { k: string; kind: "poll"; poll: Poll; votes: PollVote[] }
  | { k: string; kind: "bring"; event: Event; item: BringItem; material: Material | null }
  | { k: string; kind: "report"; event: Event; contactsLogged: number; went: string[] }
  | { k: string; kind: "action"; action: AgendaAction }
  | { k: string; kind: "decide"; event: Event; going: number }
  | { k: string; kind: "rg-invite"; invite: ReadingGroupInvite; group: ReadingGroup }
  | { k: string; kind: "rg-request"; invite: ReadingGroupInvite; group: ReadingGroup }
  | { k: string; kind: "quiet"; followUp: FollowUp; person: Comrade; days: number | null }
  | { k: string; kind: "role-request"; request: RoleRequest }
  | { k: string; kind: "invite-check"; event: Event; invites: (EventInvite & { name: string })[] }
  | { k: string; kind: "bring-reminder"; event: Event; item: BringItem; material: Material | null }
  | { k: string; kind: "bring-gap"; event: Event; items: { id: string; label: string }[] }
  | { k: string; kind: "pair"; role: "follow-up" | "lead-off"; who: string | null; what: string; href: string; when?: string | null }
  | { k: string; kind: "candidate-review"; person: Comrade; daysLeft: number }
  | { k: string; kind: "setup"; event: Event; checks: { label: string; ok: boolean }[]; posted: boolean }
  | { k: string; kind: "set-week" }
  | { k: string; kind: "invite-contacts"; event: Event; people: Pick<Contact, "id" | "name" | "phone">[] }
  | { k: string; kind: "read"; read: SharedRead; event: Pick<Event, "id" | "title" | "start_time"> | null; others?: number }
  | { k: string; kind: "open-task"; action: AgendaAction; days: number; stale: boolean }
  | { k: string; kind: "away-clash"; action: AgendaAction; away: AwayRange }
  | { k: string; kind: "import-request"; request: Pick<ImportRequest, "id" | "user_id" | "note" | "created_at">; rows: number }
  | { k: string; kind: "material"; material: Material; lastMove: MaterialMove; stale?: boolean };

export interface InboxPayload {
  asks: Ask[];
  updates: (EventUpdate & { event: Pick<Event, "id" | "title"> })[];
}

export type MaterialStatus = "available" | "in_use" | "missing";

export interface Material {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  category: "gear" | "book" | "literature";
  qty: number;
  status: MaterialStatus;
  holder_id?: string | null;
  /** Held by someone without an account (People entry). */
  holder_comrade_id?: string | null;
  holder_label?: string | null;
  note?: string | null;
  /** How many to order; 0 = none wanted. */
  wanted?: number | null;
  /** Why we want it: "Branch programme", "Paper stall", "Good to have". */
  purpose?: string | null;
  stock_badge?: string | null;
  last_updated?: string | null;
  created_by?: string;
  created_at: string;
}

export interface Location {
  id: string;
  name: string;
  category: "paper_sale" | "meeting" | "uni_stall" | "social";
  lat?: number | null;
  lng?: number | null;
  description?: string | null;
  /** "Campus", "City centre", "Selly Oak", "Moseley", "Digbeth"… */
  area?: string | null;
  /** What it's like: indoor, outdoor, free seating, good footfall, needs booking… */
  tags?: string[] | null;
  /** Where to book it (the university room booking page, the library…). */
  book_url?: string | null;
  created_by?: string;
  archived?: boolean;
  created_at: string;
}

/** An article or reading shared with the whole branch, or set for an event. */
export interface SharedRead {
  id: string;
  url: string;
  title: string;
  note?: string | null;
  event_id?: string | null;
  shared_by?: string | null;
  read_by: string[];
  /** The one to do if you only do one. Unset on every reading of an event → the first added. */
  main?: boolean;
  created_at: string;
}

export type PrepLinkKind = "article" | "youtube" | "spotify" | "podcast";

export interface PrepLink {
  label: string;
  url: string;
  kind?: PrepLinkKind;
}

export interface AgendaItem {
  id: string;
  meeting_date?: string | null;
  section: "paper" | "political" | "organizational";
  title: string;
  duration?: string | null;
  description?: string | null;
  icon?: string | null;
  attachment?: string | null;
  leadoff_name?: string | null;
  /** Someone helping the lead-off prepare (pairing new comrades with experienced ones). */
  prep_with_id?: string | null;
  chair_name?: string | null;
  reading?: string | null;
  reports?: string[];
  tasks?: { label: string; done: boolean }[];
  event_id?: string | null;
  prep_links?: PrepLink[];
  /** What the item is about, one tap away: an event, a material, or a sale report. */
  link?: AgendaLink | null;
  created_by?: string | null;
  archived?: boolean;
  sort_order: number;
  created_at: string;
}

/**
 * A meeting's main political discussion, not a short "current events" slot
 * before it: the one with a lead-off, then with reading, then the longest.
 */
export function mainDiscussion(items: AgendaItem[], eventId: string): AgendaItem | undefined {
  const mins = (i: AgendaItem) => parseInt((i.duration ?? "").replace(/\D/g, "")) || 0;
  return items
    .filter((i) => i.event_id === eventId && i.section === "political" && !i.archived)
    .sort((a, b) => Number(!!b.leadoff_name) - Number(!!a.leadoff_name) || Number(!!b.prep_links?.length) - Number(!!a.prep_links?.length) || mins(b) - mins(a) || a.sort_order - b.sort_order)[0];
}

export interface AgendaLink {
  kind: "event" | "material" | "report";
  id: string;
}

/**
 * A member's question or point to raise before a political discussion —
 * deliberately separate from officer-curated `prep_links`: any comrade can
 * add one, no approval step, so branch prep isn't a one-way broadcast.
 */
export interface AgendaContribution {
  id: string;
  agenda_item_id: string;
  author_id?: string | null;
  text: string;
  created_at: string;
}

export type TransactionType = "expense" | "sale";

export type TransactionCategory = "paper" | "book" | "pamphlet" | "donation" | "tin";

export const TRANSACTION_CATEGORY_LABELS: Record<TransactionCategory, string> = {
  paper: "Paper",
  book: "Book",
  pamphlet: "Pamphlet",
  donation: "Donation",
  tin: "Collection tin",
};

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  category?: TransactionCategory | null;
  description: string;
  recorded_by?: string;
  created_at: string;
}

export type PledgeStatus = "paid" | "unpaid";

export interface Pledge {
  id: string;
  /** Null when the pledge is for someone without an account — see `comrade_id`. */
  user_id: string | null;
  comrade_id?: string | null;
  user_name?: string;
  amount: number;
  status: PledgeStatus;
  method?: "card" | "cash" | null;
  paid_at?: string | null;
}

export interface SocialPost {
  id: string;
  day: string;
  day_num: number;
  title: string;
  platforms: string;
  status: "ready" | "draft" | "needs_review";
  /** The day it goes out. Older posts only have `day`/`day_num`. */
  post_date?: string | null;
  /** The event it promotes. */
  event_id?: string | null;
  /** The attached graphic (JPEG data URL). */
  image?: string | null;
  created_at: string;
}

export interface PaperSale {
  id: string;
  location: string;
  sale_date?: string | null;
  sale_time?: string | null;
  channel: "whatsapp" | "email";
  status: "draft" | "announced";
  created_by?: string;
  created_at: string;
}

export interface BookItem {
  id: string;
  title: string;
  author: string;
  copies: number;
  badge: "high" | "reorder" | "low";
}

/* ============================= imports ============================= */

export type ImportKind =
  | "people"
  | "materials"
  | "events"
  | "finance"
  | "education"
  | "social"
  | "members";

export type ImportRowStatus = "pending" | "verified" | "rejected" | "merged";

/** Which roles verify which import kind. general_secretary always passes
 * (server enforces) and is implicit here. Routing by role (not uid) keeps
 * changing who verifies — e.g. the delegation plan — a one-line change. */
export const IMPORT_VERIFIERS: Record<ImportKind, Role[]> = {
  people: ["organizer"],
  materials: ["organizer"],
  events: ["organizer"],
  finance: ["finance_officer"],
  education: ["education_officer"],
  social: ["social_media_officer"],
  members: [],
};

export interface ImportBatch {
  id: string;
  source: string;
  raw?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface ImportRow {
  id: string;
  import_id: string;
  kind: ImportKind;
  payload: Record<string, unknown>;
  extras: Record<string, unknown>;
  status: ImportRowStatus;
  match_id?: string | null;
  match_score?: number | null;
  verified_by?: string | null;
  verified_at?: string | null;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  actor_id?: string | null;
  action: string;
  kind?: string | null;
  import_row_id?: string | null;
  target_id?: string | null;
  note?: string | null;
  created_at: string;
}
