"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import { patch, post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { dayDiff } from "@/lib/dates";
import { CONTACT_TIERS, type Ask, type ContactTier, type Event, type EventReport } from "@/lib/types";
import { firstPart, fmtDay, usePeople } from "./primitives";
import { formatPhone, looksLikePhone, normalizePhone } from "@/lib/phone";
import Link from "next/link";
import { useToast } from "./toast";

type ReportAsk = Extract<Ask, { kind: "report" }>;
type Sheet = { kind: "contact"; eventId?: string } | { kind: "report"; ask: ReportAsk; existing?: EventReport | null } | null;

const SheetContext = createContext<{ openContact: (eventId?: string) => void; openReport: (ask: ReportAsk, existing?: EventReport | null) => void }>({
  openContact: () => {},
  openReport: () => {},
});

export function useSheets() {
  return useContext(SheetContext);
}

/** Events you'd log a contact at — today's stalls, sales and door-knocks. */
const LOGGABLE: Event["event_type"][] = ["uni_stall", "paper_sale", "mobilization", "open_meeting"];

export function SheetProvider({ children }: { children: React.ReactNode }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const value = useMemo(
    () => ({
      openContact: (eventId?: string) => setSheet({ kind: "contact", eventId }),
      openReport: (ask: ReportAsk, existing?: EventReport | null) => setSheet({ kind: "report", ask, existing }),
    }),
    [],
  );
  return (
    <SheetContext.Provider value={value}>
      {children}
      {/* No floating button: it covered rows. Contacts has Add; on the day, the event page has "Log a contact met here". */}
      {sheet?.kind === "contact" && <ContactSheet eventId={sheet.eventId} onClose={() => setSheet(null)} />}
      {sheet?.kind === "report" &&
        (sheet.ask.event.event_type === "reading_group" ? (
          <SessionReportSheet ask={sheet.ask} existing={sheet.existing} onClose={() => setSheet(null)} />
        ) : (
          <ReportSheet ask={sheet.ask} existing={sheet.existing} onClose={() => setSheet(null)} />
        ))}
    </SheetContext.Provider>
  );
}

export function Scrim({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="screen-layer scrim" onClick={onClose}>
      <div className="sheet2" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="row between">
          <h2 className="sh2">{title}</h2>
          <button type="button" className="btn-ic sm" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.25} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Where you met them, when it wasn't one of the app's events. Stored as the contact's source. */
export const CONTACT_SOURCES: { value: string; label: string }[] = [
  { value: "open_meeting", label: "Open meeting" },
  { value: "branch", label: "Branch" },
  { value: "reading_group", label: "Reading group" },
  { value: "paper_sale", label: "Paper sale" },
  { value: "uni_stall", label: "Uni stall" },
  { value: "mobilization", label: "Demo / protest" },
  { value: "social", label: "Social / pub" },
  { value: "online", label: "Online / social media" },
  { value: "referral", label: "Through someone" },
  { value: "other", label: "Somewhere else" },
];

/**
 * Log a contact: where you met (today's stall/sale, a recent event, or a
 * kind of place), name, number (+44 by default), how keen, an optional note.
 * Picking an event makes the contact count toward its report.
 */
function ContactSheet({ eventId, onClose }: { eventId?: string; onClose: () => void }) {
  const toast = useToast();
  const { data: events } = useData<Event[]>("/api/events");
  const [now] = useState(() => Date.now());
  const recent = useMemo(
    () =>
      (events ?? [])
        .filter((e) => !e.archived && e.status !== "off" && e.event_type !== "committee" && dayDiff(e.start_time, now) <= 0 && dayDiff(e.start_time, now) >= -7)
        .sort((a, b) => b.start_time.localeCompare(a.start_time))
        .slice(0, 5),
    [events, now],
  );
  const todays = recent.filter((e) => LOGGABLE.includes(e.event_type) && dayDiff(e.start_time, now) === 0);
  const [picked, setPicked] = useState<string | null>(eventId ?? null);
  const at = picked ?? todays[0]?.id ?? "open_meeting";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+44 ");
  const [note, setNote] = useState("");
  const [tier, setTier] = useState<ContactTier>("potential");
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const evt = (events ?? []).find((e) => e.id === at);
  const source = evt ? evt.event_type : at;
  const normalized = normalizePhone(phone);
  const phoneLooksOff = !!normalized && !looksLikePhone(normalized);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await post("/api/contacts", {
        name: name.trim(),
        phone: normalized ?? undefined,
        about: note.trim() || undefined,
        tier,
        consent: true,
        met_event_id: evt?.id,
        location_type: source,
        met_date: evt ? evt.start_time.slice(0, 10) : new Date().toISOString().slice(0, 10),
      });
      revalidate("/api/contacts", "/api/inbox");
      onClose();
      toast(name.trim().split(/\s+/)[0] + " saved" + (evt ? " · counted for " + firstPart(evt.title, " — ") : ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
      setSaving(false);
    }
  }

  return (
    <Scrim title="Log a contact" onClose={onClose}>
      <span className="kicker">Where you met</span>
      <div className="atrow">
        {recent.map((e) => (
          <button key={e.id} type="button" className={"chip" + (at === e.id ? " on" : "")} onClick={() => setPicked(e.id)}>
            {firstPart(e.title, " — ")}
            {dayDiff(e.start_time, now) === 0 ? "" : ` · ${fmtDay(e.start_time).split(" ")[0]}`}
          </button>
        ))}
      </div>
      <select className="inp" value={evt ? "" : at} onChange={(e) => e.target.value && setPicked(e.target.value)} aria-label="Or where">
        <option value="">{evt ? "Or somewhere else…" : "Where?"}</option>
        {CONTACT_SOURCES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <div className="fieldset">
        <input className="big" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoComplete="off" />
        <input
          className="big"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => normalized && setPhone(formatPhone(normalized))}
          placeholder="WhatsApp number"
          aria-label="WhatsApp number"
        />
      </div>
      {phoneLooksOff && <p className="small red">That doesn&apos;t look like a full number — check it, or clear it.</p>}
      <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) — what you talked about" aria-label="Note" />
      <div className="tabs3">
        {CONTACT_TIERS.map((t) => (
          <button key={t.value} type="button" className={tier === t.value ? "on" : ""} onClick={() => setTier(t.value)}>
            {t.label}
          </button>
        ))}
      </div>
      <button type="button" className={"consent" + (ok ? " on" : "")} onClick={() => setOk(!ok)} aria-pressed={ok}>
        <span className="box">{ok && <Check size={14} strokeWidth={2.5} />}</span>
        <span>They&apos;re OK with me noting that we met.</span>
      </button>
      {error && <p className="err">{error}</p>}
      <button type="button" className="btn btn-p w100" disabled={!ok || !name.trim() || saving} onClick={save}>
        Save
      </button>
      <Link className="link" href="/import" onClick={onClose} style={{ textAlign: "center" }}>
        Got a list? Import several at once
      </Link>
    </Scrim>
  );
}

function Stepper({ label, value, set }: { label: string; value: number; set: (n: number) => void }) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <div className="row">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} onClick={() => set(Math.max(0, value - 1))}>
          <Minus size={16} />
        </button>
        <b>{value}</b>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => set(value + 1)}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

/** After a reading group session: who came and what to take further (Nell's "who attended, any questions?"). */
function SessionReportSheet({ ask, existing, onClose }: { ask: ReportAsk; existing?: EventReport | null; onClose: () => void }) {
  const toast = useToast();
  const { name } = usePeople();
  const [attended, setAttended] = useState(existing?.attended ?? ask.went.length);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      if (existing) await patch(`/api/events/${ask.event.id}/report`, { attended, notes });
      else await post(`/api/events/${ask.event.id}/report`, { attended, notes });
      revalidate("/api/inbox", "/api/agenda", "/api/event-reports");
      onClose();
      toast(existing ? "Report updated" : "Saved · on the next branch agenda");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
      setSaving(false);
    }
  }

  return (
    <Scrim title={`${ask.event.title} · ${fmtDay(ask.event.start_time)}`} onClose={onClose}>
      <p className="small">{ask.went.length ? ask.went.map(name).join(", ") + " said they'd come." : "Nobody marked themselves going."}</p>
      <Stepper label="People came" value={attended} set={setAttended} />
      <textarea
        className="inp"
        style={{ height: 90, padding: 10 }}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Questions to take further, who to follow up — e.g. workers' militia, what to do with the police"
        aria-label="Questions and follow-ups"
      />
      {error && <p className="err">{error}</p>}
      <button type="button" className="btn btn-p w100" disabled={saving} onClick={save}>
        Save
      </button>
    </Scrim>
  );
}

/** The lead's one prompt after a sale. Totals go to the next branch agenda by themselves. */
function ReportSheet({ ask, existing, onClose }: { ask: ReportAsk; existing?: EventReport | null; onClose: () => void }) {
  const toast = useToast();
  const { name } = usePeople();
  const session = ask.event.event_type === "reading_group";
  const [sold, setSold] = useState(existing?.sold ?? 0);
  const [money, setMoney] = useState(existing ? String(existing.money) : "");
  const [contacts, setContacts] = useState(existing?.contacts ?? ask.contactsLogged);
  const [attended, setAttended] = useState(existing?.attended ?? ask.went.length);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const date = fmtDay(ask.event.start_time);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = session ? { attended, contacts, notes } : { sold, money: Number(money || 0), contacts, notes };
      if (existing) await patch(`/api/events/${ask.event.id}/report`, body);
      else await post(`/api/events/${ask.event.id}/report`, body);
      revalidate("/api/inbox", "/api/agenda", "/api/event-reports");
      onClose();
      toast(existing ? "Report updated" : "Saved · added to the next branch agenda");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
      setSaving(false);
    }
  }

  return (
    <Scrim title={`${session ? "Reading group" : ask.event.event_type === "uni_stall" ? "Stall" : "Paper sale"} · ${date}`} onClose={onClose}>
      <p className="small">{ask.went.length ? ask.went.map(name).join(", ") + " said they'd go." : "Nobody marked themselves going."}</p>
      {session ? (
        <Stepper label="How many came" value={attended} set={setAttended} />
      ) : (
        <>
          <Stepper label="Copies sold" value={sold} set={setSold} />
          <div className="stepper">
            <span>Money taken</span>
            <div className="row">
              <span className="muted">£</span>
              <input className="money" inputMode="decimal" value={money} onChange={(e) => setMoney(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" aria-label="Money taken in pounds" />
            </div>
          </div>
        </>
      )}
      <Stepper label="Contacts made" value={contacts} set={setContacts} />
      <p className="small">{ask.contactsLogged} were logged in the app on the day.</p>
      <label className="fld">
        <span>{session ? "What was discussed, and what to take further" : "How it went"}</span>
        <textarea
          className="inp"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={session ? "The main points, questions that came up, who to follow up" : "Good spot or not, the conversations, anything to change next time"}
        />
      </label>
      {error && <p className="err">{error}</p>}
      <button type="button" className="btn btn-p w100" disabled={saving} onClick={save}>
        Save report
      </button>
    </Scrim>
  );
}
