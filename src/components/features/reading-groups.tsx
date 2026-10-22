"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { revalidate, useData } from "@/lib/hooks";
import { del, patch, post } from "@/lib/client";
import { useActor } from "@/lib/actor-context";
import { isUpcoming, byStartAsc } from "@/lib/dates";
import type {
  Comrade,
  Contact,
  Event,
  Material,
  ReadingGroup,
  ReadingGroupAudience,
  ReadingGroupContact,
  ReadingGroupGuest,
  ReadingGroupInvite,
  ReadingGroupLevel,
  ReadingGroupMember,
} from "@/lib/types";
import { contactTier, RG_AUDIENCE_LABEL, RG_LEVEL_LABEL } from "@/lib/types";
import { bookOf, canRunGroup, DEFAULT_CAPACITY, groupStats, LEAD_RATIO, sameBook } from "@/lib/reading-groups";
import { CURRICULUM } from "@/data/curriculum";
import { IDOM_ISSUES } from "@/data/idom";
import { LocationInput } from "@/components/location-input";
import { useRsvps } from "@/lib/use-rsvps";
import { fmtDay, fmtTime, SectionHead, usePeople } from "./primitives";
import { useToast } from "./toast";

/*
 * Reading groups, put together on purpose: each says what it reads, when,
 * where, who it's for and the plan; leads invite people (or add new recruits
 * who aren't on the app yet) and members ask to join with a note. Sessions are
 * events, so RSVPs, reminders and the short "who came, what to take further"
 * report come for free. Proposed topics gather interest until someone leads.
 */

type Draft = {
  title: string;
  book: string;
  schedule: string;
  location: string;
  audience: ReadingGroupAudience | "";
  level: ReadingGroupLevel | "";
  plan: string;
  capacity: string;
};

const emptyDraft: Draft = { title: "", book: "", schedule: "", location: "", audience: "", level: "", plan: "", capacity: String(DEFAULT_CAPACITY) };

export function ReadingGroupsSection() {
  const actor = useActor();
  const toast = useToast();
  const { name, me, profiles } = usePeople();
  const [now] = useState(() => Date.now());
  const { data: groups, setData: setGroups } = useData<ReadingGroup[]>("/api/reading-groups");
  const { data: members } = useData<ReadingGroupMember[]>("/api/reading-group-members");
  const { data: groupContacts, setData: setGroupContacts } = useData<ReadingGroupContact[]>("/api/reading-group-contacts");
  const { data: guests } = useData<ReadingGroupGuest[]>("/api/reading-group-guests");
  const { data: invites } = useData<ReadingGroupInvite[]>("/api/reading-group-invites");
  const { data: comrades } = useData<Comrade[]>("/api/comrades");
  const { data: myContacts } = useData<Contact[]>("/api/contacts");
  const { data: events } = useData<Event[]>("/api/events");
  const { data: materials } = useData<Material[]>("/api/materials");
  const { rsvps } = useRsvps();
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<"start" | "propose" | null>(null);

  const ms = members ?? [];
  const cs = groupContacts ?? [];
  const gs = guests ?? [];
  const inv = (invites ?? []).filter((i) => i.status === "open");
  const all = (groups ?? []).filter((g) => !g.archived);
  const running = all.filter((g) => (g.status ?? "running") === "running");
  const proposed = all.filter((g) => g.status === "proposed");
  const isOfficerRG = !!actor?.role.some((r) => r !== "member");
  const inGroup = (g: ReadingGroup) => ms.some((m) => m.group_id === g.id && m.user_id === me);
  const invitedTo = (g: ReadingGroup) => inv.find((i) => i.group_id === g.id && i.kind === "invite" && i.user_id === me);
  const order = (g: ReadingGroup) => (inGroup(g) ? 0 : invitedTo(g) ? 1 : 2);
  const sorted = [...running].sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));

  const refresh = () =>
    revalidate("/api/reading-groups", "/api/reading-group-members", "/api/reading-group-contacts", "/api/reading-group-guests", "/api/reading-group-invites", "/api/inbox", "/api/events");

  async function run(fn: () => Promise<unknown>, message: string) {
    try {
      await fn();
      toast(message);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
    }
    refresh();
  }

  const nextSession = (g: ReadingGroup) => (events ?? []).filter((e) => e.reading_group_id === g.id && !e.archived && e.status !== "off" && isUpcoming(e, now)).sort(byStartAsc)[0] ?? null;
  const stock = (g: ReadingGroup) => (materials ?? []).filter((m) => m.category === "book" && (sameBook(m.name, bookOf(g)) || m.name.toLowerCase().includes(bookOf(g).toLowerCase())));
  const guestName = (x: ReadingGroupGuest) => (comrades ?? []).find((c) => c.id === x.comrade_id)?.name ?? "Someone";

  return (
    <section>
      <SectionHead title="Reading groups" />
      <p className="small" style={{ margin: "0 0 8px" }}>
        Small and led: up to {DEFAULT_CAPACITY} people, a lead for every {LEAD_RATIO}. Leads invite; you can ask to join.
      </p>
      <div className="matlist">
        {sorted.map((g) => {
          const st = groupStats(g, ms, cs, gs);
          const mine = st.members.find((m) => m.user_id === me);
          const runs = canRunGroup(actor, g, ms);
          const isOpen = open === g.id;
          const next = nextSession(g);
          const invite = invitedTo(g);
          const asked = inv.find((i) => i.group_id === g.id && i.kind === "request" && i.user_id === me);
          const requests = runs ? inv.filter((i) => i.group_id === g.id && i.kind === "request") : [];
          const when = [g.schedule || g.cadence, g.location].filter(Boolean).join(" · ");
          const who = [g.audience ? RG_AUDIENCE_LABEL[g.audience] : null, g.level ? RG_LEVEL_LABEL[g.level] : null].filter(Boolean).join(" · ");
          return (
            <div key={g.id} className={"mat" + (isOpen ? " open" : "")}>
              <button type="button" className="mat-r" onClick={() => setOpen(isOpen ? null : g.id)} aria-expanded={isOpen}>
                <span className="grow min0">
                  <span className="t trunc">
                    {g.title}
                    {mine ? <span className="muted"> · you{mine.is_lead || g.runner_id === me ? " lead" : "'re in"}</span> : invite ? <span className="red"> · you&apos;re invited</span> : null}
                  </span>
                  {when && (
                    <span className="small" style={{ display: "block" }}>
                      {when}
                    </span>
                  )}
                  <span className={"small" + (st.needsLead || (runs && !next) ? " red" : "")} style={{ display: "block" }}>
                    {st.people} of {st.capacity}
                    {st.full ? " · full" : ""}
                    {st.needsLead ? ` · needs ${st.leadsNeeded - st.leads} more lead` : ""}
                    {who ? ` · ${who}` : ""}
                    {next ? ` · next ${fmtDay(next.start_time)}` : " · no session set"}
                    {requests.length ? ` · ${requests.length} asking to join` : ""}
                  </span>
                </span>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {isOpen && (
                <div className="mat-x">
                  <div className="kv">
                    <span>Reading</span>
                    <b>{bookOf(g)}</b>
                    {g.current_chapter && (
                      <>
                        <span>This time</span>
                        <b>{g.current_chapter}</b>
                      </>
                    )}
                    <span>When</span>
                    <b>{g.schedule || g.cadence || "Not set"}</b>
                    <span>Where</span>
                    <b>{g.location || "Not set"}</b>
                    {who && (
                      <>
                        <span>For</span>
                        <b>{who}</b>
                      </>
                    )}
                    <span>Copies</span>
                    <b>{stock(g).length ? stock(g).map((m) => `${m.qty} · ${m.holder_label ?? "branch"}`).join(", ") : "None in stock"}</b>
                  </div>
                  {g.plan && <p className="small" style={{ margin: 0 }}>Plan: {g.plan}</p>}

                  {next ? (
                    <Link className="li li-link" href={`/events/${next.id}`}>
                      <span className="grow min0">
                        <span className="t">
                          Next: {fmtDay(next.start_time)} {fmtTime(next.start_time)}
                        </span>
                        <span className="small" style={{ display: "block" }}>
                          {rsvps.filter((r) => r.event_id === next.id && r.status === "going").length} going · {next.location || "Place TBC"}
                        </span>
                      </span>
                    </Link>
                  ) : (
                    runs && <p className="small red" style={{ margin: 0 }}>No session scheduled — set one so people can say they&apos;re coming.</p>
                  )}
                  {runs && <ScheduleSession group={g} onSaved={() => (refresh(), toast("Session set · members get one notification"))} />}

                  <div className="who">
                    {st.members.map((m) => (
                      <span key={m.id} className="whop">
                        <span className="av">{name(m.user_id).slice(0, 2).toUpperCase()}</span>
                        {name(m.user_id)}
                        {(m.is_lead || m.user_id === g.runner_id) && <span className="muted"> · lead</span>}
                      </span>
                    ))}
                    {st.guests.map((x) => (
                      <span key={x.id} className="whop maybe" title="Not on the app yet">
                        {guestName(x)}
                        {x.is_lead ? " · lead" : ""} (no app)
                        {runs && (
                          <button type="button" aria-label={`Take ${guestName(x)} out`} onClick={() => run(() => del(`/api/reading-group-guests/${x.id}`), "Taken out")}>
                            <X size={12} />
                          </button>
                        )}
                      </span>
                    ))}
                    {st.contacts.filter((c) => c.added_by === me).map((c) => (
                      <span key={c.id} className="whop maybe">
                        {(myContacts ?? []).find((x) => x.id === c.contact_id)?.name.split(/\s+/)[0] ?? "Your contact"} (contact)
                        <button
                          type="button"
                          aria-label="Take them out of the group"
                          onClick={() => {
                            setGroupContacts((p) => (p ?? []).filter((x) => x.id !== c.id));
                            void run(() => del(`/api/reading-group-contacts/${c.id}`), "Taken out of the group");
                          }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {st.contacts.filter((c) => c.added_by !== me).length > 0 && <span className="whop maybe">+{st.contacts.filter((c) => c.added_by !== me).length} contacts</span>}
                    {inv
                      .filter((i) => i.group_id === g.id && i.kind === "invite")
                      .map((i) => (
                        <span key={i.id} className="whop maybe" title="Invited, hasn't answered">
                          {name(i.user_id)}? (invited)
                        </span>
                      ))}
                  </div>

                  {requests.map((r) => (
                    <div key={r.id} className="ask">
                      <span className="ask-k">Wants to join</span>
                      <p className="t" style={{ margin: 0 }}>{name(r.user_id)}</p>
                      {r.note && <p className="small" style={{ margin: 0 }}>“{r.note}”</p>}
                      <div className="row gap8">
                        <button type="button" className="btn btn-p btn-sm grow" onClick={() => run(() => patch(`/api/reading-group-invites/${r.id}`, { accept: true }), `Added ${name(r.user_id)}`)}>
                          Add them
                        </button>
                        <button type="button" className="btn btn-o btn-sm" onClick={() => run(() => patch(`/api/reading-group-invites/${r.id}`, { accept: false }), "Not this time")}>
                          Not this one
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="row gap8 wrap">
                    {invite && (
                      <>
                        <button type="button" className="btn btn-p btn-sm" onClick={() => run(() => patch(`/api/reading-group-invites/${invite.id}`, { accept: true }), "You're in · " + g.title)}>
                          Join
                        </button>
                        <button type="button" className="btn btn-o btn-sm" onClick={() => run(() => patch(`/api/reading-group-invites/${invite.id}`, { accept: false }), "Said not now")}>
                          Not now
                        </button>
                      </>
                    )}
                    {mine && !(mine.is_lead || g.runner_id === me) && (
                      <button type="button" className="btn btn-o btn-sm" onClick={() => run(() => patch(`/api/reading-groups/${g.id}/members`, { is_lead: true }), "You're co-leading")}>
                        I&apos;ll co-lead
                      </button>
                    )}
                    {mine && (
                      <button type="button" className="btn btn-o btn-sm" onClick={() => run(() => del(`/api/reading-groups/${g.id}/members`), "Left " + g.title)}>
                        Leave
                      </button>
                    )}
                    {runs && !mine && (
                      <button type="button" className="btn btn-o btn-sm" onClick={() => run(() => post(`/api/reading-groups/${g.id}/members`, {}), "Joined " + g.title)}>
                        Join
                      </button>
                    )}
                  </div>
                  {!mine && !invite && !runs &&
                    (asked ? (
                      <p className="small" style={{ margin: 0 }}>You asked to join · a lead will answer.</p>
                    ) : st.full ? (
                      <p className="small" style={{ margin: 0 }}>Full. Ask the education officer about the next group on this book.</p>
                    ) : (
                      <AskToJoin onAsk={(note) => run(() => post(`/api/reading-groups/${g.id}/invites`, { request: true, note }), "Asked · the leads will answer")} />
                    ))}

                  {runs && !st.full && (
                    <AddPeople
                      group={g}
                      candidates={profiles.filter((p) => !st.members.some((m) => m.user_id === p.id) && !inv.some((i) => i.group_id === g.id && i.user_id === p.id))}
                      noApp={(comrades ?? []).filter((c) => !c.profile_id && !st.guests.some((x) => x.comrade_id === c.id))}
                      myContacts={(myContacts ?? []).filter((c) => contactTier(c) !== "cold" && !cs.some((x) => x.group_id === g.id && x.contact_id === c.id))}
                      run={run}
                    />
                  )}
                  {!runs && mine && !st.full && (
                    <AddMyContact
                      contacts={(myContacts ?? []).filter((c) => contactTier(c) !== "cold" && !cs.some((x) => x.group_id === g.id && x.contact_id === c.id))}
                      onAdd={(id) => run(() => post(`/api/reading-groups/${g.id}/contacts`, { contact_id: id }), "Added · only you see their name")}
                    />
                  )}
                  {runs && <EditGroup group={g} onSaved={(u) => (setGroups((p) => (p ?? []).map((x) => (x.id === u.id ? u : x))), toast("Saved"))} onFinish={() => run(() => patch(`/api/reading-groups/${g.id}`, { status: "finished" }), "Marked finished")} />}
                </div>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && <p className="nothing">No reading groups running.</p>}
      </div>

      {/* Only when someone has proposed one; an empty box helps nobody. */}
      {proposed.length > 0 && (
      <>
      <h4 className="dayh mt12">Proposed reading groups</h4>
      <p className="small" style={{ margin: "0 0 6px" }}>
        Say you&apos;re interested, or lead it. Ideas for branch discussions go in the{" "}
        <Link className="link" href="/programme">
          branch programme
        </Link>
        .
      </p>
      <div className="matlist">
        {proposed.map((g) => {
          const interested = inv.filter((i) => i.group_id === g.id && i.kind === "request");
          const mineAsk = interested.find((i) => i.user_id === me);
          const leads = groupStats(g, ms, cs, gs).members.filter((m) => m.is_lead || m.user_id === g.runner_id);
          const amLead = leads.some((m) => m.user_id === me);
          return (
            <div key={g.id} className="mat-r" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <span className="grow min0">
                <span className="t">{g.title}</span>
                <span className="small" style={{ display: "block" }}>
                  {bookOf(g) !== g.title ? `${bookOf(g)} · ` : ""}
                  {interested.length} interested{interested.length ? ` (${interested.map((i) => name(i.user_id)).join(", ")})` : ""}
                  {leads.length ? ` · led by ${leads.map((m) => name(m.user_id)).join(", ")}` : " · needs a lead"}
                </span>
              </span>
              <span className="row gap8">
                {!mineAsk && !amLead && (
                  <button type="button" className="btn btn-o btn-sm" onClick={() => run(() => post(`/api/reading-groups/${g.id}/invites`, { request: true }), "Noted · you'll be asked when it starts")}>
                    Interested
                  </button>
                )}
                {!amLead && (
                  <button type="button" className="btn btn-o btn-sm" onClick={() => run(() => post(`/api/reading-groups/${g.id}/members`, { lead: true }), "You're leading it · set a time and place to start")}>
                    I&apos;ll lead
                  </button>
                )}
                {(isOfficerRG || g.created_by === me) && (
                  <button
                    type="button"
                    className="link small"
                    onClick={() => {
                      if (window.confirm(`Remove "${g.title}"?`)) void run(() => del(`/api/reading-groups/${g.id}`), "Removed");
                    }}
                  >
                    Remove
                  </button>
                )}
                {amLead && (
                  <button
                    type="button"
                    className="btn btn-p btn-sm"
                    onClick={() => {
                      setOpen(g.id);
                      void run(() => patch(`/api/reading-groups/${g.id}`, { status: "running" }), "Started · now invite people and set the first session");
                    }}
                  >
                    Start it
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      </>
      )}

      {form ? (
        <GroupForm
          mode={form}
          onCancel={() => setForm(null)}
          onCreated={(g, clash) => {
            if (clash) {
              setForm(null);
              setOpen(clash);
              return;
            }
            if (g) setGroups((p) => [...(p ?? []), g]);
            setForm(null);
            if (g) setOpen(g.id);
            refresh();
            toast(form === "propose" ? "Proposed · people can say they're interested" : "Started · you're leading it");
          }}
        />
      ) : (
        <div className="row gap8 wrap mt8">
          <button type="button" className="btn btn-o btn-sm" onClick={() => setForm("start")} disabled={!actor}>
            Start a group
          </button>
          <button type="button" className="btn btn-o btn-sm" onClick={() => setForm("propose")} disabled={!actor}>
            Propose one
          </button>
        </div>
      )}
    </section>
  );
}

function AskToJoin({ onAsk }: { onAsk: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <form
      className="row gap8"
      onSubmit={(e) => {
        e.preventDefault();
        onAsk(note.trim());
        setNote("");
      }}
    >
      <input className="inp grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the leads (optional) — what you've read" aria-label="Note for the leads" />
      <button type="submit" className="btn btn-p btn-sm">
        Ask to join
      </button>
    </form>
  );
}

function AddMyContact({ contacts, onAdd }: { contacts: Contact[]; onAdd: (id: string) => void }) {
  const [pick, setPick] = useState("");
  if (contacts.length === 0) return null;
  return (
    <div className="row gap8">
      <select className="inp grow" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add one of your contacts">
        <option value="">Add one of your contacts…</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {contactTier(c) === "priority" ? " · priority" : ""}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-o btn-sm" disabled={!pick} onClick={() => (onAdd(pick), setPick(""))}>
        Add
      </button>
    </div>
  );
}

/** A lead's one place to bring people in: invite a comrade, add someone not on the app, or one of their contacts. */
function AddPeople({
  group,
  candidates,
  noApp,
  myContacts,
  run,
}: {
  group: ReadingGroup;
  candidates: { id: string; name: string }[];
  noApp: Comrade[];
  myContacts: Contact[];
  run: (fn: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [invitee, setInvitee] = useState("");
  const [guest, setGuest] = useState("");
  const [guestLead, setGuestLead] = useState(false);
  return (
    <div className="stack6">
      <div className="row gap8">
        <select className="inp grow" value={invitee} onChange={(e) => setInvitee(e.target.value)} aria-label="Invite a comrade">
          <option value="">Invite a comrade…</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-p btn-sm"
          disabled={!invitee}
          onClick={() => {
            const id = invitee;
            setInvitee("");
            void run(() => post(`/api/reading-groups/${group.id}/invites`, { user_id: id }), "Invited · it's in their inbox");
          }}
        >
          Invite
        </button>
      </div>
      <form
        className="row gap8"
        onSubmit={(e) => {
          e.preventDefault();
          if (!guest.trim()) return;
          const n = guest.trim();
          setGuest("");
          void run(() => post(`/api/reading-groups/${group.id}/guests`, { name: n, is_lead: guestLead }), `${n} added`);
        }}
      >
        <datalist id={`noapp-${group.id}`}>
          {noApp.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
        <input className="inp grow" list={`noapp-${group.id}`} value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Someone not on the app" aria-label="Add someone not on the app" />
        <label className="small row gap8" style={{ alignItems: "center" }}>
          <input type="checkbox" checked={guestLead} onChange={(e) => setGuestLead(e.target.checked)} /> lead
        </label>
        <button type="submit" className="btn btn-o btn-sm" disabled={!guest.trim()}>
          Add
        </button>
      </form>
      <AddMyContact contacts={myContacts} onAdd={(id) => run(() => post(`/api/reading-groups/${group.id}/contacts`, { contact_id: id }), "Added · only you see their name")} />
    </div>
  );
}

function ScheduleSession({ group, onSaved }: { group: ReadingGroup; onSaved: () => void }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [when, setWhen] = useState("");
  const [reading, setReading] = useState("");
  const [where, setWhere] = useState(group.location ?? "");
  const [busy, setBusy] = useState(false);
  if (!show) {
    return (
      <button type="button" className="link" style={{ textAlign: "left" }} onClick={() => setShow(true)}>
        Set the next session
      </button>
    );
  }
  return (
    <form
      className="ask stack6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!when) return;
        setBusy(true);
        try {
          await post(`/api/reading-groups/${group.id}/session`, { start_time: new Date(when).toISOString(), reading: reading.trim(), location: where.trim() });
          setShow(false);
          setWhen("");
          setReading("");
          onSaved();
        } catch (err) {
          toast(err instanceof Error ? err.message : "Couldn't save");
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="ask-k">Next session</span>
      <input className="inp" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="When" required />
      <input className="inp" value={reading} onChange={(e) => setReading(e.target.value)} placeholder="Read before — e.g. up to “By what are wages determined?”" aria-label="Reading for this session" />
      <LocationInput value={where} onChange={setWhere} placeholder="Where, or an online link" className="inp" />
      <div className="row gap8">
        <button type="submit" className="btn btn-p btn-sm" disabled={busy || !when}>
          Set it
        </button>
        <button type="button" className="btn btn-o btn-sm" onClick={() => setShow(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function DetailFields({ draft, set }: { draft: Draft; set: (d: Partial<Draft>) => void }) {
  return (
    <>
      <input className="inp" value={draft.schedule} onChange={(e) => set({ schedule: e.target.value })} placeholder="When — e.g. Fridays 4pm, every other Tue" aria-label="When it meets" />
      <LocationInput value={draft.location} onChange={(v) => set({ location: v })} placeholder="Where: Medical School, online…" className="inp" />
      <div className="row gap8">
        <select className="inp grow" value={draft.audience} onChange={(e) => set({ audience: e.target.value as Draft["audience"] })} aria-label="Who it's for">
          <option value="">Who it&apos;s for…</option>
          {(Object.keys(RG_AUDIENCE_LABEL) as ReadingGroupAudience[]).map((k) => (
            <option key={k} value={k}>
              {RG_AUDIENCE_LABEL[k]}
            </option>
          ))}
        </select>
        <select className="inp" style={{ width: 110 }} value={draft.level} onChange={(e) => set({ level: e.target.value as Draft["level"] })} aria-label="Level">
          <option value="">Level…</option>
          {(Object.keys(RG_LEVEL_LABEL) as ReadingGroupLevel[]).map((k) => (
            <option key={k} value={k}>
              {RG_LEVEL_LABEL[k]}
            </option>
          ))}
        </select>
        <input className="inp" style={{ width: 64 }} inputMode="numeric" value={draft.capacity} onChange={(e) => set({ capacity: e.target.value.replace(/\D/g, "") })} aria-label="Max people" title="Max people" />
      </div>
      <textarea className="inp" style={{ height: 70, padding: 10 }} value={draft.plan} onChange={(e) => set({ plan: e.target.value })} placeholder="The plan — sections per session, where it stops" aria-label="Plan" />
    </>
  );
}

function payload(d: Draft) {
  return {
    schedule: d.schedule,
    location: d.location,
    audience: d.audience || null,
    level: d.level || null,
    plan: d.plan,
    capacity: Number(d.capacity) || DEFAULT_CAPACITY,
  };
}

function EditGroup({ group, onSaved, onFinish }: { group: ReadingGroup; onSaved: (g: ReadingGroup) => void; onFinish: () => void }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    ...emptyDraft,
    title: group.title,
    book: bookOf(group),
    schedule: group.schedule ?? group.cadence ?? "",
    location: group.location ?? "",
    audience: group.audience ?? "",
    level: group.level ?? "",
    plan: group.plan ?? "",
    capacity: String(group.capacity ?? DEFAULT_CAPACITY),
  });
  if (!show) {
    return (
      <div className="row gap8">
        <button type="button" className="link" onClick={() => setShow(true)}>
          Edit details
        </button>
        <span className="grow" />
        <button
          type="button"
          className="link"
          onClick={() => {
            if (window.confirm(`Mark "${group.title}" finished? It leaves the list.`)) onFinish();
          }}
        >
          Finished
        </button>
      </div>
    );
  }
  return (
    <form
      className="ask stack6"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const updated = await patch<ReadingGroup>(`/api/reading-groups/${group.id}`, { title: draft.title.trim() || group.title, book: draft.book.trim() || bookOf(group), ...payload(draft) });
          onSaved(updated);
          setShow(false);
        } catch (err) {
          toast(err instanceof Error ? err.message : "Couldn't save");
        }
      }}
    >
      <input className="inp" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Name" aria-label="Group name" />
      <input className="inp" value={draft.book} onChange={(e) => setDraft({ ...draft, book: e.target.value })} placeholder="Text" aria-label="Text" />
      <DetailFields draft={draft} set={(d) => setDraft({ ...draft, ...d })} />
      <div className="row gap8">
        <button type="submit" className="btn btn-p btn-sm">
          Save
        </button>
        <button type="button" className="btn btn-o btn-sm" onClick={() => setShow(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function GroupForm({ mode, onCancel, onCreated }: { mode: "start" | "propose"; onCancel: () => void; onCreated: (g: ReadingGroup | null, clashGroupId?: string) => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [clash, setClash] = useState<{ message: string; groupId: string } | null>(null);
  // The curriculum, then each IDOM issue on its own (a group can read one issue, not just "1 – 44").
  const books = useMemo(() => [...new Set([...CURRICULUM.flatMap((t) => t.items.map((i) => i.title)), ...IDOM_ISSUES])], []);
  const propose = mode === "propose";

  async function submit() {
    setClash(null);
    const title = (propose ? draft.title : draft.title || draft.book).trim();
    const book = (draft.book || draft.title).trim();
    try {
      const res = await fetch("/api/reading-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, book, status: propose ? "proposed" : "running", ...payload(draft) }),
      });
      const body = await res.json();
      if (res.status === 409) return setClash({ message: body.error, groupId: body.group_id });
      if (!res.ok) throw new Error(body.error ?? "Couldn't save");
      onCreated(body as ReadingGroup);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  return (
    <form
      className="ask mt8 stack6"
      onSubmit={(e) => {
        e.preventDefault();
        if ((propose ? draft.title : draft.book).trim()) void submit();
      }}
    >
      <span className="ask-k">{propose ? "Propose a reading group" : "Start a group"}</span>
      <datalist id="books">
        {books.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      {propose ? (
        <>
          <input className="inp" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="What to read together — e.g. Value, Price and Profit" aria-label="Topic" autoFocus />
          <input className="inp" list="books" value={draft.book} onChange={(e) => setDraft({ ...draft, book: e.target.value })} placeholder="Suggested text (optional)" aria-label="Suggested text" />
        </>
      ) : (
        <>
          <input className="inp" list="books" value={draft.book} onChange={(e) => (setDraft({ ...draft, book: e.target.value }), setClash(null))} placeholder="Which text?" aria-label="Text" autoFocus />
          <DetailFields draft={draft} set={(d) => setDraft({ ...draft, ...d })} />
        </>
      )}
      {clash && (
        <div className="row gap8 wrap">
          <p className="small" style={{ margin: 0, color: "var(--ink)" }}>{clash.message}</p>
          <button type="button" className="btn btn-p btn-sm" onClick={() => onCreated(null, clash.groupId)}>
            Show it
          </button>
        </div>
      )}
      <div className="row gap8">
        <button type="submit" className="btn btn-p btn-sm" disabled={!(propose ? draft.title : draft.book).trim()}>
          {propose ? "Propose" : "Start group"}
        </button>
        <button type="button" className="btn btn-o btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
