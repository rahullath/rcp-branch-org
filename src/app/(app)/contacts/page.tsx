"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle, Phone, UserPlus } from "lucide-react";
import { revalidate, useData } from "@/lib/hooks";
import { del, patch, post } from "@/lib/client";
import { useActor } from "@/lib/actor-context";
import { CONTACT_STAGES, CONTACT_TIERS, contactOwner, contactTier, EVENT_TYPE_META, type Contact, type ContactStage, type ContactTier, type Event } from "@/lib/types";
import { shareUrl } from "@/lib/share-url";
import { byStartAsc, dayLabel, isUpcoming } from "@/lib/dates";
import { canManage } from "@/lib/permissions";
import { relativeDaysAgo, waLink } from "@/lib/utils";
import { ContactDetail } from "@/components/contact-detail";
import { Spinner } from "@/components/ui";
import { firstPart, fmtTime, fmtWeekday } from "@/components/features/primitives";
import { useToast } from "@/components/features/toast";
import { CONTACT_SOURCES, useSheets } from "@/components/features/sheets";

/** Quiet this long and a contact shows in red — no daily pestering. */
const STALE_DAYS = 7;
const INVITE_TYPES: Event["event_type"][] = ["open_meeting", "branch", "social", "reading_group"];

export default function ContactsPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center"><Spinner /></div>}>
      <ContactsInner />
    </Suspense>
  );
}

/**
 * Three lists: Priority, Potential, Cold. Cold
 * contacts get no nudges. Only you see your list.
 */
function ContactsInner() {
  const params = useSearchParams();
  const actor = useActor();
  const toast = useToast();
  const { openContact } = useSheets();
  const [now] = useState(() => Date.now());
  const isGs = !!actor?.role.includes("general_secretary");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const url = scope === "all" ? "/api/contacts?scope=all" : "/api/contacts";
  const { data: contacts, loading, setData } = useData<Contact[]>(url);
  const { data: events } = useData<Event[]>("/api/events");
  const [tier, setTier] = useState<ContactTier>("priority");
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(() => params.get("open"));

  // Deep links: /contacts?new=1 (welcome guide) opens the log sheet.
  useEffect(() => {
    if (params.get("new") === "1") openContact();
  }, [params, openContact]);

  // Joined: they're members now, followed up from Follow-ups — off the contacts lists.
  const working = useMemo(() => (contacts ?? []).filter((c) => c.stage !== "joined"), [contacts]);
  const joined = (contacts ?? []).length - working.length;
  const list = useMemo(() => working.filter((c) => contactTier(c) === tier), [working, tier]);
  const invitable = useMemo(
    () => (events ?? []).filter((e) => INVITE_TYPES.includes(e.event_type) && isUpcoming(e, now)).sort(byStartAsc).slice(0, 4),
    [events, now],
  );
  const detailContact = (contacts ?? []).find((c) => c.id === detail) ?? null;

  const quietDays = (c: Contact) => {
    const last = c.last_contact_at ?? c.created_at;
    return Math.floor((now - new Date(last).getTime()) / 86400000);
  };
  const metAt = (c: Contact) => {
    const ev = (events ?? []).find((e) => e.id === c.met_event_id);
    if (ev) return firstPart(ev.title, " — ");
    const src = CONTACT_SOURCES.find((x) => x.value === c.location_type);
    if (src) return src.label;
    if (c.location_type && c.location_type in EVENT_TYPE_META) return EVENT_TYPE_META[c.location_type as Event["event_type"]].label;
    return c.location_type ? c.location_type.replace(/_/g, " ") : "somewhere";
  };

  function update(id: string, data: Partial<Contact>) {
    setData((p) => (p ?? []).map((c) => (c.id === id ? { ...c, ...data } : c)));
  }

  async function touch(c: Contact, note?: string) {
    update(c.id, { last_contact_at: new Date().toISOString() });
    try {
      await patch(`/api/contacts/${c.id}`, { touched: true, ...(c.status === "new" || c.status === "call_today" ? { status: "contacted" } : {}) });
      if (note) await post(`/api/contacts/${c.id}/notes`, { text: note });
    } catch {
      revalidate(url);
    }
  }

  function message(c: Contact) {
    window.open(waLink(c.phone), "_blank", "noopener,noreferrer");
    void touch(c);
  }

  async function invite(c: Contact, e: Event) {
    const win = window.open("", "_blank");
    try {
      // The public link: contacts have no account, so the app address would just ask them to log in.
      const url = await shareUrl(e.id);
      const first = c.name.split(/\s+/)[0];
      const me = (actor?.name ?? "").replace(/^Comrade\s+/i, "").split(" ")[0];
      const when = `${dayLabel(e.start_time, now).toLowerCase()} at ${fmtTime(e.start_time)}`;
      const text = `Hi ${first}, it's ${me}. We're doing ${firstPart(e.title, " — ")} ${when}${e.location ? `, ${firstPart(e.location, ",")}` : ""}. Would you like to come? ${url}`;
      if (win) win.location.href = waLink(c.phone, text);
      await post("/api/event-invites", { event_id: e.id, contact_id: c.id });
      revalidate("/api/event-invites");
      void touch(c, `Invited to ${firstPart(e.title, " — ")} (${dayLabel(e.start_time, now)})`);
      toast("Invite ready in WhatsApp · the inbox asks after if they came");
    } catch (err) {
      win?.close();
      toast(err instanceof Error ? err.message : "Couldn't make the invite");
    }
  }

  async function setStage(c: Contact, stage: ContactStage) {
    update(c.id, { stage });
    toast(stage === "joined" ? `${c.name.split(" ")[0]} joined` : `${c.name.split(" ")[0]} → ${CONTACT_STAGES.find((x) => x.value === stage)?.label}`);
    try {
      await patch(`/api/contacts/${c.id}`, { stage });
    } catch {
      revalidate(url);
    }
  }

  async function moveTo(c: Contact, t: ContactTier) {
    update(c.id, { tier: t });
    setOpen(null);
    toast(`${c.name.split(" ")[0]} → ${CONTACT_TIERS.find((x) => x.value === t)?.label}`);
    try {
      await patch(`/api/contacts/${c.id}`, { tier: t });
    } catch {
      revalidate(url);
    }
  }

  return (
    <div className="screen pg">
      <div className="ph">
        <div>
          <h1>Contacts</h1>
          <p className="sub">{scope === "all" ? "Everyone's contacts. Only officers see this." : "Only you see your list."}</p>
        </div>
        <Link className="btn btn-o btn-sm" href="/import">
          Import
        </Link>
        <button type="button" className="btn btn-p btn-sm" onClick={() => openContact()}>
          <UserPlus size={16} strokeWidth={2.25} />
          Add
        </button>
      </div>

      {isGs && (
        <div className="tabs2">
          <button type="button" className={scope === "mine" ? "on" : ""} onClick={() => setScope("mine")}>
            Mine
          </button>
          <button type="button" className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>
            Everyone
          </button>
        </div>
      )}

      <Funnel contacts={contacts ?? []} />
      {joined > 0 && (
        <p className="small" style={{ margin: 0 }}>
          {joined} joined and moved to{" "}
          <Link className="link" href="/follow-ups">
            Follow-ups
          </Link>
          , with whoever recruited them following them up.
        </p>
      )}

      <div className="tabs3">
        {CONTACT_TIERS.map((t) => (
          <button
            key={t.value}
            type="button"
            className={tier === t.value ? "on" : ""}
            onClick={() => {
              setTier(t.value);
              setOpen(null);
            }}
          >
            {t.label} · {working.filter((c) => contactTier(c) === t.value).length}
          </button>
        ))}
      </div>
      <p className="small" style={{ margin: 0 }}>
        {CONTACT_TIERS.find((t) => t.value === tier)?.hint}
      </p>

      {loading && !contacts ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <p className="nothing">Nobody here yet.</p>
      ) : (
        <div className="matlist">
          {list.map((c) => {
            const quiet = tier !== "cold" && quietDays(c) >= STALE_DAYS;
            const isOpen = open === c.id;
            return (
              <div key={c.id} className={"mat" + (isOpen ? " open" : "")}>
                <div className="mat-r">
                  <button type="button" className="row gap8 grow min0" style={{ textAlign: "left" }} onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen}>
                    <span className="ini">
                      {c.name
                        .split(/\s+/)
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span className="grow min0">
                      <span className="t trunc">{c.name}</span>
                      <span className={"small trunc" + (quiet ? " red" : "")} style={{ display: "block" }}>
                        {c.stage && c.stage !== "met" ? `${CONTACT_STAGES.find((x) => x.value === c.stage)?.label} · ` : ""}
                        {quiet ? `Quiet for ${quietDays(c)} days` : `Met at ${metAt(c)} · last contact ${relativeDaysAgo(c.last_contact_at ?? c.created_at)}`}
                      </span>
                    </span>
                  </button>
                  {c.phone && (
                    <a className="btn-ic" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} aria-label={`Call ${c.name}`} onClick={() => void touch(c)}>
                      <Phone size={17} strokeWidth={2.25} />
                    </a>
                  )}
                  {tier !== "cold" && c.phone && (
                    <button type="button" className="btn-ic red" aria-label={`Message ${c.name} on WhatsApp`} onClick={() => message(c)}>
                      <MessageCircle size={17} strokeWidth={2.25} />
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="mat-x">
                    <p className="small" style={{ margin: 0 }}>
                      Met at {metAt(c)} · last contact {relativeDaysAgo(c.last_contact_at ?? c.created_at)}
                    </p>
                    {c.phone && invitable.length > 0 && (
                      <div className="fld">
                        <span>Invite to</span>
                        <div className="row gap6 wrap">
                          {invitable.map((e) => (
                            <button key={e.id} type="button" className="lchip big" onClick={() => invite(c, e)}>
                              {firstPart(firstPart(e.title, " — "), ":")} · {fmtWeekday(e.start_time)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="fld">
                      <span>Where they&apos;re at</span>
                      <div className="tabs3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                        {CONTACT_STAGES.map((st) => (
                          <button key={st.value} type="button" title={st.hint} className={(c.stage ?? "met") === st.value ? "on" : ""} onClick={() => setStage(c, st.value)}>
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="fld">
                      <span>Move to</span>
                      <div className="tabs3">
                        {CONTACT_TIERS.map((t) => (
                          <button key={t.value} type="button" className={contactTier(c) === t.value ? "on" : ""} onClick={() => moveTo(c, t.value)}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button type="button" className="link" style={{ alignSelf: "flex-start" }} onClick={() => setDetail(c.id)}>
                      Notes, hand over, more
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {detailContact && (
        <ContactDetail
          contact={detailContact}
          canDelete={canManage(actor, contactOwner(detailContact))}
          onClose={() => setDetail(null)}
          onNote={async (c, text) => {
            const updated = await post<Contact>(`/api/contacts/${c.id}/notes`, { text });
            update(c.id, updated);
          }}
          onDelete={async (id) => {
            if (!window.confirm("Delete this contact?")) return;
            await del(`/api/contacts/${id}`);
            setDetail(null);
            setData((p) => (p ?? []).filter((c) => c.id !== id));
          }}
          onHandOver={async (c, ownerId) => {
            const updated = await patch<Contact>(`/api/contacts/${c.id}`, { owner_id: ownerId });
            setDetail(null);
            setData((p) => (p ?? []).flatMap((x) => (x.id !== updated.id ? [x] : scope === "all" ? [updated] : [])));
            toast("Handed over");
          }}
          onInvite={(c, note) => touch(c, note)}
          actorName={actor?.name ?? "A comrade"}
        />
      )}
    </div>
  );
}

/**
 * Met → talked → came → joined. The bulletin's point: the measure is
 * recruits, not numbers collected. Each step is a count of contacts that
 * got at least that far.
 */
function Funnel({ contacts }: { contacts: Contact[] }) {
  const order = CONTACT_STAGES.map((s) => s.value);
  const live = contacts.filter((c) => !c.archived);
  if (live.length === 0) return null;
  const reached = (st: ContactStage) => live.filter((c) => order.indexOf(c.stage ?? "met") >= order.indexOf(st)).length;
  return (
    <div className="row gap6" aria-label="How far your contacts have got">
      {CONTACT_STAGES.map((st, i) => (
        <div key={st.value} className="ask grow" style={{ padding: "6px 8px", textAlign: "center" }} title={st.hint}>
          <p className="lc-k" style={{ margin: 0 }}>
            {st.label}
          </p>
          <p className={"t" + (i === 3 && reached(st.value) ? " red" : "")} style={{ margin: "2px 0 0", fontSize: 18 }}>
            {reached(st.value)}
          </p>
        </div>
      ))}
    </div>
  );
}
