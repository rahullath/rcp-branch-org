"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ChevronRight, ChevronUp, Copy, Pencil, X } from "lucide-react";
import { useData, revalidate } from "@/lib/hooks";
import { del, patch, post } from "@/lib/client";
import { useActor } from "@/lib/actor-context";
import { dueState, londonDay } from "@/lib/follow-through";
import type { AgendaAction, AgendaContribution, AgendaItem, AgendaSection, Comrade, Event, Material, Role } from "@/lib/types";
import { byStartAsc, byStartDesc, isUpcoming } from "@/lib/dates";
import { agendaClosesAt, closesLabel } from "@/lib/meetings";
import { canManage, hasAnyRole } from "@/lib/permissions";
import { formatMeetingAgenda } from "@/lib/summaries";
import { PersonPicker } from "@/components/person-picker";
import { PoliticalItemCard } from "@/components/agenda-political";
import { Spinner } from "@/components/ui";
import { Chev, firstPart, fmtDay, fmtTime, SectionHead, usePeople } from "@/components/v2/primitives";
import { useToast } from "@/components/v2/toast";

/** Mirrors SECTION_ROLE in src/app/api/agenda/[id]/route.ts. */
const SECTION_ROLE: Record<AgendaSection, Role> = {
  paper: "paper_sales_officer",
  political: "education_officer",
  organizational: "organizer",
};

const MEETING_TYPES: Event["event_type"][] = ["branch", "committee"];

/**
 * One standing agenda instead of a new Google Doc each week. Political items
 * come from the education programme; organisational items are open to anyone
 * until the evening before. Action points carry a name and sit in that
 * person's inbox until done.
 */
export default function AgendaPage() {
  const [now] = useState(() => Date.now());
  const actor = useActor();
  const toast = useToast();
  const { name, profiles } = usePeople();
  const { data: items, loading, setData: setItems } = useData<AgendaItem[]>("/api/agenda");
  const { data: events } = useData<Event[]>("/api/events");
  const { data: contributions, setData: setContributions } = useData<AgendaContribution[]>("/api/agenda-contributions");
  const { data: actions, setData: setActions } = useData<AgendaAction[]>("/api/agenda-actions");
  const { data: comrades } = useData<Comrade[]>("/api/comrades");
  // Follow-ups for people without an account yet wait under their name.
  const ownerLabel = (a: AgendaAction) =>
    a.owner_id ? name(a.owner_id) : a.owner_comrade_id ? `${comrades?.find((c) => c.id === a.owner_comrade_id)?.name ?? "Someone"} · no account yet` : "Up for grabs";
  const { data: materials } = useData<Material[]>("/api/materials");
  const [tab, setTab] = useState<"pol" | "org">("org");
  const [picked, setPicked] = useState<string | null>(null);
  const [txt, setTxt] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<string | null>(null);

  const meetings = useMemo(() => (events ?? []).filter((e) => MEETING_TYPES.includes(e.event_type)), [events]);
  const upcoming = useMemo(() => meetings.filter((e) => isUpcoming(e, now)).sort(byStartAsc), [meetings, now]);
  const past = useMemo(() => meetings.filter((e) => !isUpcoming(e, now)).sort(byStartDesc), [meetings, now]);
  const meeting = upcoming.find((m) => m.id === picked) ?? upcoming[0];
  const lastMeeting = past.find((m) => m.event_type === "branch");

  // Standing agenda: items not tied to a meeting roll onto the next one.
  const mine = (items ?? [])
    .filter((i) => !!meeting && (i.event_id === meeting.id || (!i.event_id && meeting.id === upcoming[0]?.id)))
    .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));
  const political = mine.filter((i) => i.section === "political");
  const org = mine.filter((i) => i.section !== "political");
  const isOfficer = !!actor?.role.some((r) => r !== "member");
  const open = !!meeting && (now < agendaClosesAt(meeting).getTime() || isOfficer);
  const takesActions = isOfficer || (!!lastMeeting && (lastMeeting.minutes_id === actor?.id || lastMeeting.chair_id === actor?.id));
  // The minutes check (secretary doc): every open action with its person and date, overdue first,
  // plus what got done since the last branch.
  const today = londonDay(now);
  const rank = (a: AgendaAction) => ({ overdue: 0, today: 1, soon: 2, later: 3, none: 4 })[dueState(a, today)];
  const openActions = (actions ?? []).filter((a) => !a.done).sort((a, b) => rank(a) - rank(b) || (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));
  const sinceLast = lastMeeting ? lastMeeting.start_time : new Date(now - 7 * 86400_000).toISOString();
  const doneRecently = (actions ?? []).filter((a) => a.done && (a.done_at ?? "") >= sinceLast);
  const overdueCount = openActions.filter((a) => dueState(a, today) === "overdue").length;
  const undated = openActions.filter((a) => !a.due_date).length;

  async function addItem(input: Partial<AgendaItem>) {
    if (!meeting) return;
    try {
      const created = await post<AgendaItem>("/api/agenda", {
        event_id: meeting.id,
        meeting_date: meeting.start_time.slice(0, 10),
        ...input,
      });
      setItems((p) => [...(p ?? []), created]);
      toast("Added · the chair sees it");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add");
    }
  }

  async function removeItem(item: AgendaItem) {
    if (!window.confirm(`Remove "${item.title}" from the agenda?`)) return;
    setItems((p) => (p ?? []).filter((i) => i.id !== item.id));
    await del(`/api/agenda/${item.id}`).catch(() => revalidate("/api/agenda"));
  }

  async function patchItem(item: AgendaItem, data: Partial<AgendaItem>) {
    setItems((p) => (p ?? []).map((i) => (i.id === item.id ? { ...i, ...data } : i)));
    await patch(`/api/agenda/${item.id}`, data).catch(() => revalidate("/api/agenda"));
  }

  const linkLabel = (i: AgendaItem) => {
    if (!i.link) return null;
    if (i.link.kind === "event") {
      const e = (events ?? []).find((x) => x.id === i.link!.id);
      return e ? { label: firstPart(e.title, " — "), href: `/events/${e.id}` } : null;
    }
    if (i.link.kind === "material") {
      const m = (materials ?? []).find((x) => x.id === i.link!.id);
      return m ? { label: m.name, href: "/materials" } : null;
    }
    return { label: "From report", href: `/events/${i.link.id}` };
  };

  if (loading && !items) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="v2 pg">
      <div className="ph">
        <div>
          <h1>Agenda</h1>
          <p className="sub">One standing agenda. Each meeting rolls into the archive.</p>
        </div>
        {hasAnyRole(actor, "general_secretary", "organizer", "education_officer") && (
          <Link className="btn btn-o btn-sm" href="/import">
            Import
          </Link>
        )}
        {meeting && mine.length > 0 && (
          <button
            type="button"
            className="btn-ic"
            aria-label="Copy agenda for WhatsApp"
            onClick={() => navigator.clipboard.writeText(formatMeetingAgenda(meeting, mine, profiles)).then(() => toast("Agenda copied"))}
          >
            <Copy size={17} strokeWidth={2.25} />
          </button>
        )}
      </div>

      {!meeting ? (
        <p className="nothing">No branch meeting scheduled. Make one from Events.</p>
      ) : (
        <>
          <Link className="linkcard" href={`/events/${meeting.id}`}>
            <span className="lc-k">
              Next meeting · {fmtDay(meeting.start_time)} {fmtTime(meeting.start_time)}
            </span>
            <span className="t">{meeting.location || "Place TBC"}</span>
            <span className="small">
              {meeting.chair_id ? `Chair ${name(meeting.chair_id)}` : "No chair yet"} · {meeting.minutes_id ? `Minutes ${name(meeting.minutes_id)}` : "No minutes taker"}
            </span>
            <Chev />
          </Link>

          {upcoming.length > 1 && (
            <div className="chips">
              {upcoming.slice(0, 6).map((m) => (
                <button key={m.id} type="button" className={"chip" + (m.id === meeting.id ? " on" : "")} onClick={() => setPicked(m.id)}>
                  {fmtDay(m.start_time)}
                </button>
              ))}
            </div>
          )}

          <div className="tabs2">
            <button type="button" className={tab === "pol" ? "on" : ""} onClick={() => setTab("pol")}>
              Political · {political.length}
            </button>
            <button type="button" className={tab === "org" ? "on" : ""} onClick={() => setTab("org")}>
              Organisational · {org.length}
            </button>
          </div>

          {tab === "pol" ? (
            <section className="stack8">
              <p className="small" style={{ marginTop: 0 }}>
                Set in advance from the education programme. Anyone can add a question or a point to raise.
              </p>
              {political.length === 0 && <p className="nothing">No political item yet.</p>}
              {political.map((item) => (
                <PoliticalItemCard
                  key={item.id}
                  item={item}
                  editable={canManage(actor, item.created_by, SECTION_ROLE.political)}
                  onPatchItem={patchItem}
                  onEdit={() => {
                    const title = window.prompt("Title", item.title);
                    if (title?.trim()) void patchItem(item, { title: title.trim() });
                  }}
                  onDelete={() => removeItem(item)}
                  contributions={(contributions ?? []).filter((c) => c.agenda_item_id === item.id)}
                  profiles={profiles}
                  actor={actor}
                  onAddContribution={async (text) => {
                    const created = await post<AgendaContribution>(`/api/agenda/${item.id}/contributions`, { text });
                    setContributions((p) => [...(p ?? []), created]);
                  }}
                  onDeleteContribution={async (id) => {
                    await del(`/api/agenda-contributions/${id}`);
                    setContributions((p) => (p ?? []).filter((c) => c.id !== id));
                  }}
                />
              ))}
              {hasAnyRole(actor, "education_officer", "general_secretary") && <AddPolitical onAdd={addItem} />}
            </section>
          ) : (
            <section>
              <p className="small" style={{ marginTop: 0, marginBottom: 8 }}>
                Anyone can add until {closesLabel(meeting)}. Chair orders on the day.
              </p>
              <div className="list">
                {org.map((a, i) => {
                  const link = linkLabel(a);
                  // Whoever added it, the officer for the section, the GS, any officer, or the chair can change it.
                  const editable = canManage(actor, a.created_by, SECTION_ROLE[a.section]) || isOfficer || meeting?.chair_id === actor?.id;
                  if (editingId === a.id) {
                    return (
                      <EditOrgItem
                        key={a.id}
                        item={a}
                        meetings={upcoming}
                        onCancel={() => setEditingId(null)}
                        onSave={(data) => {
                          setEditingId(null);
                          void patchItem(a, data);
                          if (data.event_id && data.event_id !== a.event_id) toast("Moved to another meeting");
                        }}
                      />
                    );
                  }
                  return (
                    <div key={a.id} className="agi">
                      <span className="agn">{i + 1}</span>
                      <div className="grow min0">
                        <p className="t">{a.title}</p>
                        <div className="row gap6 wrap mt6">
                          <span className="small" style={{ margin: 0 }}>
                            {a.leadoff_name ? a.leadoff_name.replace(/^Comrade\s+/i, "") : a.created_by ? name(a.created_by) : "—"}
                            {a.duration ? ` · ${a.duration} min` : ""}
                          </span>
                          {link && (
                            <Link className="lchip" href={link.href}>
                              {link.label}
                              <ArrowUpRight size={12} />
                            </Link>
                          )}
                        </div>
                        {a.description && <p className="small" style={{ margin: "4px 0 0" }}>{a.description}</p>}
                      </div>
                      {editable && (
                        <>
                          {i > 0 && (
                            <button
                              type="button"
                              className="btn-ic sm"
                              aria-label={`Move ${a.title} up`}
                              onClick={() => {
                                const prev = org[i - 1];
                                const mine = a.sort_order ?? 99;
                                const theirs = prev.sort_order ?? 99;
                                void patchItem(a, { sort_order: theirs === mine ? theirs - 1 : theirs });
                                void patchItem(prev, { sort_order: mine });
                              }}
                            >
                              <ChevronUp size={16} />
                            </button>
                          )}
                          <button type="button" className="btn-ic sm" aria-label={`Edit ${a.title}`} onClick={() => setEditingId(a.id)}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="btn-ic sm" aria-label={`Remove ${a.title}`} onClick={() => removeItem(a)}>
                            <X size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
                {org.length === 0 && <p className="nothing">Nothing yet. Add the first item.</p>}
              </div>
              {open ? (
                <form
                  className="row gap8 mt8"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!txt.trim()) return;
                    void addItem({ title: txt.trim(), section: "organizational", duration: "5" });
                    setTxt("");
                  }}
                >
                  <input className="inp grow" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Add an item" aria-label="Agenda item" />
                  <button type="submit" className="btn btn-p btn-sm" disabled={!txt.trim()}>
                    Add
                  </button>
                </form>
              ) : (
                <p className="small mt8">Closed for new items. Raise it with the chair.</p>
              )}
            </section>
          )}
        </>
      )}

      <section>
        <div className="row gap8" style={{ alignItems: "baseline" }}>
          <div className="grow">
            <SectionHead title="Actions · check at branch" />
          </div>
          {isOfficer && (
            <Link className="btn btn-o btn-sm" href="/agenda/actions">
              Paste actions
            </Link>
          )}
        </div>
        <p className={"small" + (overdueCount ? " red" : "")} style={{ margin: "0 0 6px" }}>
          {openActions.length} open{overdueCount ? ` · ${overdueCount} overdue` : ""}
          {undated ? ` · ${undated} with no date` : ""}
          {doneRecently.length ? ` · ${doneRecently.length} done since last branch` : ""}
        </p>
        <div className="list">
          {[...openActions, ...doneRecently].map((a) => {
            const st = dueState(a, today);
            if (editingAction === a.id) {
              return (
                <EditAction
                  key={a.id}
                  action={a}
                  onCancel={() => setEditingAction(null)}
                  // The owner can reword or re-date their task; removing it is for whoever recorded it, or an officer.
                  onDelete={a.created_by !== actor?.id && !isOfficer ? undefined : async () => {
                    if (!window.confirm(`Delete "${a.text}"?`)) return;
                    setEditingAction(null);
                    setActions((p) => (p ?? []).filter((x) => x.id !== a.id));
                    await del(`/api/agenda-actions/${a.id}`).catch(() => revalidate("/api/agenda-actions"));
                    revalidate("/api/inbox");
                  }}
                  onSave={async (data) => {
                    setEditingAction(null);
                    setActions((p) => (p ?? []).map((x) => (x.id === a.id ? { ...x, ...data } : x)));
                    await patch(`/api/agenda-actions/${a.id}`, data).catch(() => revalidate("/api/agenda-actions"));
                    revalidate("/api/inbox");
                  }}
                />
              );
            }
            return (
              <div key={a.id} className="li">
                <span className={"tick" + (a.done ? " on" : "")}>{a.done && <Check size={13} strokeWidth={2.5} />}</span>
                <div className="grow min0">
                  <p className={"t" + (a.done ? " struck" : "")}>{a.text}</p>
                  <p className={"small" + (st === "overdue" ? " red" : "")}>
                    {ownerLabel(a)}
                    {a.due_date && !a.done ? ` · ${st === "overdue" ? "overdue, was due" : st === "today" ? "due" : "by"} ${st === "today" ? "today" : fmtDay(`${a.due_date}T12:00:00Z`)}` : ""}
                    {!a.due_date && !a.done ? " · no date" : ""}
                    {a.source ? ` · ${a.source}` : ""}
                    {(a.pushed ?? 0) > 0 && !a.done ? ` · pushed ${a.pushed}×` : ""}
                  </p>
                </div>
                {(a.created_by === actor?.id || a.owner_id === actor?.id || isOfficer) && (
                  <button type="button" className="btn-ic sm" aria-label={`Edit ${a.text}`} onClick={() => setEditingAction(a.id)}>
                    <Pencil size={15} />
                  </button>
                )}
                {(a.owner_id === actor?.id || isOfficer) && !a.done && (
                  <button
                    type="button"
                    className="btn btn-o btn-sm"
                    onClick={async () => {
                      setActions((p) => (p ?? []).map((x) => (x.id === a.id ? { ...x, done: true, done_at: new Date().toISOString() } : x)));
                      await patch(`/api/agenda-actions/${a.id}`, { done: true }).catch(() => revalidate("/api/agenda-actions"));
                      revalidate("/api/inbox");
                    }}
                  >
                    Done
                  </button>
                )}
              </div>
            );
          })}
          {openActions.length + doneRecently.length === 0 && <p className="small">No actions recorded.</p>}
        </div>
        {takesActions && <AddAction meetingId={lastMeeting?.id ?? meeting?.id ?? null} onAdded={(a) => setActions((p) => [...(p ?? []), a])} />}
        <p className="small mt8">Overdue actions show here at branch.</p>
      </section>

      <button type="button" className="li li-link" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
        <span className="grow t">Past meetings</span>
        <span className="small">
          {past
            .slice(0, 3)
            .map((m) => fmtDay(m.start_time).split(" ").slice(1).join(" "))
            .join(", ")}
          {past.length > 3 ? "…" : ""}
        </span>
        <ChevronRight size={16} style={{ transform: showPast ? "rotate(90deg)" : undefined }} />
      </button>
      {showPast && (
        <div className="list">
          {past.slice(0, 20).map((m) => {
            const n = (items ?? []).filter((i) => i.event_id === m.id).length;
            return (
              <Link key={m.id} className="li li-link" href={`/events/${m.id}`}>
                <span className="grow min0">
                  <span className="t trunc">{m.title}</span>
                  <span className="small" style={{ display: "block" }}>
                    {fmtDay(m.start_time)} · {n} item{n === 1 ? "" : "s"}
                  </span>
                </span>
                <ChevronRight size={16} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddPolitical({ onAdd }: { onAdd: (input: Partial<AgendaItem>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [leadoff, setLeadoff] = useState("");
  const [reading, setReading] = useState("");
  if (!open) {
    return (
      <button type="button" className="btn btn-o btn-sm" onClick={() => setOpen(true)}>
        Add political item
      </button>
    );
  }
  return (
    <form
      className="ask"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await onAdd({ title: title.trim(), section: "political", duration: "40", leadoff_name: leadoff || null, reading: reading || null, icon: "forum", sort_order: 2 });
        setOpen(false);
        setTitle("");
        setLeadoff("");
        setReading("");
      }}
    >
      <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Topic" aria-label="Topic" autoFocus />
      <PersonPicker mode="text" value={leadoff} onChange={setLeadoff} placeholder="Lead-off" />
      <input className="inp" value={reading} onChange={(e) => setReading(e.target.value)} placeholder="Reading (optional)" aria-label="Reading" />
      <div className="row gap8">
        <button type="submit" className="btn btn-p btn-sm" disabled={!title.trim()}>
          Add
        </button>
        <button type="button" className="btn btn-o btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddAction({ meetingId, onAdded }: { meetingId: string | null; onAdded: (a: AgendaAction) => void }) {
  const [text, setText] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const toast = useToast();
  return (
    <form
      className="stack6 mt8"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        try {
          const created = await post<AgendaAction>("/api/agenda-actions", { text: text.trim(), ...(owner ? { owner_id: owner } : { open: true }), event_id: meetingId, due_date: due || null });
          onAdded(created);
          setText("");
          setOwner(null);
          setDue("");
          toast(owner ? "Recorded · it's in their inbox" : "Recorded · up for grabs until someone takes it");
          revalidate("/api/inbox");
        } catch (err) {
          toast(err instanceof Error ? err.message : "Couldn't save");
        }
      }}
    >
      <input className="inp" value={text} onChange={(e) => setText(e.target.value)} placeholder="Record an action" aria-label="Action" />
      {/* Person on its own line: squeezed next to the date it read "Whose is". */}
      <PersonPicker mode="id" value={owner} onChange={setOwner} placeholder="Whose? (blank: anyone can take it)" />
      <div className="row gap8">
        <input className="inp grow" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="By when" />
        <button type="submit" className="btn btn-p btn-sm" disabled={!text.trim()}>
          {owner ? "Add" : "Add for anyone"}
        </button>
      </div>
    </form>
  );
}

/** Change an organisational item: what, who brings it, how long, a note, or move it to another meeting. */
function EditOrgItem({
  item,
  meetings,
  onSave,
  onCancel,
}: {
  item: AgendaItem;
  meetings: Event[];
  onSave: (data: Partial<AgendaItem>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [who, setWho] = useState(item.leadoff_name ?? "");
  const [mins, setMins] = useState(item.duration ?? "");
  const [note, setNote] = useState(item.description ?? "");
  const [meetingId, setMeetingId] = useState(item.event_id ?? "");
  return (
    <form
      className="ask stack6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        const target = meetings.find((m) => m.id === meetingId);
        onSave({
          title: title.trim(),
          leadoff_name: who.trim() || null,
          duration: mins.trim() || null,
          description: note.trim() || null,
          ...(target && target.id !== item.event_id ? { event_id: target.id, meeting_date: target.start_time.slice(0, 10) } : {}),
        });
      }}
    >
      <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Item" autoFocus />
      <div className="row gap8">
        <input className="inp grow" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Who brings it (e.g. JB, Ben)" aria-label="Who brings it" />
        <input className="inp" style={{ width: 72 }} inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} placeholder="min" aria-label="Minutes" />
      </div>
      <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" />
      {meetings.length > 1 && (
        <select className="inp" value={meetingId} onChange={(e) => setMeetingId(e.target.value)} aria-label="Meeting">
          {meetings.map((m) => (
            <option key={m.id} value={m.id}>
              {fmtDay(m.start_time)} · {m.title}
            </option>
          ))}
        </select>
      )}
      <div className="row gap8">
        <button type="submit" className="btn btn-p btn-sm" disabled={!title.trim()}>
          Save
        </button>
        <button type="button" className="btn btn-o btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditAction({
  action,
  onSave,
  onCancel,
  onDelete,
}: {
  action: AgendaAction;
  onSave: (data: { text: string; due_date: string | null }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [text, setText] = useState(action.text);
  const [due, setDue] = useState(action.due_date ?? "");
  return (
    <form
      className="ask stack6"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSave({ text: text.trim(), due_date: due || null });
      }}
    >
      <input className="inp" value={text} onChange={(e) => setText(e.target.value)} aria-label="Action" autoFocus />
      <div className="row gap8">
        <input className="inp" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="By when" />
        <span className="grow" />
        {onDelete && (
          <button type="button" className="btn btn-o btn-sm" onClick={onDelete}>
            Delete
          </button>
        )}
        <button type="button" className="btn btn-o btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-p btn-sm" disabled={!text.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}
