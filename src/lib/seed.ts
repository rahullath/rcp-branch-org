import type {
  ActivityLogEntry,
  AgendaAction,
  AgendaContribution,
  BringItem,
  EventReport,
  EventRole,
  EventUpdate,
  MaterialMove,
  Poll,
  PollVote,
  PushSubscriptionRow,
  AgendaItem,
  Availability,
  Contact,
  Event,
  EventChecklist,
  ImportBatch,
  ImportRow,
  Location,
  Material,
  Pledge,
  PrepLink,
  Profile,
  ReadingGroup,
  ReadingGroupMember,
  ReadingGroupContact,
  Branch,
  BranchLinks,
  GraphicTemplate,
  Festival,
  Announcement,
  Comrade,
  EventGuest,
  EventShare,
  FollowUp,
  ShareRsvp,
  RoleRequest,
  Feedback,
  TopicIdea,
  ImportRequest,
  EventInvite,
  SharedRead,
  ReadingGroupGuest,
  ReadingGroupInvite,
  Session,
  SocialPost,
  Transaction,
} from "./types";
import { CURRICULUM, type CurriculumChapter } from "@/data/curriculum";
import { OWNED_BOOKS, OWNED_PAMPHLETS, PLANNED_ORDER } from "@/data/books";
import { TOPIC_LIBRARY } from "@/data/resources";
import {
  v2Actions,
  v2Agenda,
  v2Availability,
  v2Bring,
  v2Checklists,
  v2Contacts,
  v2EventPatches,
  v2Events,
  v2MaterialMoves,
  v2Materials,
  v2PollVotes,
  v2Polls,
  v2Reports,
  v2Roles,
  v2Rsvps,
  v2Updates,
} from "./seed-extras";

export const DEMO_USER_ID = "u-gen-sec";
export const DEMO_BRANCH_ID = "br-2";

export const seedProfiles: Profile[] = [
  {
    id: "u-gen-sec",
    name: "Secretary",
    role: ["general_secretary"],
    email: "comrade@example.org",
    monthly_subs: 20,
    subs_last_paid: "2026-08-01",
    subs_verified: true,
    paper_sub: true,
    idom_sub: true,
    branch_tag: "branch-2",
    pronouns: "he/him",
  },
  {
    id: "u-sarah",
    name: "Comrade Sarah",
    role: ["member"],
    monthly_subs: 15,
    subs_last_paid: "2026-07-25",
    subs_verified: true,
    paper_sub: true,
    idom_sub: false,
    branch_tag: "branch-2",
    pronouns: "she/her",
  },
  {
    id: "u-leo",
    name: "Comrade Leo",
    role: ["member"],
    monthly_subs: 10,
    subs_last_paid: "2026-06-15",
    paper_sub: false,
    idom_sub: true,
    branch_tag: "branch-2",
  },
  {
    id: "u-ana",
    name: "Comrade Ana",
    role: ["organizer"],
    monthly_subs: 15,
    subs_last_paid: null,
    paper_sub: true,
    idom_sub: false,
    branch_tag: "branch-2",
  },
  {
    id: "u-john",
    name: "John Doe",
    role: ["member"],
    monthly_subs: 20,
    subs_last_paid: "2026-08-02",
    paper_sub: true,
    idom_sub: false,
    branch_tag: "branch-2",
  },
  {
    id: "u-maria",
    name: "Comrade Maria",
    role: ["member"],
    monthly_subs: 12,
    subs_last_paid: null,
    paper_sub: false,
    idom_sub: false,
    branch_tag: "branch-2",
  },
  {
    id: "u-ruth",
    name: "Comrade Ruth",
    role: ["education_officer"],
    monthly_subs: 15,
    subs_last_paid: "2026-08-01",
    paper_sub: true,
    idom_sub: true,
    branch_tag: "branch-1",
  },
];

const seedContacts: Contact[] = [
  {
    id: "c-liam",
    name: "Liam O'Connor",
    met_date: "2026-07-20",
    location_type: "uni_stall",
    about: "Physics student, interested in housing.",
    what_worked: "Talked about rent strikes — very engaged.",
    phone: "+447700900123",
    status: "call_today",
    labels: ["priority"],
    notes: [
      {
        text: "Met at freshers stall. Said he would come to a reading group.",
        created_by: "u-gen-sec",
        created_at: "2026-08-05",
      },
    ],
    consent_given_at: "2026-08-05T10:00:00.000Z",
    created_by: "u-gen-sec",
    created_at: "2026-08-05T10:00:00.000Z",
  },
  {
    id: "c-sarah",
    name: "Sarah Jenkins",
    met_date: "2026-08-04",
    location_type: "paper_sale",
    about: "Nurse, trade union rep.",
    what_worked: "Solidarity paper, NHS underfunding.",
    phone: "+447700900456",
    status: "new",
    labels: [],
    notes: [],
    consent_given_at: "2026-08-04T14:00:00.000Z",
    created_by: "u-gen-sec",
    created_at: "2026-08-04T14:00:00.000Z",
  },
  {
    id: "c-ollie",
    name: "Ollie Chen",
    met_date: "2026-07-29",
    location_type: "door",
    about: "Brought partner to community meeting.",
    what_worked: "Community defence and mutual aid.",
    phone: "+447700900789",
    status: "contacted",
    labels: ["brought_someone"],
    notes: [],
    consent_given_at: "2026-07-29T09:30:00.000Z",
    created_by: "u-gen-sec",
    created_at: "2026-07-29T09:30:00.000Z",
  },
  {
    id: "c-maria",
    name: "Maria Rodriguez",
    met_date: "2026-07-01",
    location_type: "social",
    about: "Teacher, volunteered to help with kids activities.",
    what_worked: "Discussion on education cuts.",
    phone: "+447700900222",
    status: "in_reading_group",
    labels: ["priority"],
    notes: [],
    consent_given_at: "2026-07-02T11:00:00.000Z",
    created_by: "u-gen-sec",
    created_at: "2026-07-02T11:00:00.000Z",
  },
  {
    id: "c-jamal",
    name: "Jamal Washington",
    met_date: "2026-06-10",
    location_type: "paper_sale",
    about: "Postal worker, key contact.",
    what_worked: "Strike solidarity.",
    phone: "+447700900333",
    status: "contacted",
    labels: ["key-contact"],
    notes: [],
    created_by: "u-gen-sec",
    created_at: "2026-06-12T10:00:00.000Z",
  },
];

/** The branch's own reading-group sprint — the six core texts. */
const CLASSICS: CurriculumChapter[] = [
  { title: "The Communist Manifesto", author: "Marx and Engels", wellred: "https://wellredbooks.co.uk/product/the-communist-manifesto/" },
  { title: "Socialism: Utopian and Scientific", author: "Engels" },
  { title: "Wage Labour and Capital", author: "Marx" },
  { title: "Value, Price and Profit", author: "Marx" },
  { title: "The State and Revolution", author: "Lenin", wellred: "https://wellredbooks.co.uk/product/state-and-revolution/" },
  { title: "The Transitional Programme", author: "Trotsky", wellred: "https://wellredbooks.co.uk/product/transitional-programme/" },
];

function addWeeks(date: string, weeks: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 7 * weeks);
  return d.toISOString().slice(0, 10);
}

function sessionsForSeries(seriesId: string, items: CurriculumChapter[], base?: { date: string }): Session[] {
  return items.map((item, i) => ({
    id: `s-${seriesId}-${i + 1}`,
    series_id: seriesId,
    position: i + 1,
    topic: item.title,
    session_date: base ? addWeeks(base.date, i * 2) : null,
    start_time: "18:30",
    location: base ? "Community Center, Room B" : null,
    leadoff_name: null,
    reading_link: item.wellred ?? null,
    completed: false,
  }));
}

const seedSessions: Session[] = [
  // The branch reading group — scheduled forthnightly from freshers.
  ...sessionsForSeries("classics", CLASSICS, { date: "2026-09-18" }),
  // The official curriculum, unscheduled — tracked as an individual checklist.
  ...CURRICULUM.flatMap((track) => sessionsForSeries(track.id, track.items)),
];

const GROUP_PROGRAMME: { topic: string; leadoff: string }[] = [
  { topic: "Mao and the Fight Against Imperialism", leadoff: "KL" },
  { topic: "The American Revolution of 1776", leadoff: "FB" },
  { topic: "Freshers FAQs — Why We Need a Socialist Revolution", leadoff: "All" },
  { topic: "The National Question", leadoff: "KT" },
];

function topicPrep(title: string): (PrepLink & { label: string })[] {
  const topic = TOPIC_LIBRARY.find((t) => t.title === title);
  return (topic?.prep ?? []).map((r) => ({ label: r.title, url: r.url, kind: r.kind }));
}

const BRANCH_MEETING_BASE = {
  event_type: "branch" as const,
  location: "Harding Room",
  is_mobilization: false,
  meetup_time: null,
  posted_by: "u-gen-sec",
  chair_id: "u-gen-sec",
  minutes_id: "u-ana",
};


/** Freshers plan 2026 — the real schedule, so Upcoming/Past behave like production. */
const freshersPlanEvents: Event[] = [
  { id: "e-fp-0", title: "Stall at New Street", event_type: "uni_stall", start_time: "2026-09-19T12:00:00.000+01:00", location: "New Street", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-1", title: "Aggregate", event_type: "branch", start_time: "2026-09-19T18:00:00.000+01:00", location: "UoB Green Heart", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-2", title: "Postering — Vale accommodation (branch 1)", event_type: "postering", start_time: "2026-09-19T19:00:00.000+01:00", location: "The Vale", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-3", title: "Postering — City Centre (branch 2)", event_type: "postering", start_time: "2026-09-20T18:00:00.000+01:00", location: "City Centre", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-4", title: "Priority Stall", event_type: "uni_stall", start_time: "2026-09-21T10:00:00.000+01:00", location: "Campus", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-5", title: "Marxist FAQs (both branches)", event_type: "branch", start_time: "2026-09-21T18:30:00.000+01:00", location: "Harding Room", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-6", title: "Additional Stall", event_type: "uni_stall", start_time: "2026-09-22T10:00:00.000+01:00", location: "Campus", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-7", title: "Pub with contacts — Joe’s", event_type: "social", start_time: "2026-09-22T17:00:00.000+01:00", location: "Joe’s pub", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-8", title: "Freshers’ Fair", event_type: "uni_stall", start_time: "2026-09-24T10:00:00.000+01:00", location: "Freshers’ Fair", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-9", title: "Open meeting: Why you should be a communist", event_type: "branch", start_time: "2026-09-24T17:00:00.000+01:00", location: "Teaching and Learning Building 109", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-10", title: "Internal strategy meeting", event_type: "committee", start_time: "2026-09-26T13:00:00.000+01:00", location: "The Guild", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-11", title: "Branch meetings: Intro to Marxism / AI bubble", event_type: "branch", start_time: "2026-09-28T18:30:00.000+01:00", location: "Harding Room", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-12", title: "Campus Stall", event_type: "uni_stall", start_time: "2026-09-29T12:00:00.000+01:00", location: "Campus", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-13", title: "Campus Stall", event_type: "uni_stall", start_time: "2026-09-30T12:00:00.000+01:00", location: "Campus", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-14", title: "Branch meetings: Lenin and Trotsky / Palestine", event_type: "branch", start_time: "2026-10-05T18:30:00.000+01:00", location: "Harding Room", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-15", title: "Super Stall for Palestine", event_type: "uni_stall", start_time: "2026-10-06T11:30:00.000+01:00", location: "Campus", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-16", title: "London Palestine protest", event_type: "mobilization", start_time: "2026-10-10T10:00:00.000+01:00", location: "London", description: null, is_mobilization: true, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-17", title: "Branch meetings: National Question / Reform or Revolution", event_type: "branch", start_time: "2026-10-12T18:30:00.000+01:00", location: "Harding Room", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-18", title: "Super Stall", event_type: "uni_stall", start_time: "2026-10-20T12:00:00.000+01:00", location: "Campus", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
  { id: "e-fp-19", title: "Open meeting: Racism", event_type: "branch", start_time: "2026-10-28T18:30:00.000+01:00", location: "TBC", description: null, is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-09-01T10:00:00.000Z" },
];

const seedEvents: Event[] = [
  ...freshersPlanEvents,
  ...GROUP_PROGRAMME.map((g, i) => {
    const day = String(7 + i * 7).padStart(2, "0");
    const topic = TOPIC_LIBRARY.find((t) => t.title === g.topic);
    const id = `e-branch-sep${7 + i * 7}`;
    return {
      id,
      title: "Branch meeting",
      start_time: `2026-09-${day}T18:30:00.000Z`,
      description: topic?.description ?? null,
      created_at: "2026-08-20T10:10:00.000Z",
      ...BRANCH_MEETING_BASE,
    };
  }),
  {
    id: "e-revfest",
    title: "Revolution Festival 2026",
    event_type: "mobilization",
    start_time: "2026-11-13T09:00:00.000Z",
    location: "Revolution Festival",
    description:
      "The party's national festival — three days of Marxism in practice: talks, film, music and the campaign for revolution. £45 ticket.",
    is_mobilization: true,
    meetup_time: null,
    posted_by: "u-gen-sec",
    created_at: "2026-08-20T10:15:00.000Z",
  },
  ...seedEventsBase(),
  ...upcomingEvents(),
];

/** Pre-stall/social checklists. */
const seedEventChecklists: EventChecklist[] = [
  {
    id: "ec-potluck",
    event_id: "e-potluck",
    items: {
      papers_ready: { checked: true, by: "u-sarah", at: "2026-08-16T17:20:00.000Z" },
      table_set_up: { checked: true, by: "u-leo", at: "2026-08-16T17:40:00.000Z" },
      materials: { checked: true, by: "u-ana", at: "2026-08-16T17:25:00.000Z" },
      banners: { checked: true, by: "u-leo", at: "2026-08-16T17:45:00.000Z" },
      collection_tin: { checked: true, by: "u-ana", at: "2026-08-16T17:50:00.000Z" },
      sum_up_done: { checked: true, by: "u-sarah", at: "2026-08-16T18:25:00.000Z" },
    },
    photo_url: "/brand/logo.jpg",
    video_urls: [],
    completed_by: "u-sarah",
    completed_at: "2026-08-16T18:30:00.000Z",
    acknowledged: false,
    created_by: "u-sarah",
    created_at: "2026-08-16T16:05:00.000Z",
  },
  {
    id: "ec-papersale-aug29",
    event_id: "e-papersale-aug29",
    items: {
      papers_ready: { checked: true, by: "u-ana", at: "2026-08-27T08:40:00.000Z" },
      table_set_up: { checked: false },
      materials: { checked: true, by: "u-maria", at: "2026-08-27T08:45:00.000Z" },
      banners: { checked: false },
      collection_tin: { checked: false },
      sum_up_done: { checked: false },
    },
    photo_url: null,
    video_urls: [],
    completed_by: null,
    completed_at: null,
    acknowledged: false,
    created_by: "u-ana",
    created_at: "2026-08-27T09:00:00.000Z",
  },
];

/** Standing paper-sale availability. */
const seedAvailability: Availability[] = [
  { id: "av-gen-sec", user_id: "u-gen-sec", activity: "paper_sale", days: ["sat"], note: null, updated_at: "2026-08-01T10:00:00.000Z" },
  { id: "av-sarah", user_id: "u-sarah", activity: "paper_sale", days: ["sat", "wed"], note: null, updated_at: "2026-08-01T10:00:00.000Z" },
  { id: "av-leo", user_id: "u-leo", activity: "paper_sale", days: ["sun"], note: "Mornings only", updated_at: "2026-08-01T10:00:00.000Z" },
  { id: "av-ana", user_id: "u-ana", activity: "paper_sale", days: ["sat", "sun", "wed"], note: null, updated_at: "2026-08-01T10:00:00.000Z" },
  { id: "av-john", user_id: "u-john", activity: "paper_sale", days: ["sat"], note: null, updated_at: "2026-08-01T10:00:00.000Z" },
];

function seedEventsBase(): Event[] {
  return [
    { id: "e-reading", title: "Reading Group: The Communist Manifesto", event_type: "branch", start_time: "2026-09-18T18:30:00.000Z", location: "Community Center", description: "Reading group — session one of The Six Classics.", is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-08-01T10:00:00.000Z" },
    { id: "e-potluck", title: "Community Potluck", event_type: "social", start_time: "2026-08-16T16:00:00.000Z", location: "Riverside Park, Picnic Area B", description: "A relaxed afternoon to share food and stories. Bring a dish and your own plates.", is_mobilization: false, posted_by: "u-gen-sec", created_at: "2026-08-03T15:00:00.000Z" },
    { id: "e-committee-sep3", title: "Branch Committee Meeting", event_type: "committee", start_time: "2026-09-03T19:00:00.000Z", location: "Chapter Office (Rm 204)", description: "Officers only — planning the autumn recruitment push.", is_mobilization: false, posted_by: "u-gen-sec", chair_id: "u-gen-sec", minutes_id: null, created_at: "2026-08-20T10:05:00.000Z" },
    { id: "e-branch-aug31", title: "Branch meeting", event_type: "branch", start_time: "2026-08-31T18:30:00.000Z", location: "Harding Room", description: null, is_mobilization: false, meetup_time: "2026-08-31T18:00:00.000Z", posted_by: "u-gen-sec", chair_id: "u-gen-sec", minutes_id: "u-ana", created_at: "2026-08-20T10:00:00.000Z" },
    { id: "e-papersale-aug29", title: "Saturday Paper Sale", event_type: "paper_sale", start_time: "2026-08-29T10:00:00.000Z", location: "Victoria Square", description: "Weekly stall — bring extra flyers.", is_mobilization: false, meetup_time: "2026-08-29T09:45:00.000Z", posted_by: "u-ana", created_at: "2026-08-21T09:00:00.000Z" },
  ];
}

/** The weeks after the story's "now" (STORY_NOW): the diary a branch would have ahead of it. */
function upcomingEvents(): Event[] {
  const e = (id: string, title: string, event_type: Event["event_type"], start: string, location: string, description: string | null = null, is_mobilization = false): Event => ({
    id, title, event_type, start_time: `${start}:00.000Z`, location, description, is_mobilization, posted_by: "u-gen-sec", created_at: "2026-10-05T10:00:00.000Z",
  });
  return [
    e("e-up-1", "Branch meeting: Reform or revolution", "branch", "2026-10-14T18:30", "Harding Room", "Introduction, discussion and what we do this week."),
    e("e-up-2", "Saturday paper sale", "paper_sale", "2026-10-17T10:30", "Victoria Square", "Weekly stall. Meet 10:15, bring a few flyers."),
    e("e-up-3", "Campus stall", "uni_stall", "2026-10-19T11:00", "Campus"),
    e("e-up-4", "Branch committee", "committee", "2026-10-20T19:00", "The Guild", "Officers only. Agenda in the agenda tab."),
    e("e-up-5", "Branch meeting: Lenin and the party", "branch", "2026-10-21T18:30", "Harding Room"),
    e("e-up-6", "Pub after the meeting", "social", "2026-10-21T20:30", "Joe's pub", "Come for one, meet new people."),
    e("e-up-7", "Postering: student halls", "postering", "2026-10-22T18:00", "The Vale", "Bring a bucket if you have one."),
    e("e-up-8", "Saturday paper sale", "paper_sale", "2026-10-24T10:30", "Victoria Square"),
    e("e-up-9", "Branch meeting: the housing crisis", "branch", "2026-10-28T18:30", "Harding Room"),
    e("e-up-10", "Demo: cost of living", "mobilization", "2026-10-31T12:00", "Birmingham city centre", "Meet at the branch banner.", true),
    e("e-up-11", "Branch meeting: Marxism and the state", "branch", "2026-11-04T18:30", "Harding Room"),
    e("e-up-12", "Saturday paper sale", "paper_sale", "2026-11-07T10:30", "Victoria Square"),
  ];
}

/**
 * The seed tells one week of a branch's life, anchored on STORY_NOW. The demo is meant to look
 * lived in whenever it is opened, so every date moves forward by whole weeks (weekdays stay put)
 * until that week is the current one. The national festival keeps its real dates.
 */
const STORY_NOW = Date.UTC(2026, 9, 12);
const WEEK_MS = 7 * 86_400_000;

function rollForward(db: DevDb, now = new Date()): DevDb {
  const weeks = Math.max(0, Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - STORY_NOW) / WEEK_MS));
  if (weeks === 0) return db;
  const shift = (v: unknown): unknown => {
    if (typeof v === "string") {
      const m = /^(\d{4})-(\d{2})-(\d{2})([\s\S]*)$/.exec(v);
      if (!m) return v;
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + weeks * 7));
      return `${d.toISOString().slice(0, 10)}${m[4]}`;
    }
    if (Array.isArray(v)) return v.map(shift);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shift(x)]));
    return v;
  };
  const rolled = Object.fromEntries(Object.entries(db).map(([k, rows]) => [k, k === "festivals" ? rows : shift(rows)])) as unknown as DevDb;
  rolled.events = rolled.events.map((ev, i) => (db.events[i].id === "e-revfest" ? db.events[i] : ev));
  return rolled;
}

/** The agenda for the next branch meeting, so the agenda tab opens on something to run. */
const nextMeetingAgenda: AgendaItem[] = [
  { id: "a-next-pol", event_id: "e-up-1", meeting_date: "2026-10-14", section: "political", title: "Reform or revolution", duration: "40", leadoff_name: "Comrade Ruth", reading: "Reform or Revolution, chapter 1", icon: "forum", prep_links: [], created_by: "u-ruth", sort_order: 2, created_at: "2026-10-10T10:00:00.000Z" },
  { id: "a-next-org-1", event_id: "e-up-1", meeting_date: "2026-10-14", section: "organizational", title: "Paper sales and the weekend stall rota", duration: "10", icon: "event_note", created_by: "u-gen-sec", sort_order: 10, created_at: "2026-10-10T10:00:00.000Z" },
  { id: "a-next-org-2", event_id: "e-up-1", meeting_date: "2026-10-14", section: "organizational", title: "Festival places and transport", duration: "10", icon: "event_note", created_by: "u-gen-sec", sort_order: 11, created_at: "2026-10-10T10:00:00.000Z" },
];

function stockMaterial(book: { name: string; author?: string; copies: number; wellred?: string }, i: number, icon: string): Material {
  return {
    id: `m-book-${i}`,
    name: book.name,
    description: book.author ? `${book.author}${book.wellred ? " — see Wellred catalogue for restock" : ""}` : book.wellred ? "See Wellred catalogue for restock" : null,
    icon,
    category: "book" as const,
    qty: book.copies,
    status: "available" as const,
    holder_label: "Book inventory",
    note: book.wellred ? book.wellred : null,
    created_by: "u-gen-sec",
    created_at: "2026-07-01T10:00:00.000Z",
  };
}

const seedMaterials: Material[] = [
  {
    id: "m-gazebo",
    name: "Folding Gazebo",
    description: "3x3m Red canopy with side panels.",
    icon: "festival",
    category: "gear",
    qty: 1,
    status: "available",
    holder_label: "Stored at HQ",
    created_by: "u-gen-sec",
    created_at: "2026-07-01T10:00:00.000Z",
  },
  {
    id: "m-pa",
    name: "Portable PA System",
    description: "Includes 2 wireless mics and charging cable.",
    icon: "speaker",
    category: "gear",
    qty: 1,
    status: "in_use",
    holder_id: "u-ana",
    holder_label: "Comrade Ana",
    created_by: "u-gen-sec",
    created_at: "2026-07-02T10:00:00.000Z",
  },
  {
    id: "m-augpapers",
    name: "August Papers",
    description: "Stack of 500 leaflets for the weekend canvass.",
    icon: "description",
    category: "literature",
    qty: 500,
    status: "in_use",
    holder_id: "u-gen-sec",
    holder_label: "You",
    created_by: "u-gen-sec",
    created_at: "2026-07-03T10:00:00.000Z",
  },
  ...OWNED_BOOKS.map((b, i) => stockMaterial(b, i, "book")),
  ...OWNED_PAMPHLETS.map((b, i) => stockMaterial(b, i + OWNED_BOOKS.length, "auto_stories")),
  ...PLANNED_ORDER.map((item, i) => ({
    id: `m-order-${i}`,
    name: item.name,
    description: "On order from Wellred — place with the education officer.",
    icon: "book" as const,
    category: "book" as const,
    qty: 0,
    status: "missing" as const,
    holder_label: "Book inventory",
    note: item.wellred ?? null,
    stock_badge: "reorder" as const,
    last_updated: "2026-08-01",
    created_by: "u-gen-sec",
    created_at: "2026-07-01T10:00:00.000Z",
  })),
];

const seedLocations: Location[] = [
  {
    id: "l-victoria",
    name: "Victoria Square",
    category: "paper_sale",
    description:
      "High foot traffic area. Best for Saturday mornings between 10am and 1pm. Bring extra flyers.",
    created_by: "u-gen-sec",
    created_at: "2026-06-01T10:00:00.000Z",
  },
  {
    id: "l-office",
    name: "Chapter Office",
    category: "meeting",
    description:
      "Key for weekly branch meetings. Door code in the secure comms channel. Kitchen available.",
    created_by: "u-gen-sec",
    created_at: "2026-06-01T10:00:00.000Z",
  },
  {
    id: "l-guild",
    name: "Guild of Students",
    category: "uni_stall",
    description: "Freshers week primary spot. Need to book slots 2 weeks in advance via the SU portal.",
    created_by: "u-gen-sec",
    created_at: "2026-06-01T10:00:00.000Z",
  },
  {
    id: "l-harding",
    name: "UoB Harding Building Room 207",
    category: "meeting",
    description: "Regular weekly branch meeting room, 18:30. Room booking via the SU society portal.",
    created_by: "u-gen-sec",
    created_at: "2026-06-01T10:00:00.000Z",
  },
  {
    id: "l-medical",
    name: "UoB Medical Building",
    category: "meeting",
    description: "Fallback meeting room when Harding 207 isn't available.",
    created_by: "u-gen-sec",
    created_at: "2026-06-01T10:00:00.000Z",
  },
  {
    id: "l-centenary",
    name: "Centenary Square",
    category: "paper_sale",
    description: "Good for weekend stalls, wind shelter near the library.",
    created_by: "u-gen-sec",
    created_at: "2026-06-01T10:00:00.000Z",
  },
  {
    id: "l-park",
    name: "Cannon Hill Park",
    category: "social",
    description: "Used for community socials and family days.",
    created_by: "u-gen-sec",
    created_at: "2026-06-01T10:00:00.000Z",
  },
];

/** Small, self-organized reading groups — distinct from the branch-wide
 * `sessions` leadoff series. */
const seedReadingGroups: ReadingGroup[] = [
  {
    id: "rg-manifesto",
    title: "The Communist Manifesto",
    runner_id: "u-ana",
    cadence: "Weekly",
    current_chapter: "Chapter II",
    archived: false,
    created_by: "u-ana",
    created_at: "2026-07-10T10:00:00.000Z",
  },
  {
    id: "rg-socialism",
    title: "Socialism: Utopian and Scientific",
    runner_id: "u-sarah",
    cadence: "Fortnightly",
    current_chapter: "Part III",
    archived: false,
    created_by: "u-sarah",
    created_at: "2026-07-15T10:00:00.000Z",
  },
];

const seedReadingGroupMembers: ReadingGroupMember[] = [
  { id: "rgm-1", group_id: "rg-manifesto", user_id: "u-ana", joined_at: "2026-07-10T10:00:00.000Z" },
  { id: "rgm-2", group_id: "rg-manifesto", user_id: "u-leo", joined_at: "2026-07-10T10:00:00.000Z" },
  { id: "rgm-3", group_id: "rg-socialism", user_id: "u-sarah", joined_at: "2026-07-15T10:00:00.000Z" },
  { id: "rgm-4", group_id: "rg-socialism", user_id: "u-john", joined_at: "2026-07-16T10:00:00.000Z" },
  { id: "rgm-5", group_id: "rg-socialism", user_id: "u-maria", joined_at: "2026-07-16T10:00:00.000Z" },
];

const seedAgenda: AgendaItem[] = [
  {
    id: "a-paper",
    meeting_date: "2026-08-31",
    event_id: "e-branch-aug31",
    section: "paper",
    title: "Paper Discussion",
    duration: "30",
    description: "Reviewing the latest circulation numbers and key articles for the week.",
    icon: "newspaper",
    attachment: "Issue_412_Talking_Points.pdf",
    sort_order: 1,
    created_at: "2026-08-20T10:00:00.000Z",
  },
  {
    id: "a-political",
    meeting_date: "2026-08-31",
    event_id: "e-branch-aug31",
    section: "political",
    title: "Cuba and the Restoration of Capitalism",
    duration: "60",
    icon: "forum",
    leadoff_name: "Comrade Maria",
    reading: "Lenin: Imperialism, the Highest Stage of Capitalism (Ch 7-8)",
    prep_links: topicPrep("Cuba and the Restoration of Capitalism"),
    sort_order: 2,
    created_at: "2026-08-20T10:00:00.000Z",
  },
  {
    id: "a-org",
    meeting_date: "2026-08-31",
    event_id: "e-branch-aug31",
    section: "organizational",
    title: "Finance appeal",
    duration: "15",
    icon: "diversity_3",
    leadoff_name: "Secretary",
    sort_order: 3,
    created_at: "2026-08-20T10:00:00.000Z",
  },
  {
    id: "a-org-2",
    meeting_date: "2026-08-31",
    event_id: "e-branch-aug31",
    section: "organizational",
    title: "Contact work",
    duration: "20",
    icon: "diversity_3",
    leadoff_name: "All",
    sort_order: 4,
    created_at: "2026-08-20T10:00:00.000Z",
  },
  {
    id: "a-sep7-political",
    meeting_date: "2026-09-07",
    event_id: "e-branch-sep7",
    section: "political",
    title: "Mao and the Fight Against Imperialism",
    duration: "60",
    icon: "forum",
    leadoff_name: "KL",
    prep_links: topicPrep("Mao and the Fight Against Imperialism"),
    sort_order: 2,
    created_at: "2026-08-20T10:00:00.000Z",
  },
  {
    id: "a-sep14-political",
    meeting_date: "2026-09-14",
    event_id: "e-branch-sep14",
    section: "political",
    title: "The American Revolution of 1776",
    duration: "60",
    icon: "forum",
    leadoff_name: "FB",
    prep_links: topicPrep("The American Revolution of 1776"),
    sort_order: 2,
    created_at: "2026-08-20T10:00:00.000Z",
  },
  {
    id: "a-org-3",
    meeting_date: "2026-08-31",
    event_id: "e-branch-aug31",
    section: "organizational",
    title: "Branch Levy",
    duration: "5",
    icon: "diversity_3",
    leadoff_name: "Secretary",
    sort_order: 5,
    created_at: "2026-08-20T10:00:00.000Z",
  },
];

const seedTransactions: Transaction[] = [
  {
    id: "t-1",
    amount: 120,
    type: "expense",
    description: "Room hire — community center",
    recorded_by: "u-gen-sec",
    created_at: "2026-08-01T09:00:00.000Z",
  },
  {
    id: "t-2",
    amount: 42,
    type: "sale",
    category: "paper",
    description: "Paper sale — Victoria Square",
    recorded_by: "u-gen-sec",
    created_at: "2026-08-02T13:00:00.000Z",
  },
];

const seedPledges: Pledge[] = [
  {
    id: "p-1",
    user_id: "u-john",
    user_name: "John Doe",
    amount: 20,
    status: "paid",
    method: "card",
    paid_at: "2026-08-02",
  },
  {
    id: "p-2",
    user_id: "u-sarah",
    user_name: "Sarah Ali",
    amount: 15,
    status: "unpaid",
  },
  {
    id: "p-3",
    user_id: "u-gen-sec",
    user_name: "Secretary",
    amount: 20,
    status: "paid",
    method: "cash",
    paid_at: "2026-08-01",
  },
  {
    id: "p-4",
    user_id: "u-maria",
    user_name: "Comrade Maria",
    amount: 12,
    status: "unpaid",
  },
];

/** Week of 5 Oct in the social planner (Draft → Review → Ready). */
const seedSocialPosts: SocialPost[] = [
  { id: "sp-1", day: "Mon", day_num: 5, title: "Freshers week recap — stall photos", platforms: "IG · TikTok", status: "ready", created_at: "2026-10-01T10:00:00.000Z" },
  { id: "sp-2", day: "Tue", day_num: 6, title: "Reading group tonight: Wage Labour and Capital", platforms: "IG", status: "draft", created_at: "2026-10-01T10:00:00.000Z" },
  { id: "sp-4", day: "Thu", day_num: 8, title: "Pub social tonight", platforms: "IG Story", status: "needs_review", created_at: "2026-10-01T10:00:00.000Z" },
  { id: "sp-5", day: "Fri", day_num: 9, title: "Demand the impossible. Demand the future.", platforms: "IG · X", status: "ready", created_at: "2026-10-01T10:00:00.000Z" },
  { id: "sp-7", day: "Sun", day_num: 11, title: "Branch meeting reminder", platforms: "IG · FB", status: "draft", created_at: "2026-10-01T10:00:00.000Z" },
];

// Demo-mode-only sample of the import pipeline: a
// mixed batch of people rows (one a likely duplicate of c-ollie, one new)
// plus a materials row to show the "verify not wired up yet" state in the
// inbox. Never touches live Supabase; only seeds the local dev-store.
const seedImports: ImportBatch[] = [
  {
    id: "imp-fair",
    source: "ai_text",
    raw: "Pasted from the community fair sign-up sheet",
    created_by: "u-john",
    created_at: "2026-08-28T09:15:00.000Z",
  },
  {
    id: "imp-donations",
    source: "csv",
    raw: null,
    created_by: "u-leo",
    created_at: "2026-08-28T11:40:00.000Z",
  },
];

const seedImportRows: ImportRow[] = [
  {
    id: "impr-dave",
    import_id: "imp-fair",
    kind: "people",
    payload: { name: "Dave Chen", phone: "07700900789", met_date: "2026-08-27", about: "Chatted about housing at the fair" },
    extras: { email: "dave.chen@example.com", source_event: "Community Fair" },
    status: "pending",
    match_id: "c-ollie",
    match_score: 0.95,
    created_at: "2026-08-28T09:15:00.000Z",
  },
  {
    id: "impr-priya",
    import_id: "imp-fair",
    kind: "people",
    payload: { name: "Priya Nair", phone: "07700900333", about: "Interested in the reading group" },
    extras: { referred_by: "Comrade Ana" },
    status: "pending",
    match_id: null,
    match_score: null,
    created_at: "2026-08-28T09:16:00.000Z",
  },
  {
    id: "impr-bookshelf",
    import_id: "imp-donations",
    kind: "materials",
    payload: {},
    extras: { name: "Second-hand bookshelf", condition: "good", donor: "Comrade Leo" },
    status: "pending",
    created_at: "2026-08-28T11:40:00.000Z",
  },
];

const seedAgendaContributions: AgendaContribution[] = [
  {
    id: "agc-1",
    agenda_item_id: "a-political",
    author_id: "u-leo",
    text: "How do we square \"restoration of capitalism\" with Cuba still calling itself socialist — is that just rhetoric, or is there a real Marxist case either way?",
    created_at: "2026-08-26T18:00:00.000Z",
  },
  {
    id: "agc-2",
    agenda_item_id: "a-political",
    author_id: "u-sarah",
    text: "Want to bring up the tourism/dollarization angle — a comrade at the stall asked about it and I didn't have a good answer.",
    created_at: "2026-08-27T09:30:00.000Z",
  },
];

export interface DevDb {
  branches: Branch[];
  profiles: Profile[];
  contacts: Contact[];
  events: Event[];
  rsvps: { event_id: string; user_id: string; status: string; name?: string }[];
  sessions: Session[];
  materials: Material[];
  locations: Location[];
  reading_groups: ReadingGroup[];
  reading_group_members: ReadingGroupMember[];
  reading_group_contacts: ReadingGroupContact[];
  comrades: Comrade[];
  event_guests: EventGuest[];
  follow_ups: FollowUp[];
  event_shares: EventShare[];
  share_rsvps: ShareRsvp[];
  role_requests: RoleRequest[];
  feedback: Feedback[];
  topic_ideas: TopicIdea[];
  import_requests: ImportRequest[];
  event_invites: EventInvite[];
  shared_reads: SharedRead[];
  branch_links: (BranchLinks & { id: string })[];
  graphic_templates: GraphicTemplate[];
  festivals: Festival[];
  announcements: Announcement[];
  announcement_dismissals: { id: string; user_id: string; announcement_id: string }[];
  calendar_tokens: { id: string; user_id: string; token: string; created_at: string }[];
  reading_group_guests: ReadingGroupGuest[];
  reading_group_invites: ReadingGroupInvite[];
  event_checklists: EventChecklist[];
  availability: Availability[];
  agenda: AgendaItem[];
  agenda_contributions: AgendaContribution[];
  transactions: Transaction[];
  pledges: Pledge[];
  social_posts: SocialPost[];
  imports: ImportBatch[];
  import_rows: ImportRow[];
  activity_log: ActivityLogEntry[];
  event_bring: BringItem[];
  event_roles: EventRole[];
  event_updates: EventUpdate[];
  event_reports: EventReport[];
  polls: Poll[];
  poll_votes: (PollVote & { id: string })[];
  material_moves: MaterialMove[];
  agenda_actions: AgendaAction[];
  reading_ticks: { id: string; user_id: string; session_id: string; created_at: string }[];
  inbox_dismissals: { id: string; user_id: string; key: string; created_at: string }[];
  push_subscriptions: PushSubscriptionRow[];
  push_log: { id: string; created_at: string }[];
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function createSeedDb(): DevDb {
  const events = [...clone(seedEvents), ...clone(v2Events)].map((e) => ({ ...e, ...(v2EventPatches[e.id] ?? {}) }));
  const materials = [...clone(v2Materials), ...clone(seedMaterials)].map((m) =>
    m.id === "m-gazebo" ? { ...m, status: "in_use" as const, holder_id: "u-maria", holder_label: "Maria's garage" } : m,
  );
  return rollForward({
    // Demo mode is one branch; the scoping itself is enforced by Postgres RLS.
    branches: [{ id: DEMO_BRANCH_ID, name: "Demo Branch", district: "Birmingham", join_code: "DEMO02", created_at: "2026-08-01T10:00:00.000Z" }],
    profiles: clone(seedProfiles).map((p) => ({ ...p, branch_id: DEMO_BRANCH_ID })),
    contacts: [...clone(v2Contacts), ...clone(seedContacts)],
    events,
    rsvps: [
      { event_id: "e-papersale-aug29", user_id: "u-ana", status: "going", name: "Comrade Ana" },
      { event_id: "e-papersale-aug29", user_id: "u-sarah", status: "going", name: "Comrade Sarah" },
      { event_id: "e-papersale-aug29", user_id: "u-maria", status: "going", name: "Comrade Maria" },
      { event_id: "e-papersale-aug29", user_id: "u-leo", status: "maybe", name: "Comrade Leo" },
      { event_id: "e-potluck", user_id: "u-ana", status: "going", name: "Comrade Ana" },
      { event_id: "e-potluck", user_id: "u-sarah", status: "going", name: "Comrade Sarah" },
      { event_id: "e-potluck", user_id: "u-leo", status: "going", name: "Comrade Leo" },
      { event_id: "e-potluck", user_id: "u-john", status: "no", name: "John Doe" },
      ...clone(v2Rsvps),
    ],
    // The next classics session is Tuesday's reading-group event.
    sessions: clone(seedSessions).map((x) =>
      x.id === "s-classics-3"
        ? { ...x, session_date: "2026-10-06", start_time: "19:00", location: "Online", reading_link: "https://www.marxists.org/archive/marx/works/1847/wage-labour/",  leadoff_name: "Comrade Ruth", prep_questions: ["What is wage labour?", "Where does profit come from?", "Why do wages tend to the minimum?"] }
        : x.id === "s-classics-1" || x.id === "s-classics-2"
          ? { ...x, leadoff_name: x.id === "s-classics-1" ? "Comrade Ana" : "Comrade Sarah" }
          : x,
    ),
    materials,
    locations: clone(seedLocations),
    reading_groups: [
      ...clone(seedReadingGroups).map((g) => ({ ...g, book: g.title, capacity: 6 })),
      { id: "rg-wage", title: "Wage Labour and Capital", book: "Wage Labour and Capital", capacity: 8, runner_id: "u-ruth", cadence: "Fridays 16:00", schedule: "Fridays 4pm", location: "Medical School, UoB", audience: "members", level: "core", plan: "Introduction and Wage Labour and Capital, up to and including “By what are wages determined?”. Then the rest in two more sessions.", current_chapter: "Intro → “By what are wages determined?”", status: "running", archived: false, created_by: "u-ruth", created_at: "2026-09-25T10:00:00.000Z" },
      { id: "rg-women", title: "Women's oppression", book: "The Origin of the Family, Private Property and the State", capacity: 6, runner_id: null, status: "proposed", audience: "mixed", level: "intro", archived: false, created_by: "u-sarah", created_at: "2026-10-05T20:00:00.000Z" },
    ],
    reading_group_members: [
      ...clone(seedReadingGroupMembers),
      { id: "rgm-6", group_id: "rg-wage", user_id: "u-ruth", joined_at: "2026-09-25T10:00:00.000Z" },
      { id: "rgm-7", group_id: "rg-wage", user_id: "u-gen-sec", joined_at: "2026-09-26T10:00:00.000Z" },
      { id: "rgm-8", group_id: "rg-wage", user_id: "u-ana", joined_at: "2026-09-26T10:00:00.000Z" },
      { id: "rgm-9", group_id: "rg-wage", user_id: "u-sarah", joined_at: "2026-09-27T10:00:00.000Z" },
      { id: "rgm-10", group_id: "rg-wage", user_id: "u-leo", joined_at: "2026-09-27T10:00:00.000Z" },
    ].map((m) => ({ ...m, is_lead: ["rgm-1", "rgm-3", "rgm-6", "rgm-7"].includes(m.id) })),
    // How the agenda doc writes people: a nickname for a member, and someone not in the app yet.
    comrades: [
      { id: "cm-ruth", name: "Comrade Ruth", aliases: ["Ruth", "LU"], profile_id: "u-ruth", created_by: "u-gen-sec", created_at: "2026-10-01T10:00:00.000Z" },
      { id: "cm-dan", name: "Dan Price", aliases: ["DP", "Dan"], profile_id: null, created_by: "u-gen-sec", created_at: "2026-10-01T10:00:00.000Z" },
      { id: "cm-ivy", name: "Ivy", aliases: [], profile_id: null, created_by: "u-gen-sec", created_at: "2026-10-05T10:00:00.000Z", candidate_since: "2026-07-14", candidate_until: "2026-10-14" },
      { id: "cm-hana", name: "Hana", aliases: [], profile_id: null, created_by: "u-gen-sec", created_at: "2026-10-05T10:00:00.000Z", candidate_since: "2026-10-05", candidate_until: "2027-01-05" },
    ],
    // Priya (a priority contact) is reading with the Socialism group.
    event_guests: [
      { id: "eg-1", event_id: "e-banner", comrade_id: "cm-dan", status: "going", added_by: "u-gen-sec", created_at: "2026-10-07T18:00:00.000Z" },
      { id: "eg-2", event_id: "e-stall-tue", comrade_id: "cm-ivy", status: "going", added_by: "u-ana", created_at: "2026-10-05T20:00:00.000Z" },
      { id: "eg-3", event_id: "e-stall-tue", comrade_id: "cm-hana", status: "maybe", added_by: "u-ana", created_at: "2026-10-05T20:00:00.000Z" },
    ],
    follow_ups: [
      { id: "fu-1", person_id: "cm-ivy", follower_id: "u-gen-sec", last_touched_at: "2026-09-28T18:00:00.000Z", active: true, created_by: "u-gen-sec", created_at: "2026-09-20T10:00:00.000Z" },
      { id: "fu-2", person_id: "cm-hana", follower_id: "u-gen-sec", last_touched_at: "2026-10-08T18:00:00.000Z", active: true, created_by: "u-gen-sec", created_at: "2026-09-20T10:00:00.000Z" },
      { id: "fu-3", person_id: "cm-ruth", follower_id: null, follower_comrade_id: "cm-dan", last_touched_at: null, active: true, created_by: "u-gen-sec", created_at: "2026-10-05T10:00:00.000Z" },
    ],
    event_shares: [],
    share_rsvps: [],
    role_requests: [],
    import_requests: [],
    event_invites: [],
    shared_reads: [],
    branch_links: [{ id: DEMO_BRANCH_ID, branch_id: DEMO_BRANCH_ID, whatsapp: "https://chat.whatsapp.com/example-demo-branch", instagram: "https://instagram.com/demo_branch", updated_at: "2026-10-01T10:00:00.000Z" }],
    graphic_templates: [
      { id: "gt-1", name: "Paper sale, red", tpl: "paper", options: {}, fields: { cta: "Come and get the paper" }, event_type: "paper_sale", created_by: "u-ana", created_at: "2026-10-02T10:00:00.000Z" },
      { id: "gt-2", name: "Branch meeting", tpl: "event", options: {}, fields: { cta: "All welcome" }, event_type: "branch", created_by: "u-gen-sec", created_at: "2026-10-03T10:00:00.000Z" },
    ],
    announcements: [{ id: "an-1", branch_id: DEMO_BRANCH_ID, title: "Open meeting this Wednesday: bring a friend", body: "Doors 6pm for a 6:30 start. We'll finish at the pub.", link: "https://example.org/open-meeting", link_label: "Details", deadline: null, ends_on: null, tag: null, urgent: false, signed_by: "The secretary", archived: false, created_by: "u-gen-sec", created_at: "2026-10-20T10:00:00.000Z" },
      { id: "an-2", branch_id: DEMO_BRANCH_ID, title: "Festival places: tell us if you are going", body: "Say going, maybe or no on the festival page so we can book transport together.", link: null, link_label: null, deadline: "2026-11-01", ends_on: null, tag: "festival", urgent: true, signed_by: "The organizer", archived: false, created_by: "u-gen-sec", created_at: "2026-10-18T10:00:00.000Z" },
      { id: "an-3", branch_id: DEMO_BRANCH_ID, title: "New members: join the branch group chat", body: "Everything for the week goes in there first.", link: "https://chat.whatsapp.com/example-demo-branch", link_label: "Join", deadline: null, ends_on: null, tag: null, urgent: false, signed_by: "The secretary", archived: false, created_by: "u-gen-sec", created_at: "2026-10-12T10:00:00.000Z" },
    ],
    announcement_dismissals: [],
    festivals: [{ id: "fest-1", name: "Revolution Festival", start_date: "2026-11-13", end_date: "2026-11-15", location: "London", url: "https://revolutionfestival.co.uk/", active: true }],
    feedback: [],
    topic_ideas: [
      { id: "ti-1", title: "Women's oppression", kind: "branch", interested: [], created_by: "u-gen-sec", created_at: "2026-10-11T17:00:00.000Z" },
      { id: "ti-2", title: "AI", kind: "open_meeting", interested: ["u-sarah"], created_by: "u-gen-sec", created_at: "2026-10-11T17:00:00.000Z" },
    ],
    calendar_tokens: [],
    reading_group_guests: [{ id: "rgg-1", group_id: "rg-wage", comrade_id: "cm-dan", is_lead: true, added_by: "u-ruth", created_at: "2026-10-09T13:00:00.000Z" }],
    reading_group_invites: [
      { id: "rgi-1", group_id: "rg-socialism", user_id: "u-gen-sec", kind: "invite", note: null, status: "open", created_by: "u-ruth", created_at: "2026-10-08T10:00:00.000Z" },
      { id: "rgi-2", group_id: "rg-wage", user_id: "u-maria", kind: "request", note: "Read the Manifesto and Socialism: Utopian and Scientific already", status: "open", created_by: "u-maria", created_at: "2026-10-07T21:53:00.000Z" },
    ],
    reading_group_contacts: [{ id: "rgc-1", group_id: "rg-socialism", contact_id: "c-priya", added_by: "u-gen-sec", created_at: "2026-10-02T10:00:00.000Z" }],
    event_checklists: [...clone(v2Checklists), ...clone(seedEventChecklists)],
    availability: [...clone(seedAvailability), ...clone(v2Availability)],
    agenda: [...clone(seedAgenda), ...clone(v2Agenda), ...clone(nextMeetingAgenda)],
    agenda_contributions: clone(seedAgendaContributions),
    transactions: clone(seedTransactions),
    pledges: clone(seedPledges),
    social_posts: clone(seedSocialPosts),
    imports: clone(seedImports),
    import_rows: clone(seedImportRows),
    activity_log: [],
    event_bring: clone(v2Bring),
    event_roles: clone(v2Roles),
    event_updates: clone(v2Updates),
    event_reports: clone(v2Reports),
    polls: clone(v2Polls),
    poll_votes: clone(v2PollVotes),
    material_moves: clone(v2MaterialMoves),
    agenda_actions: clone(v2Actions),
    reading_ticks: [],
    inbox_dismissals: [],
    push_subscriptions: [],
    push_log: [],
  });
}
