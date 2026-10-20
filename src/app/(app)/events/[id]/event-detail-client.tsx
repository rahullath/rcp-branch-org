"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, ChevronRight, Share2, UserPlus, X } from "lucide-react";
import { api, del, patch, post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import {
  CHECKLIST_EVENT_TYPES,
  EVENT_TYPE_META,
  REPORT_EVENT_TYPES,
  REPORT_ROLE,
  eventLead,
  mainDiscussion,
  type AgendaAction,
  type AgendaContribution,
  type AgendaItem,
  type Comrade,
  type EventGuest,
  type EventReport,
  type Event,
  type EventExtras,
  type EventUpdate,
  type Location,
  type Material,
  type Profile,
  type Session,
} from "@/lib/types";
import { relativeDaysAgo } from "@/lib/utils";
import { formatEventSummary, formatMeetingAgenda } from "@/lib/summaries";
import { buildIcs, downloadIcs } from "@/lib/ics";
import { shareOrCopy } from "@/lib/share";
import { dayDiff, isUpcoming } from "@/lib/dates";
import { canRunEvent } from "@/lib/permissions";
import { sessionEvent } from "@/lib/education";
import { dueState, isOff, isTentative, londonDay, tentativeLine } from "@/lib/follow-through";
import { ActionMenu } from "@/components/action-menu";
import { useRsvps } from "@/components/rsvp-buttons";
import { EventModal } from "@/components/event-modal";
import { PhotoForSocial } from "@/components/checklist-modal";
import { PoliticalAgendaCard } from "@/components/political-agenda-card";
import { Av, fmtDay, fmtTime, Rsvp, SectionHead, usePeople } from "@/components/v2/primitives";
import { useWorkload } from "@/components/v2/workload";
import { useToast } from "@/components/v2/toast";
import { useSheets } from "@/components/v2/sheets";
import { ShareSheet } from "@/components/v2/share-sheet";
import { InviteYourPeople } from "@/components/v2/invite-people";
import { EventReadings } from "@/components/v2/event-readings";
import { expectsReading } from "@/lib/preread";
import { BRING_TEMPLATES } from "@/lib/bring-templates";

/**
 * The event page replaces the per-event WhatsApp group: who's coming, the
 * bring list, roles, and the lead's updates (which reach everyone going).
 * Branch meetings link to the agenda, reading groups to the session, and
 * today's stalls to logging a contact and the checklist.
 */
export function EventDetailClient({
  event: initialEvent,
  profiles,
  agendaItems,
  contributions: initialContributions,
}: {
  event: Event;
  profiles: Profile[];
  agendaItems: AgendaItem[];
  contributions: AgendaContribution[];
}) {
  const actor = useActor();
  const router = useRouter();
  const toast = useToast();
  const { openContact, openReport } = useSheets();
  const { me, name, nameIn } = usePeople();
  const [now] = useState(() => Date.now());
  const [event, setEvent] = useState(initialEvent);
  const [contributions, setContributions] = useState(initialContributions);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { rsvps, mine, respond } = useRsvps();
  const { data: extras, setData: setExtras } = useData<EventExtras>("/api/event-extras");
  const { data: materials } = useData<Material[]>("/api/materials");
  const { data: sessions } = useData<Session[]>("/api/sessions");
  const { data: allGuests, setData: setGuests } = useData<EventGuest[]>("/api/event-guests");
  const { data: comrades } = useData<Comrade[]>("/api/comrades");
  const { data: actions, setData: setActions } = useData<AgendaAction[]>("/api/agenda-actions");
  const { data: locations } = useData<Location[]>("/api/locations");
  const { data: report, loading: reportLoading } = useData<EventReport | null>(REPORT_EVENT_TYPES.includes(initialEvent.event_type) ? `/api/events/${initialEvent.id}/report` : null);
  // A spot that needs booking (Harding room, library…): its booking page, right here.
  const bookable = (locations ?? []).find((l) => !!l.book_url && !!event.location && event.location.toLowerCase().startsWith(l.name.toLowerCase()));

  const e = event;
  const meta = EVENT_TYPE_META[e.event_type] ?? EVENT_TYPE_META.branch;
  const lead = eventLead(e);
  const runs = canRunEvent(actor, e);
  const live = isUpcoming(e, now);
  const mineRsvp = mine(e.id);
  const mineStatus = mineRsvp?.status;
  const eventRsvps = useMemo(() => rsvps.filter((r) => r.event_id === e.id), [rsvps, e.id]);
  const going = eventRsvps.filter((r) => r.status === "going").map((r) => r.user_id);
  const maybe = eventRsvps.filter((r) => r.status === "maybe").map((r) => r.user_id);
  // Committee meetings: only officers and invited comrades are asked.
  const isCommittee = e.event_type === "committee";
  const asked = isCommittee ? profiles.filter((p) => p.role.some((r) => r !== "member") || (e.invitees ?? []).includes(p.id)) : profiles;
  const noAns = asked.filter((p) => !eventRsvps.some((r) => r.user_id === p.id)).length;
  const guests = (allGuests ?? []).filter((g) => g.event_id === e.id && g.status !== "no");
  const guestName = (g: EventGuest) => g.name ?? (comrades ?? []).find((c) => c.id === g.comrade_id)?.name ?? "Someone";
  const goingTotal = going.length + guests.filter((g) => g.status === "going").length;
  const prep = (actions ?? []).filter((a) => a.event_id === e.id);
  const today = londonDay(now);
  const bring = (extras?.bring ?? []).filter((b) => b.event_id === e.id);
  const roles = (extras?.roles ?? []).filter((r) => r.event_id === e.id);
  const updates = (extras?.updates ?? []).filter((u) => u.event_id === e.id);
  const session = e.session_id ? (sessions ?? []).find((s) => s.id === e.session_id) : (sessions ?? []).find((s) => sessionEvent(s, [e])?.id === e.id);
  const isToday = dayDiff(e.start_time, now) === 0;
  const logsContacts = ["uni_stall", "paper_sale", "mobilization", "open_meeting"].includes(e.event_type);
  const chair = profiles.find((p) => p.id === e.chair_id);
  // Ticking things off "here" runs from the morning of the event until the day after.
  const onTheDay = isToday || (!live && now - Date.parse(e.start_time) < 24 * 3600_000);
  const usual = (BRING_TEMPLATES[e.event_type] ?? []).filter((l) => !bring.some((b) => (b.label ?? (materials ?? []).find((m) => m.id === b.material_id)?.name ?? "").toLowerCase() === l.toLowerCase()));
  const minutes = profiles.find((p) => p.id === e.minutes_id);

  const setX = (fn: (x: EventExtras) => EventExtras) => setExtras((p) => (p ? fn(p) : p));

  async function act(fn: () => Promise<unknown>, message?: string, urls: string[] = []) {
    try {
      await fn();
      if (message) toast(message);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save that");
    }
    revalidate("/api/event-extras", "/api/inbox", ...urls);
  }

  // Committee meetings and 1-on-1s stay inside; everything else gets a public link.
  const shareable = e.event_type !== "committee" && e.event_type !== "one_on_one";
  async function share() {
    if (shareable) return setSharing(true);
    const result = await shareOrCopy({ title: e.title, text: formatEventSummary(e, rsvps, profiles), url: window.location.href });
    if (result === "copied") toast("Copied — paste it into WhatsApp");
    else if (result === "failed") toast("Couldn't share from this browser");
  }

  function addToCalendar() {
    downloadIcs(
      `${e.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`,
      buildIcs({ uid: e.id, title: e.title, start: e.start_time, location: e.location || undefined, description: e.description || undefined }),
    );
  }

  async function remove() {
    if (!window.confirm(`Delete "${e.title}"${going.length ? ` — ${going.length} going` : ""}?`)) return;
    await del(`/api/events/${e.id}`);
    revalidate("/api/events", "/api/inbox");
    router.push("/events");
  }

  /** Re-read this event — a going RSVP or guest can flip it from tentative to on. */
  async function reload() {
    const list = await api<Event[]>("/api/events").catch(() => null);
    const fresh = list?.find((x) => x.id === e.id);
    if (fresh) setEvent(fresh);
  }

  async function save(input: Partial<Event>) {
    const updated = await patch<Event>(`/api/events/${e.id}`, input);
    setEvent(updated);
    setEditing(false);
    revalidate("/api/events");
  }

  return (
    <div className="v2 pg">
      <div className="ph">
        <Link className="btn-ic" href="/events" aria-label="Back to events">
          <ArrowLeft size={18} strokeWidth={2.25} />
        </Link>
        <div className="grow min0">
          <span className="kicker">
            {meta.label} · {fmtDay(e.start_time)}
          </span>
        </div>
        <button type="button" className="btn-ic" aria-label="Share" onClick={share}>
          <Share2 size={17} strokeWidth={2.25} />
        </button>
        <ActionMenu
          className="shrink-0"
          items={[
            { icon: "calendar_plus", label: "Add to my calendar", onClick: addToCalendar, hidden: !live },
            // The app address needs an account — outside people get the public share link.
            shareable
              ? { icon: "link", label: "Public link (no account needed)", onClick: () => setSharing(true) }
              : { icon: "link", label: "Copy link (members only)", onClick: () => navigator.clipboard.writeText(window.location.href).then(() => toast("Link copied — members only")) },
            { icon: "event_note", label: "Copy agenda", onClick: () => navigator.clipboard.writeText(formatMeetingAgenda(e, agendaItems, profiles)).then(() => toast("Agenda copied")), hidden: agendaItems.length === 0 },
            { icon: "image", label: "Make graphic", onClick: () => router.push(`/graphic?event=${e.id}`) },
            { icon: "edit", label: "Edit", onClick: () => setEditing(true), hidden: !runs },
            { icon: "delete", label: "Delete", onClick: remove, hidden: !runs, danger: true },
          ]}
        />
      </div>

      <div>
        <h1 style={{ fontSize: 24 }}>{e.title}</h1>
        <div className="kv mt12">
          <span>When</span>
          <b>
            {fmtTime(e.start_time)}
            {e.meetup_time ? ` · meet ${fmtTime(e.meetup_time)}` : ""}
          </b>
          <span>Where</span>
          <b>
            {e.location || "TBC"}
            {bookable?.book_url && live && (
              <>
                {" · "}
                <a className="link" href={bookable.book_url} target="_blank" rel="noopener noreferrer">
                  Book it ↗
                </a>
              </>
            )}
          </b>
          <span>Lead</span>
          <b>{name(lead)}</b>
          {chair && (
            <>
              <span>Chair</span>
              <b>{name(chair.id)}</b>
            </>
          )}
          {minutes && (
            <>
              <span>Minutes</span>
              <b>{name(minutes.id)}</b>
            </>
          )}
        </div>
        {e.event_type === "paper_sale" && (e.paper_issue || e.copies_out != null) && (
          <div className="kv mt8">
            {e.paper_issue && (
              <>
                <span>Issue</span>
                <b>{e.paper_issue}</b>
              </>
            )}
            {e.copies_out != null && (
              <>
                <span>Copies taken</span>
                <b>{e.copies_out}</b>
              </>
            )}
          </div>
        )}
        {e.description && <p className="small mt8" style={{ fontSize: 13 }}>{e.description}</p>}
      </div>

      {!live && !isOff(e) && !reportLoading && REPORT_EVENT_TYPES.includes(e.event_type) && (report || runs || roles.some((r) => r.role === REPORT_ROLE && r.user_id === me)) && (
        <section>
          <SectionHead title="How it went" />
          {report ? (
            <div className="li">
              <div className="grow min0">
                <p className="t">
                  {e.event_type === "reading_group"
                    ? `${report.attended ?? 0} came`
                    : `${report.sold} sold${e.copies_out != null ? ` of ${e.copies_out} taken` : ""} · £${report.money} · ${report.contacts} contact${report.contacts === 1 ? "" : "s"}`}
                </p>
                {report.notes && <p className="small">{report.notes}</p>}
              </div>
              <button type="button" className="btn btn-o btn-sm" onClick={() => openReport({ k: `report-${e.id}`, kind: "report", event: e, contactsLogged: report.contacts, went: going }, report)}>
                Edit
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-p btn-sm" onClick={() => openReport({ k: `report-${e.id}`, kind: "report", event: e, contactsLogged: 0, went: going })}>
              Write the report
            </button>
          )}
        </section>
      )}

      {isOff(e) && (
        <div className="ask" style={{ borderColor: "var(--red)" }}>
          <span className="ask-k red">Called off</span>
          <p className="small" style={{ margin: 0 }}>Everyone who said going or maybe was told. Don&apos;t go.</p>
          {runs && live && (
            <button type="button" className="btn btn-o btn-sm" onClick={() => void act(() => save({ status: "on" }), "Back on · everyone going was told")}>
              Put it back on
            </button>
          )}
        </div>
      )}
      {isTentative(e) && (
        <div className="ask" style={{ borderColor: "var(--ink)" }}>
          <span className="ask-k">Only happens with enough people</span>
          <p className="t" style={{ margin: 0 }}>{tentativeLine(e, goingTotal)}</p>
          <p className="small" style={{ margin: 0 }}>
            It&apos;s on the moment {e.target} say going. If not, {lead === me ? "you" : name(lead)} call{lead === me ? "" : "s"} it at the deadline and everyone hears either way.
          </p>
          {runs && live && (
            <div className="row gap8">
              <button type="button" className="btn btn-p btn-sm grow" onClick={() => void act(() => save({ status: "on" }), "It's on · everyone going was told")}>
                It&apos;s on
              </button>
              <button
                type="button"
                className="btn btn-o btn-sm"
                onClick={() => {
                  if (window.confirm(`Call off "${e.title}"? Everyone going or maybe gets told.`)) void act(() => save({ status: "off" }), "Called off · everyone was told");
                }}
              >
                Call it off
              </button>
            </div>
          )}
        </div>
      )}

      {live && !isOff(e) ? (
        <Rsvp
          value={mineStatus}
          onChange={(v) => {
            void respond(e.id, v);
            // Reaching the number flips a tentative event to on server-side.
            if (v === "going" && isTentative(e)) setTimeout(() => void reload(), 800);
          }}
        />
      ) : !live ? (
        <p className="small">This event has passed.</p>
      ) : null}

      <section>
        <SectionHead title={`${live ? "Who's coming" : "Who went"} · ${goingTotal}${e.target ? " of " + e.target : ""}`} />
        <div className="who">
          {going.map((id) => (
            <span key={id} className="whop">
              <Av id={id} />
              {name(id)}
            </span>
          ))}
          {maybe.map((id) => (
            <span key={id} className="whop maybe">
              <Av id={id} className="av-more" />
              {name(id)}?
            </span>
          ))}
          {guests.map((g) => (
            <span key={g.id} className={"whop" + (g.status === "maybe" ? " maybe" : "")} title="Not on the app — marked by an organiser">
              <span className={"av" + (g.status === "maybe" ? " av-more" : "")}>{guestName(g).slice(0, 2).toUpperCase()}</span>
              {guestName(g)}
              {g.status === "maybe" ? "?" : ""}
              {live && (
                <button
                  type="button"
                  aria-label={`Remove ${guestName(g)}`}
                  onClick={() => {
                    setGuests((p) => (p ?? []).filter((x) => x.id !== g.id));
                    void act(() => del(`/api/event-guests/${g.id}`), undefined, ["/api/event-guests"]);
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
          {going.length + maybe.length + guests.length === 0 && <p className="small">Nobody yet.</p>}
        </div>
        {runs && live && !isOff(e) && (
          <AddGuest
            comrades={(comrades ?? []).filter((c) => !c.profile_id)}
            onAdd={async (nameText, status) => {
              await act(async () => {
                await post(`/api/events/${e.id}/guests`, { name: nameText, status });
                await reload();
              }, `${nameText} marked ${status}`, ["/api/event-guests", "/api/comrades", "/api/events"]);
            }}
          />
        )}
        {runs && live && noAns > 0 && (
          <p className="small mt8">
            {noAns} haven&apos;t answered
            {(
              <>
                {" · "}
                <button
                  type="button"
                  className="link"
                  onClick={() =>
                    act(async () => {
                      const r = await post<{ people: number }>(`/api/events/${e.id}/remind`, {});
                      toast(`Reminder sent to ${r.people}`);
                    })
                  }
                >
                  Remind now
                </button>
              </>
            )}
          </p>
        )}
      </section>

      {live && <EventReadings
        event={e}
        live={live}
        canAdd={runs || mineStatus === "going"}
        canManage={runs}
        showWho={runs}
        expected={profiles.filter((p) => expectsReading(e, eventRsvps.find((r) => r.user_id === p.id)?.status)).map((p) => ({ id: p.id, name: p.name }))}
      />}

      {agendaItems.length > 0 && <MeetingAgenda items={agendaItems} contributions={contributions} profiles={profiles} actor={actor} setContributions={setContributions} />}

      {isCommittee && (
        <section>
          <SectionHead title="Committee only" />
          <p className="small" style={{ marginTop: 0 }}>
            Officers see this meeting. Anyone you invite sees this one meeting (and gets it in their calendar), nothing else from the committee.
          </p>
          <div className="who">
            {(e.invitees ?? []).map((id) => (
              <span key={id} className="whop">
                <Av id={id} />
                {name(id)}
                {runs && live && (
                  <button type="button" aria-label={`Uninvite ${name(id)}`} onClick={() => void act(() => save({ invitees: (e.invitees ?? []).filter((x) => x !== id) }), "Uninvited")}>
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
            {(e.invitees ?? []).length === 0 && <p className="small">No guests.</p>}
          </div>
          {runs && live && (
            <select
              className="inp mt8"
              value=""
              aria-label="Invite a comrade"
              onChange={(ev) => ev.target.value && void act(() => save({ invitees: [...(e.invitees ?? []), ev.target.value] }), "Invited · they'll see it and get a notification")}
            >
              <option value="">Invite a comrade to this meeting…</option>
              {profiles
                .filter((p) => !p.role.some((r) => r !== "member") && !(e.invitees ?? []).includes(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          )}
        </section>
      )}

      {shareable && !isOff(e) && live && <InviteYourPeople event={e} live={live} />}

      {bring.length > 0 && (
        <section>
          <SectionHead title="Bring list" />
          <div className="list">
            {bring.map((b) => {
              const m = (materials ?? []).find((x) => x.id === b.material_id);
              const label = m?.name ?? b.label ?? "Item";
              const missing = m?.status === "missing";
              return (
                <div key={b.id} className="li">
                  <div className="grow min0">
                    <p className="t">
                      {label}
                      {b.qty ? <span className="muted"> ×{b.qty}</span> : ""}
                    </p>
                    {m && (
                      <p className={"small" + (missing ? " red" : "")}>
                        {missing ? "Missing · nobody has confirmed having it" : m.holder_id ? "With " + nameIn(m.holder_id) : (m.holder_label ?? "Branch cupboard")}
                      </p>
                    )}
                  </div>
                  {b.claimed_by && onTheDay ? (
                    <button
                      type="button"
                      className={"btn btn-sm " + (b.brought_at ? "btn-p" : "btn-o")}
                      aria-pressed={!!b.brought_at}
                      title={`${name(b.claimed_by)} said they'd bring it`}
                      onClick={() => {
                        const here = !b.brought_at;
                        setX((x) => ({ ...x, bring: x.bring.map((y) => (y.id === b.id ? { ...y, brought_at: here ? new Date().toISOString() : null } : y)) }));
                        void act(() => patch(`/api/bring/${b.id}`, { here }));
                      }}
                    >
                      {b.brought_at ? "Here ✓" : `Here? · ${name(b.claimed_by)}`}
                    </button>
                  ) : b.claimed_by ? (
                    <span className="claimed">
                      <Av id={b.claimed_by} />
                      {name(b.claimed_by)}
                      {b.claimed_by === me && live && (
                        <button
                          type="button"
                          className="link small"
                          style={{ marginLeft: 6 }}
                          onClick={() => {
                            setX((x) => ({ ...x, bring: x.bring.map((y) => (y.id === b.id ? { ...y, claimed_by: null } : y)) }));
                            void act(() => patch(`/api/bring/${b.id}`, { claim: false }), "Back on the list · the lead can see it");
                          }}
                        >
                          Can&apos;t now
                        </button>
                      )}
                    </span>
                  ) : missing ? (
                    <Link className="btn btn-o btn-sm" href="/materials">
                      Find
                    </Link>
                  ) : live ? (
                    <button
                      type="button"
                      className="btn btn-p btn-sm"
                      onClick={() => {
                        setX((x) => ({ ...x, bring: x.bring.map((y) => (y.id === b.id ? { ...y, claimed_by: me } : y)) }));
                        void act(() => patch(`/api/bring/${b.id}`, { claim: true }), "You're bringing it · materials log updated", ["/api/materials", "/api/material-moves"]);
                      }}
                    >
                      I&apos;ll bring
                    </button>
                  ) : null}
                  {runs && (
                    <button
                      type="button"
                      className="btn-ic sm"
                      aria-label={`Remove ${label}`}
                      onClick={() => {
                        setX((x) => ({ ...x, bring: x.bring.filter((y) => y.id !== b.id) }));
                        void act(() => del(`/api/bring/${b.id}`));
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {onTheDay && bring.length > 0 && (
            <p className="small mt6">
              {bring.filter((b) => b.brought_at).length} of {bring.length} here
              {bring.some((b) => !b.claimed_by) ? " · nobody said they'd bring " + bring.filter((b) => !b.claimed_by).length : ""}
            </p>
          )}
        </section>
      )}

      {roles.some((r) => r.role !== REPORT_ROLE) && (
        <section>
          <SectionHead title="Roles" />
          <div className="list">
            {roles.filter((r) => r.role !== REPORT_ROLE).map((r) => (
              <div key={r.id} className="li">
                <span className="grow t">{r.role}</span>
                {r.user_id ? (
                  <span className="claimed">
                    <Av id={r.user_id} />
                    {name(r.user_id)}
                  </span>
                ) : live ? (
                  <button
                    type="button"
                    className="btn btn-o btn-sm"
                    onClick={() => {
                      setX((x) => ({ ...x, roles: x.roles.map((y) => (y.id === r.id ? { ...y, user_id: me } : y)) }));
                      void act(() => patch(`/api/roles/${r.id}`, { claim: true }), "It's yours · the lead can see it");
                    }}
                  >
                    I&apos;ll do it
                  </button>
                ) : (
                  <span className="small">Nobody</span>
                )}
                {runs && (
                  <button
                    type="button"
                    className="btn-ic sm"
                    aria-label={`Remove ${r.role}`}
                    onClick={() => {
                      setX((x) => ({ ...x, roles: x.roles.filter((y) => y.id !== r.id) }));
                      void act(() => del(`/api/roles/${r.id}`));
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {prep.length > 0 && (
        <section>
          <SectionHead title="Prep · who's doing what by when" />
          <div className="list">
            {prep.map((a) => {
              const st = dueState(a, today);
              const owner = a.owner_id ? name(a.owner_id) : a.owner_comrade_id ? `${(comrades ?? []).find((c) => c.id === a.owner_comrade_id)?.name ?? "Someone"} (no app)` : "Up for grabs";
              return (
                <div key={a.id} className="li">
                  <span className={"tick" + (a.done ? " on" : "")}>{a.done ? "✓" : ""}</span>
                  <div className="grow min0">
                    <p className={"t" + (a.done ? " struck" : "")}>{a.text}</p>
                    <p className={"small" + (st === "overdue" ? " red" : "")}>
                      {owner}
                      {a.due_date ? ` · ${st === "overdue" ? "overdue, was" : "by"} ${fmtDay(`${a.due_date}T12:00:00Z`)}` : " · no date"}
                    </p>
                  </div>
                  {!a.done && !a.owner_id && !a.owner_comrade_id && (
                    <button
                      type="button"
                      className="btn btn-p btn-sm"
                      onClick={() => {
                        setActions((p) => (p ?? []).map((x) => (x.id === a.id ? { ...x, owner_id: me ?? null, open_since: null } : x)));
                        void act(() => patch(`/api/agenda-actions/${a.id}`, { claim: true }), "It's yours · thank you", ["/api/agenda-actions"]);
                      }}
                    >
                      I&apos;ll do it
                    </button>
                  )}
                  {!a.done && (a.owner_id || a.owner_comrade_id) && (a.owner_id === me || runs) && (
                    <button
                      type="button"
                      className="btn btn-o btn-sm"
                      onClick={() => {
                        setActions((p) => (p ?? []).map((x) => (x.id === a.id ? { ...x, done: true } : x)));
                        void act(() => patch(`/api/agenda-actions/${a.id}`, { done: true }), "Done", ["/api/agenda-actions"]);
                      }}
                    >
                      Done
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(session || (isToday && logsContacts)) && (
        <section>
          <div className="list">
            {session && (
              <Link className="li li-link" href="/education">
                <BookOpen size={18} />
                <span className="grow t">Reading · {session.topic}</span>
                <ChevronRight size={16} />
              </Link>
            )}
            {isToday && logsContacts && (
              <button type="button" className="li li-link" onClick={() => openContact(e.id)}>
                <UserPlus size={18} />
                <span className="grow t">Log a contact met here</span>
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </section>
      )}

      {updates.length > 0 && (
        <section>
          <SectionHead title="Updates" />
          <div className="list">
            {updates.map((u) => (
              <div key={u.id} className="upd">
                <b>
                  {name(u.author_id)} · {relativeShort(u.created_at)}
                </b>
                <p>{u.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {runs && live && !isOff(e) && (
        // Everything a lead might set up, folded away so the page stays about the event.
        <details className="organise">
          <summary>Organise · updates, bring list, roles, prep</summary>
          <div className="stack8 mt8">
            <p className="small" style={{ margin: 0, fontWeight: 700 }}>Post an update</p>
          <form
            className="row gap8"
            onSubmit={(ev) => {
              ev.preventDefault();
              const text = msg.trim();
              if (!text) return;
              const temp: EventUpdate = { id: "tmp-" + Date.now(), event_id: e.id, author_id: me ?? "", text, created_at: new Date().toISOString() };
              setX((x) => ({ ...x, updates: [temp, ...x.updates] }));
              setMsg("");
              void act(() => post(`/api/events/${e.id}/updates`, { text }), `Sent to ${going.filter((g) => g !== me).length} going`);
            }}
          >
            <input className="inp grow" value={msg} onChange={(ev) => setMsg(ev.target.value)} placeholder="Post an update to everyone going" aria-label="Update" />
            <button type="submit" className="btn btn-p btn-sm" disabled={!msg.trim()}>
              Send
            </button>
          </form>
            <p className="small" style={{ margin: "8px 0 0", fontWeight: 700 }}>Bring list</p>
            {usual.length > 0 && (
              <button
                type="button"
                className="link small"
                style={{ alignSelf: "flex-start" }}
                onClick={() =>
                  act(async () => {
                    for (const label of usual) await post(`/api/events/${e.id}/bring`, { label });
                  }, `Added ${usual.length} · people going will be asked who's bringing what`)
                }
              >
                + The usual: {usual.join(", ")}
              </button>
            )}
            <AddBring eventId={e.id} materials={materials ?? []} onAdded={() => revalidate("/api/event-extras", "/api/inbox")} />
            <p className="small" style={{ margin: "8px 0 0", fontWeight: 700 }}>Roles</p>
            {REPORT_EVENT_TYPES.includes(e.event_type) && (
            <label className="fld">
              <span>Writes the report afterwards</span>
              <select
                className="inp"
                value={roles.find((r) => r.role === REPORT_ROLE)?.user_id ?? ""}
                onChange={(ev) => {
                  const to = ev.target.value;
                  const role = roles.find((r) => r.role === REPORT_ROLE);
                  void act(async () => {
                    if (!to) {
                      if (role) await del(`/api/roles/${role.id}`);
                    } else if (role) await patch(`/api/roles/${role.id}`, { assign: to });
                    else await post(`/api/events/${e.id}/roles`, { role: REPORT_ROLE, user_id: to });
                  }, to ? `${name(to)} writes the report · they'll be asked after` : "You'll write it", ["/api/event-extras"]);
                }}
              >
                <option value="">{lead === me ? "You (the lead)" : "The lead"}</option>
                {[...going.filter((id) => id !== lead), ...profiles.map((p) => p.id).filter((id) => id !== lead && !going.includes(id))].map((id) => (
                  <option key={id} value={id}>
                    {name(id)}
                    {going.includes(id) ? " · going" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
            <AddRole eventId={e.id} onAdded={() => revalidate("/api/event-extras")} />
            <p className="small" style={{ margin: "8px 0 0", fontWeight: 700 }}>Prep · who&apos;s doing what by when</p>
            {(
            <AddPrep
              profiles={profiles}
              comrades={(comrades ?? []).filter((c) => !c.profile_id)}
              defaultDue={e.start_time.slice(0, 10)}
              onAdd={async (body) => {
                await act(async () => {
                  const created = await post<AgendaAction>("/api/agenda-actions", { ...body, event_id: e.id, source: e.title.split(" — ")[0] });
                  setActions((p) => [...(p ?? []), created]);
                }, "Added · it's in their inbox", ["/api/agenda-actions"]);
              }}
            />
          )}
            <div className="list mt8">
              {shareable && (
                <Link className="li li-link" href={`/social-media?event=${e.id}`}>
                  <Share2 size={18} />
                  <span className="grow t">Promote it · plan a post</span>
                  <ChevronRight size={16} />
                </Link>
              )}
              {CHECKLIST_EVENT_TYPES.includes(e.event_type) && <PhotoForSocial event={e} />}
            </div>
          </div>
        </details>
      )}

      {editing && <EventModal event={e} onClose={() => setEditing(false)} onSave={save} />}
      {sharing && <ShareSheet event={e} summary={publicSummary(e)} onClose={() => setSharing(false)} />}
    </div>
  );
}

/** The message that goes with the link — no names, nothing internal. */
function publicSummary(e: Event) {
  const when = `${fmtDay(e.start_time)} ${fmtTime(e.start_time)}`;
  return `${e.title.split(" — ")[0]}\n${when}${e.location ? ` · ${e.location}` : ""}`;
}

function relativeShort(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins} min`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h`;
  return relativeDaysAgo(iso);
}

/** Mark someone who isn't on the app going or maybe — "Ivy, Morgan (maybe)" from the chat. */
function AddGuest({ comrades, onAdd }: { comrades: Comrade[]; onAdd: (name: string, status: "going" | "maybe") => Promise<void> }) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"going" | "maybe">("going");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="row gap8 mt8"
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (!value.trim()) return;
        setBusy(true);
        await onAdd(value.trim(), status);
        setValue("");
        setBusy(false);
      }}
    >
      <datalist id="no-app-people">
        {comrades.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
      <input className="inp grow" list="no-app-people" value={value} onChange={(ev) => setValue(ev.target.value)} placeholder="Someone not on the app" aria-label="Name of someone not on the app" />
      <select className="inp" style={{ width: 84 }} value={status} onChange={(ev) => setStatus(ev.target.value as "going" | "maybe")} aria-label="Going or maybe">
        <option value="going">Going</option>
        <option value="maybe">Maybe</option>
      </select>
      <button type="submit" className="btn btn-o btn-sm" disabled={busy || !value.trim()}>
        Add
      </button>
    </form>
  );
}

/** A prep job with a person and a date — the minutes rule, on the event itself. */
function AddPrep({
  profiles,
  comrades,
  defaultDue,
  onAdd,
}: {
  profiles: Profile[];
  comrades: Comrade[];
  defaultDue: string;
  onAdd: (body: { text: string; owner_id?: string; owner_comrade_id?: string; open?: boolean; due_date: string | null }) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState(defaultDue);
  const { hint } = useWorkload();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack6 mt8"
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (!text.trim() || !owner) return;
        setBusy(true);
        const [kind, id] = owner.split(":");
        await onAdd({ text: text.trim(), ...(kind === "p" ? { owner_id: id } : kind === "c" ? { owner_comrade_id: id } : { open: true }), due_date: due || null });
        setText("");
        setOwner("");
        setBusy(false);
      }}
    >
      <input className="inp" value={text} onChange={(ev) => setText(ev.target.value)} placeholder="e.g. Book a room at the Guild" aria-label="Prep job" />
      <div className="row gap8">
        <select className="inp grow" value={owner} onChange={(ev) => setOwner(ev.target.value)} aria-label="Who">
          <option value="">Who?</option>
          <option value="open">Anyone (ask the branch)</option>
          {profiles.map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {p.name}
              {hint(p.id) ? ` · ${hint(p.id)}` : ""}
            </option>
          ))}
          {comrades.map((c) => (
            <option key={c.id} value={`c:${c.id}`}>
              {c.name} (no app)
            </option>
          ))}
        </select>
        <input className="inp" type="date" style={{ width: 140 }} value={due} onChange={(ev) => setDue(ev.target.value)} aria-label="By when" />
        <button type="submit" className="btn btn-o btn-sm" disabled={busy || !text.trim() || !owner}>
          Add
        </button>
      </div>
    </form>
  );
}

/** Lead adds a material (so claiming moves it) or a free-text item. */
function AddBring({ eventId, materials, onAdded }: { eventId: string; materials: Material[]; onAdded: () => void }) {
  const [value, setValue] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const match = materials.find((m) => m.name.toLowerCase() === value.trim().toLowerCase());
  return (
    <form
      className="row gap8 mt8"
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (!value.trim()) return;
        setBusy(true);
        try {
          await post(`/api/events/${eventId}/bring`, match ? { material_id: match.id, qty } : { label: value.trim(), qty });
          setValue("");
          setQty("");
          onAdded();
        } catch (err) {
          toast(err instanceof Error ? err.message : "Couldn't add");
        } finally {
          setBusy(false);
        }
      }}
    >
      <datalist id={`materials-${eventId}`}>
        {materials.filter((m) => m.category !== "book").map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>
      <input className="inp grow" list={`materials-${eventId}`} value={value} onChange={(ev) => setValue(ev.target.value)} placeholder="Add something to bring" aria-label="Item to bring" />
      <input className="inp" style={{ width: 64 }} value={qty} onChange={(ev) => setQty(ev.target.value)} placeholder="Qty" aria-label="Quantity" />
      <button type="submit" className="btn btn-o btn-sm" disabled={busy || !value.trim()}>
        Add
      </button>
    </form>
  );
}

function AddRole({ eventId, onAdded }: { eventId: string; onAdded: () => void }) {
  const [role, setRole] = useState("");
  const toast = useToast();
  return (
    <form
      className="row gap8 mt8"
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (!role.trim()) return;
        try {
          await post(`/api/events/${eventId}/roles`, { role: role.trim() });
          setRole("");
          onAdded();
        } catch (err) {
          toast(err instanceof Error ? err.message : "Couldn't add");
        }
      }}
    >
      <input className="inp grow" value={role} onChange={(ev) => setRole(ev.target.value)} placeholder="Add a role, e.g. Photos for social" aria-label="Role" />
      <button type="submit" className="btn btn-o btn-sm" disabled={!role.trim()}>
        Add
      </button>
    </form>
  );
}


/** "Paper sale Sat 17 Oct: 1 sold, £5, 1 contact · 6 comrades did…" → the part before the notes. */
const shortLine = (title: string) => title.split(" · ")[0];

/**
 * The meeting's agenda, once. The main discussion as its own card (with the
 * questions box); everything else, including a short "burning questions"
 * slot, as one line each.
 */
function MeetingAgenda({
  items,
  contributions,
  profiles,
  actor,
  setContributions,
}: {
  items: AgendaItem[];
  contributions: AgendaContribution[];
  profiles: Profile[];
  actor: ReturnType<typeof useActor>;
  setContributions: React.Dispatch<React.SetStateAction<AgendaContribution[]>>;
}) {
  const main = mainDiscussion(items, items[0]?.event_id ?? "");
  const rest = (["paper", "political", "organizational"] as const).flatMap((section) =>
    items.filter((i) => i.section === section && i.id !== main?.id).sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99)),
  );
  return (
    <section className="space-y-3">
      <SectionHead title="On the agenda" />
      {main && (
        <PoliticalAgendaCard
          item={main}
          hidePrep
          contributions={contributions.filter((c) => c.agenda_item_id === main.id)}
          profiles={profiles}
          actor={actor}
          onAddContribution={async (text) => {
            const created = await post<AgendaContribution>(`/api/agenda/${main.id}/contributions`, { text });
            setContributions((prev) => [...prev, created]);
          }}
          onDeleteContribution={async (id) => {
            await del(`/api/agenda-contributions/${id}`);
            setContributions((prev) => prev.filter((c) => c.id !== id));
          }}
        />
      )}
      {rest.length > 0 && (
        // The rest (reports, current events, organisational) folded: one line each.
        <details className="organise">
          <summary>
            {main ? "Rest of the agenda" : "Agenda"} · {rest.length} item{rest.length === 1 ? "" : "s"}
          </summary>
          <div className="stack6 mt8">
            {rest.map((item) => (
              <div key={item.id} className="row gap8" style={{ alignItems: "baseline" }}>
                <span className="grow min0 small" style={{ color: "var(--ink)" }}>
                  {shortLine(item.title)}
                </span>
                {item.duration && <span className="small muted">{item.duration} min</span>}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
