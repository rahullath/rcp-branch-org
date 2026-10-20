import type { Actor } from "./auth";
import type { BringItem, Event, EventUpdate, Material, Poll } from "./types";
import { allMemberIds, committeeIds, sendPush, type PushPayload } from "./push";
import { shortTitle } from "./data-v2";
import { listRsvps } from "./data";

/*
 * The notification rules:
 * - everyone gets one push per new event, with Going / Can't on it;
 * - one reminder 48h before, only if you haven't answered (cron);
 * - lead updates only go to people going;
 * - bring-list gaps the day before, only to people going (cron);
 * - polls: one push each. Quiet hours are respected per person.
 */

const first = (name: string) => name.replace(/^Comrade\s+/i, "").split(/\s+/)[0];

function when(e: Event) {
  const d = new Date(e.start_time);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return `${day} ${time}`;
}

export function rsvpPayload(e: Event, title: string, body: string): PushPayload {
  return {
    title,
    body,
    url: `/events/${e.id}`,
    tag: `rsvp-${e.id}`,
    actions: [
      { action: "rsvp-going", title: "Going" },
      { action: "rsvp-no", title: "Can't" },
    ],
    data: { eventId: e.id, askKey: `rsvp-${e.id}` },
  };
}

export function bringPayload(e: Event, item: BringItem, material: Material | null): PushPayload {
  const name = material?.name ?? item.label ?? "Something";
  return {
    title: `${shortTitle(e.title)} needs ${name.toLowerCase()}`,
    body: `${item.qty ? `${item.qty} ` : ""}${name} unclaimed.${material?.holder_label ? ` It's at ${material.holder_label}.` : ""}`,
    url: `/events/${e.id}`,
    tag: `bring-${item.id}`,
    actions: [
      { action: "bring-claim", title: "I'll bring" },
      { action: "bring-skip", title: "Not me" },
    ],
    data: { eventId: e.id, itemId: item.id, askKey: `bring-${item.id}` },
  };
}

/** The branch an event's notifications go to — null (everyone) for district/national events. */
const audience = (actor: Actor, e: Pick<Event, "scope" | "branch_id">) => (e.scope && e.scope !== "branch" ? null : (e.branch_id ?? actor.branch?.id ?? null));

export async function notifyNewEvent(actor: Actor, e: Event) {
  // Committee meetings: only officers and whoever was invited hear about them.
  const ids = e.event_type === "committee" ? await committeeIds(audience(actor, e), e.invitees ?? []) : await allMemberIds(audience(actor, e));
  const others = ids.filter((id) => id !== actor.id);
  await sendPush(
    others,
    "new_events",
    rsvpPayload(e, `New: ${shortTitle(e.title)} — ${when(e)}`, `${e.location || "Place TBC"}. ${first(actor.name)} is leading.`),
  );
}

/** Invited to a committee meeting: one push, with Going / Can't. */
export async function notifyInvited(actor: Actor, e: Event, ids: string[]) {
  if (!ids.length) return;
  await sendPush(ids, "new_events", rsvpPayload(e, `${first(actor.name)} invited you: ${shortTitle(e.title)} — ${when(e)}`, `${e.location || "Place TBC"}. Committee meeting.`));
}

export async function notifyLeadUpdate(actor: Actor, e: Event, update: EventUpdate) {
  const going = (await listRsvps()).filter((r) => r.event_id === e.id && r.status === "going" && r.user_id !== actor.id);
  await sendPush(
    going.map((r) => r.user_id),
    "lead_updates",
    { title: `${first(actor.name)} · ${shortTitle(e.title)}`, body: update.text, url: `/events/${e.id}`, tag: `update-${e.id}`, actions: [{ action: "open", title: "Open" }] },
  );
}

export async function notifyPoll(actor: Actor, poll: Poll) {
  const others = (await allMemberIds(actor.branch?.id ?? null)).filter((id) => id !== actor.id);
  await sendPush(others, "polls", {
    title: `${first(actor.name)} asks: ${poll.question}`,
    body: poll.closes_at ? `Closes ${new Date(poll.closes_at).toLocaleDateString("en-GB", { weekday: "long" })}.` : "Tap an answer.",
    url: "/inbox",
    tag: `poll-${poll.id}`,
    // Notifications show two buttons at most — longer polls open the inbox.
    actions: poll.options.length <= 2 ? poll.options.map((o, i) => ({ action: `vote-${i}` as const, title: o })) : [{ action: "open", title: "Vote" }],
    data: { pollId: poll.id, options: poll.options, askKey: `poll-${poll.id}` },
  });
}

export async function notifyMaterialAsk(actor: Actor, material: Material, userId: string) {
  await sendPush([userId], "bring_gaps", {
    title: `Still got ${/^the\s/i.test(material.name) ? material.name : `the ${material.name.toLowerCase()}`}?`,
    body: `${first(actor.name)} is looking for them. Tap if you have them.`,
    url: "/materials",
    tag: `material-${material.id}`,
    actions: [{ action: "open", title: "Open" }],
  });
}

/* ============================= follow-through ============================= */

/** Reached its number (or the lead kept it on): everyone going hears it's happening. */
export async function notifyEventOn(e: Event, userIds: string[], going: number) {
  await sendPush(userIds, "lead_updates", {
    title: `It's on: ${shortTitle(e.title)}`,
    body: `${going} going · ${when(e)} · ${e.location || "Place TBC"}`,
    url: `/events/${e.id}`,
    tag: `status-${e.id}`,
    actions: [{ action: "open", title: "Open" }],
  });
}

/** Called off: everyone who said going or maybe hears, so nobody turns up alone. */
/** The lead changed when or where: one push to everyone going or maybe. */
export async function notifyEventMoved(actor: Actor, before: Event, e: Event, userIds: string[]) {
  const timeMoved = before.start_time !== e.start_time;
  const placeMoved = (before.location ?? "") !== (e.location ?? "");
  const what = [timeMoved ? `now ${when(e)}` : null, placeMoved ? `now at ${e.location || "a place TBC"}` : null].filter(Boolean).join(", ");
  await sendPush(
    userIds.filter((id) => id !== actor.id),
    "lead_updates",
    { title: `Changed: ${shortTitle(e.title)}`, body: `${what.charAt(0).toUpperCase()}${what.slice(1)}.`, url: `/events/${e.id}`, tag: `moved-${e.id}`, actions: [{ action: "open", title: "Open" }] },
  );
}

export async function notifyEventOff(actor: Actor, e: Event, userIds: string[]) {
  await sendPush(
    userIds.filter((id) => id !== actor.id),
    "lead_updates",
    { title: `Called off: ${shortTitle(e.title)}`, body: `${first(actor.name)} called it off — not enough people. Don't go.`, url: `/events/${e.id}`, tag: `status-${e.id}`, actions: [{ action: "open", title: "Open" }] },
  );
}

/** Deadline passed and it's short: the lead decides. */
export async function notifyDecide(e: Event, going: number, leadId: string) {
  await sendPush([leadId], "lead_updates", {
    title: `Call it: ${shortTitle(e.title)}`,
    body: `${going} of ${e.target} going and the deadline's passed. Keep it on or call it off?`,
    url: "/inbox",
    tag: `decide-${e.id}`,
    actions: [{ action: "open", title: "Decide" }],
  });
}

export async function notifyReadingInvite(actor: Actor, groupTitle: string, userId: string) {
  await sendPush([userId], "new_events", {
    title: `${first(actor.name)} invited you: ${groupTitle}`,
    body: "Reading group. Join or say not now.",
    url: "/inbox",
    tag: `rg-invite-${groupTitle}`,
    actions: [{ action: "open", title: "Open" }],
  });
}

export async function notifyReadingRequest(actor: Actor, groupTitle: string, leadIds: string[]) {
  await sendPush(leadIds, "new_events", {
    title: `${first(actor.name)} wants to join ${groupTitle}`,
    body: "Add them or say not this time.",
    url: "/inbox",
    tag: `rg-request-${groupTitle}-${actor.id}`,
    actions: [{ action: "open", title: "Open" }],
  });
}
