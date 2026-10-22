import type {
  AgendaAction,
  AgendaItem,
  Availability,
  BringItem,
  Contact,
  Event,
  EventChecklist,
  EventReport,
  EventRole,
  EventUpdate,
  Material,
  MaterialMove,
  Poll,
  PollVote,
} from "./types";

/**
 * Demo data around one week, set around Saturday 3 October
 * 2026 so the weekly loop has something in every state: a stall today with
 * an unclaimed bring item, a sale the demo user leads, a past sale with no
 * report, open polls, a missing material and an action point.
 */

const AT = "2026-09-20T10:00:00.000Z";

export const v2Events: Event[] = [
  { id: "e-stall", title: "Freshers stall — Guild of Students", event_type: "uni_stall", start_time: "2026-10-03T12:00:00.000+01:00", meetup_time: "2026-10-03T11:30:00.000+01:00", location: "Guild of Students, Edgbaston", description: null, is_mobilization: false, posted_by: "u-ruth", lead_id: "u-ruth", target: 5, created_at: AT },
  { id: "e-sale", title: "Saturday paper sale", event_type: "paper_sale", start_time: "2026-10-03T15:00:00.000+01:00", meetup_time: "2026-10-03T14:45:00.000+01:00", location: "Victoria Square", description: null, is_mobilization: false, posted_by: "u-gen-sec", lead_id: "u-gen-sec", target: 4, created_at: AT },
  { id: "e-wage-labour", title: "Wage Labour and Capital", event_type: "reading_group", start_time: "2026-10-06T19:00:00.000+01:00", location: "Online — link in event", description: "Classics series, session 3. Read before: marxists.org, about 40 pages.", is_mobilization: false, posted_by: "u-ruth", lead_id: "u-ruth", session_id: "s-classics-3", created_at: AT },
  { id: "e-pub", title: "Pub social", event_type: "social", start_time: "2026-10-08T20:00:00.000+01:00", location: "The Bristol Pear, Selly Oak", description: null, is_mobilization: false, posted_by: "u-maria", lead_id: "u-maria", created_at: AT },
  { id: "e-poster", title: "Postering run — Edgbaston campus", event_type: "postering", start_time: "2026-10-09T10:00:00.000+01:00", meetup_time: "2026-10-09T09:45:00.000+01:00", location: "University station", description: null, is_mobilization: false, posted_by: "u-ana", lead_id: "u-ana", target: 6, created_at: AT },
  // Follow-through demo: a social that only happens with 4 people, and next Tuesday's stall.
  { id: "e-banner", title: "Banner making — Guild", event_type: "social", start_time: "2026-10-16T17:00:00.000+01:00", location: "Guild of Students, room TBC", description: "After the Palestine demo. Paint, sheets and photos for social.", is_mobilization: false, posted_by: "u-gen-sec", lead_id: "u-gen-sec", target: 4, status: "tentative", confirm_by: "2026-10-14T17:00:00.000+01:00", created_at: AT },
  { id: "e-stall-tue", title: "Paper stall — campus", event_type: "paper_sale", start_time: "2026-10-13T13:00:00.000+01:00", meetup_time: "2026-10-13T12:45:00.000+01:00", location: "UoB library steps", description: null, is_mobilization: false, posted_by: "u-ana", lead_id: "u-ana", target: 5, paper_issue: "#56", copies_out: 30, created_at: AT },
  { id: "e-sale-past", title: "Saturday paper sale", event_type: "paper_sale", start_time: "2026-09-26T15:00:00.000+01:00", location: "Victoria Square", description: null, is_mobilization: false, posted_by: "u-gen-sec", lead_id: "u-gen-sec", target: 4, created_at: AT },
];

/** The next branch meeting already exists in the freshers plan — give it a chair, minutes and a lead. */
export const v2EventPatches: Record<string, Partial<Event>> = {
  "e-fp-14": { chair_id: "u-ana", minutes_id: "u-sarah", lead_id: "u-ana" },
  "e-fp-11": { chair_id: "u-gen-sec", minutes_id: "u-sarah" },
};

export const v2Rsvps = [
  ...[["u-ruth", "going"], ["u-ana", "going"], ["u-gen-sec", "going"], ["u-maria", "maybe"]].map(([u, s]) => ({ event_id: "e-stall", user_id: u, status: s })),
  ...[["u-gen-sec", "going"], ["u-maria", "going"]].map(([u, s]) => ({ event_id: "e-sale", user_id: u, status: s })),
  ...[["u-ruth", "going"], ["u-sarah", "going"], ["u-leo", "going"], ["u-gen-sec", "going"]].map(([u, s]) => ({ event_id: "e-wage-labour", user_id: u, status: s })),
  ...[["u-maria", "going"], ["u-ana", "going"], ["u-leo", "maybe"]].map(([u, s]) => ({ event_id: "e-pub", user_id: u, status: s })),
  ...[["u-ana", "going"], ["u-john", "going"]].map(([u, s]) => ({ event_id: "e-poster", user_id: u, status: s })),
  ...[["u-gen-sec", "going"], ["u-maria", "going"], ["u-john", "going"]].map(([u, s]) => ({ event_id: "e-sale-past", user_id: u, status: s })),
  ...[["u-ana", "going"], ["u-ruth", "going"], ["u-sarah", "going"], ["u-john", "going"], ["u-leo", "maybe"], ["u-gen-sec", "going"]].map(([u, s]) => ({ event_id: "e-fp-14", user_id: u, status: s })),
  ...[["u-gen-sec", "going"], ["u-ruth", "going"]].map(([u, s]) => ({ event_id: "e-fp-15", user_id: u, status: s })),
  ...[["u-gen-sec", "going"]].map(([u, s]) => ({ event_id: "e-banner", user_id: u, status: s })),
  ...[["u-ana", "going"], ["u-gen-sec", "maybe"]].map(([u, s]) => ({ event_id: "e-stall-tue", user_id: u, status: s })),
  ...[["u-gen-sec", "going"], ["u-ana", "going"], ["u-maria", "going"]].map(([u, s]) => ({ event_id: "e-fp-16", user_id: u, status: s })),
];

export const v2Materials: Material[] = [
  { id: "m-table", name: "Stall table", category: "gear", qty: 1, status: "in_use", holder_id: "u-ruth", holder_label: "Ruth's flat", icon: "inventory_2", created_by: "u-gen-sec", created_at: AT },
  { id: "m-leaflets", name: "Leaflets — Demand the Future", category: "literature", qty: 1200, status: "available", holder_id: null, holder_label: "Branch cupboard, Selly Oak", icon: "description", created_by: "u-gen-sec", created_at: AT },
  { id: "m-banner", name: "RCS banner", category: "gear", qty: 1, status: "in_use", holder_id: "u-ana", holder_label: "Ana's car", icon: "flag", created_by: "u-gen-sec", created_at: AT },
  { id: "m-paper55", name: "The Communist #55", category: "literature", qty: 46, status: "in_use", holder_id: "u-gen-sec", holder_label: null, icon: "newspaper", created_by: "u-gen-sec", created_at: AT },
  { id: "m-flags", name: "Flags ×4", category: "gear", qty: 4, status: "missing", holder_id: null, holder_label: null, icon: "flag", created_by: "u-gen-sec", created_at: AT },
  { id: "m-posters", name: "A3 posters", category: "literature", qty: 180, status: "in_use", holder_id: "u-gen-sec", holder_label: null, icon: "description", created_by: "u-gen-sec", created_at: AT },
  { id: "m-tape", name: "Tape + cable ties", category: "gear", qty: 1, status: "available", holder_id: null, holder_label: "Branch cupboard, Selly Oak", icon: "inventory_2", created_by: "u-gen-sec", created_at: AT },
  { id: "m-clipboards", name: "Sign-up clipboards ×3", category: "gear", qty: 3, status: "in_use", holder_id: "u-ruth", holder_label: "Ruth's bag", icon: "description", created_by: "u-gen-sec", created_at: AT },
];

export const v2MaterialMoves: MaterialMove[] = [
  { id: "mm-1", material_id: "m-table", actor_id: "u-ruth", action: "took it for the Freshers stall", created_at: "2026-09-26T17:00:00.000Z" },
  { id: "mm-2", material_id: "m-leaflets", actor_id: "u-gen-sec", action: "put 1,500 in the cupboard", created_at: "2026-09-20T12:00:00.000Z" },
  { id: "mm-3", material_id: "m-banner", actor_id: "u-ana", action: "took it after the open meeting", created_at: "2026-09-27T20:00:00.000Z" },
  { id: "mm-4", material_id: "m-paper55", actor_id: "u-gen-sec", action: "collected 60 from national", created_at: "2026-09-16T12:00:00.000Z" },
  { id: "mm-5", material_id: "m-flags", actor_id: "u-john", action: "had them at the Palestine demo", created_at: "2026-09-12T15:00:00.000Z" },
  { id: "mm-6", material_id: "m-posters", actor_id: "u-gen-sec", action: "collected from the print shop", created_at: "2026-09-22T12:00:00.000Z" },
  { id: "mm-7", material_id: "m-gazebo", actor_id: "u-maria", action: "took it home", created_at: "2026-09-19T18:00:00.000Z" },
];

export const v2Bring: BringItem[] = [
  { id: "b-1", event_id: "e-stall", material_id: "m-table", claimed_by: "u-ruth", created_at: AT },
  { id: "b-2", event_id: "e-stall", material_id: "m-leaflets", qty: "300", claimed_by: null, created_at: AT },
  { id: "b-3", event_id: "e-stall", material_id: "m-banner", claimed_by: "u-ana", created_at: AT },
  { id: "b-4", event_id: "e-stall", material_id: "m-paper55", qty: "20", claimed_by: "u-ana", created_at: AT },
  { id: "b-5", event_id: "e-sale", material_id: "m-paper55", qty: "30", claimed_by: "u-gen-sec", created_at: AT },
  { id: "b-6", event_id: "e-sale", material_id: "m-flags", claimed_by: null, created_at: AT },
  { id: "b-7", event_id: "e-sale", material_id: "m-clipboards", claimed_by: "u-maria", created_at: AT },
  { id: "b-8", event_id: "e-poster", material_id: "m-posters", qty: "150", claimed_by: null, created_at: AT },
  { id: "b-9", event_id: "e-poster", material_id: "m-tape", claimed_by: null, created_at: AT },
];

export const v2Roles: EventRole[] = [
  { id: "r-1", event_id: "e-stall", role: "Stall lead", user_id: "u-ruth", created_at: AT },
  { id: "r-2", event_id: "e-stall", role: "Photos for social", user_id: null, created_at: AT },
  { id: "r-3", event_id: "e-sale", role: "Sale lead", user_id: "u-gen-sec", created_at: AT },
  { id: "r-4", event_id: "e-fp-14", role: "Lead-off", user_id: "u-ruth", created_at: AT },
  { id: "r-5", event_id: "e-wage-labour", role: "Lead-off", user_id: "u-ruth", created_at: AT },
];

export const v2Updates: EventUpdate[] = [
  { id: "up-1", event_id: "e-stall", author_id: "u-ruth", text: "We are left of the main entrance, under the red banner.", created_at: "2026-10-03T11:10:00.000+01:00" },
];

export const v2Reports: EventReport[] = [];

/** Ruth finished the Freshers stall checklist with a photo — it shows on Social as "Photos in". */
export const v2Checklists: EventChecklist[] = [
  {
    id: "ec-stall",
    event_id: "e-stall",
    items: Object.fromEntries(
      ["papers_ready", "table_set_up", "materials", "banners", "collection_tin", "sum_up_done"].map((k) => [k, { checked: true, by: "u-ruth", at: "2026-10-03T13:40:00.000+01:00" }]),
    ),
    photo_url: "/brand/demo-stall.jpg",
    video_urls: [],
    completed_by: "u-ruth",
    completed_at: "2026-10-03T13:45:00.000+01:00",
    acknowledged: false,
    created_by: "u-ruth",
    created_at: "2026-10-03T11:30:00.000+01:00",
  },
];

export const v2Polls: Poll[] = [
  { id: "q-1", question: "Extra stall next week — Wed or Thu?", options: ["Wed 12:00", "Thu 12:00"], created_by: "u-ana", closes_at: "2026-10-05T12:00:00.000+01:00", created_at: "2026-10-02T10:00:00.000Z" },
  { id: "q-2", question: "Can you drive to the Coventry demo on 17 Oct?", options: ["Yes", "No"], created_by: "u-maria", closes_at: "2026-10-07T12:00:00.000+01:00", created_at: "2026-10-02T12:00:00.000Z" },
];

export const v2PollVotes: (PollVote & { id: string })[] = [
  ...[["u-ruth", "Wed 12:00"], ["u-sarah", "Wed 12:00"], ["u-maria", "Thu 12:00"], ["u-john", "Thu 12:00"], ["u-leo", "Thu 12:00"]].map(([u, o]) => ({ id: `pv-q1-${u}`, poll_id: "q-1", user_id: u, option: o })),
  ...[["u-ana", "Yes"], ["u-ruth", "No"], ["u-john", "No"]].map(([u, o]) => ({ id: `pv-q2-${u}`, poll_id: "q-2", user_id: u, option: o })),
];

export const v2Actions: AgendaAction[] = [
  { id: "ac-1", event_id: "e-fp-11", text: "Book the Harding Room for October", owner_id: "u-ana", done: true, done_at: "2026-09-30T10:00:00.000Z", created_by: "u-sarah", created_at: "2026-09-28T20:00:00.000Z" },
  { id: "ac-2", event_id: "e-fp-11", text: "Order 500 more leaflets", owner_id: "u-gen-sec", done: false, created_by: "u-sarah", created_at: "2026-09-28T20:00:00.000Z" },
  { id: "ac-3", event_id: "e-fp-11", text: "Get Freshers sign-ups into the app", owner_id: "u-ruth", done: false, created_by: "u-sarah", created_at: "2026-09-28T20:00:00.000Z" },
  { id: "ac-4", event_id: "e-banner", text: "Book a room at the Guild for banner making", owner_id: "u-gen-sec", done: false, due_date: "2026-10-08", source: "BC 7 Oct", pushed: 1, created_by: "u-sarah", created_at: "2026-10-07T18:00:00.000Z" },
  { id: "ac-5", event_id: null, text: "Plan the paper order for LB to collect from CC", owner_id: "u-gen-sec", done: false, due_date: "2026-10-15", source: "Branch 5 Oct", created_by: "u-sarah", created_at: "2026-10-05T20:00:00.000Z" },
];

export const v2Agenda: AgendaItem[] = [
  { id: "a-v2-pol", event_id: "e-fp-14", meeting_date: "2026-10-05", section: "political", title: "Lenin and Trotsky", duration: "40", leadoff_name: "Comrade Ruth", reading: "The Communist #55, pp. 4–5", icon: "forum", prep_links: [], created_by: "u-ruth", sort_order: 2, created_at: AT },
  { id: "a-v2-org-1", event_id: "e-fp-14", meeting_date: "2026-10-05", section: "organizational", title: "Freshers report: stalls, contacts, sign-ups", duration: "10", icon: "event_note", link: { kind: "event", id: "e-stall" }, created_by: "u-ruth", sort_order: 10, created_at: AT },
  { id: "a-v2-org-2", event_id: "e-fp-14", meeting_date: "2026-10-05", section: "organizational", title: "October paper sales", duration: "10", icon: "event_note", link: { kind: "event", id: "e-sale" }, created_by: "u-gen-sec", sort_order: 11, created_at: AT },
  { id: "a-v2-org-3", event_id: "e-fp-14", meeting_date: "2026-10-05", section: "organizational", title: "Where are the flags?", duration: "5", icon: "event_note", link: { kind: "material", id: "m-flags" }, created_by: "u-ana", sort_order: 12, created_at: AT },
];

export const v2Contacts: Contact[] = [
  { id: "c-priya", name: "Priya Nair", phone: "+447700900801", status: "new", tier: "priority", met_event_id: "e-stall", location_type: "uni_stall", met_date: "2026-10-01", about: "History, 1st year. Asked about the open meeting.", labels: [], notes: [], consent_given_at: "2026-10-01T12:00:00.000Z", created_by: "u-gen-sec", owner_id: "u-gen-sec", last_contact_at: "2026-10-01T12:00:00.000Z", created_at: "2026-10-01T12:00:00.000Z" },
  { id: "c-aisha", name: "Aisha Rahman", phone: "+447700900802", status: "new", tier: "potential", met_event_id: "e-sale-past", location_type: "paper_sale", met_date: "2026-09-26", labels: [], notes: [], consent_given_at: "2026-09-26T15:30:00.000Z", created_by: "u-gen-sec", owner_id: "u-gen-sec", last_contact_at: "2026-10-02T18:00:00.000Z", created_at: "2026-09-26T15:30:00.000Z" },
  { id: "c-tom", name: "Tom Hale", phone: "+447700900803", status: "new", tier: "potential", met_event_id: "e-sale-past", location_type: "paper_sale", met_date: "2026-09-26", labels: [], notes: [], consent_given_at: "2026-09-26T15:40:00.000Z", created_by: "u-gen-sec", owner_id: "u-gen-sec", last_contact_at: "2026-09-26T15:40:00.000Z", created_at: "2026-09-26T15:40:00.000Z" },
  { id: "c-jordan", name: "Jordan Pike", phone: "+447700900804", status: "contacted", tier: "potential", location_type: "social", met_date: "2026-09-22", labels: [], notes: [], consent_given_at: "2026-09-22T19:00:00.000Z", created_by: "u-gen-sec", owner_id: "u-gen-sec", last_contact_at: "2026-09-24T19:00:00.000Z", created_at: "2026-09-22T19:00:00.000Z" },
];

export const v2Availability: Availability[] = [
  { id: "av-g-gen-sec", user_id: "u-gen-sec", activity: "general", days: [], slots: ["mon:eve", "tue:eve", "wed:aft", "thu:aft", "thu:eve", "fri:am", "sat:am", "sat:aft", "sun:eve"], away: [], updated_at: AT },
  { id: "av-g-ana", user_id: "u-ana", activity: "general", days: [], slots: ["thu:eve", "sat:aft", "sat:am", "sun:eve", "wed:aft"], away: [], updated_at: AT },
  { id: "av-g-sarah", user_id: "u-sarah", activity: "general", days: [], slots: ["tue:eve", "thu:eve", "sat:aft"], away: [], updated_at: AT },
  { id: "av-g-ruth", user_id: "u-ruth", activity: "general", days: [], slots: ["mon:eve", "thu:eve", "sat:am", "sat:aft"], away: [], updated_at: AT },
  { id: "av-g-maria", user_id: "u-maria", activity: "general", days: [], slots: ["thu:aft", "thu:eve", "fri:am", "sun:eve"], away: [], updated_at: AT },
];
