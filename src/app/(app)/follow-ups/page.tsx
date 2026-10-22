"use client";

import { useMemo, useState } from "react";
import { del, patch, post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import type { Comrade, FollowUp } from "@/lib/types";
import { QUIET_DAYS } from "@/lib/follow-through";
import { fmtDay, usePeople } from "@/components/features/primitives";
import { useWorkload } from "@/components/features/workload";
import { HolderPicker } from "@/components/features/holder-picker";
import { useToast } from "@/components/features/toast";
import { usePhones } from "@/components/features/phones";
import { normalizePhone } from "@/lib/phone";
import { waLink } from "@/lib/utils";
import { MessageCircle, Phone } from "lucide-react";
import { Candidates } from "@/components/features/candidates";

/**
 * Who follows up whom. Not tasks with dates — a standing list: everyone the
 * branch is bringing in has one comrade who keeps in touch. "Spoke to them"
 * resets the clock; quiet for {QUIET_DAYS} days gets one nudge.
 */
export default function FollowUpsPage() {
  const actor = useActor();
  const toast = useToast();
  const { name, profiles } = usePeople();
  const [now] = useState(() => Date.now());
  const { data: rows, setData } = useData<FollowUp[]>("/api/follow-ups");
  const { data: comrades } = useData<Comrade[]>("/api/comrades");
  const isOfficer = !!actor?.role.some((r) => r !== "member");
  const { ofComrade } = usePhones();
  const [addingPhone, setAddingPhone] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [phoneText, setPhoneText] = useState("");
  const [tab, setTab] = useState<"yours" | "candidates" | "everyone">("yours");
  const [taking, setTaking] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const person = (id: string) => (comrades ?? []).find((c) => c.id === id);
  const followerName = (f: FollowUp) => (f.follower_id ? name(f.follower_id) : `${person(f.follower_comrade_id ?? "")?.name ?? "Someone"} (no app)`);
  const days = (f: FollowUp) => Math.floor((now - Date.parse(f.last_touched_at ?? f.created_at)) / 86400_000);
  const since = (f: FollowUp) => (f.last_touched_at ? (days(f) === 0 ? "spoke today" : `last spoke ${days(f)} day${days(f) === 1 ? "" : "s"} ago`) : "no catch-up logged yet");

  const mine = (rows ?? []).filter((f) => f.active && f.follower_id === actor?.id).sort((a, b) => days(b) - days(a));
  const helping = (rows ?? []).filter((f) => f.active && f.with_id === actor?.id);
  const groups = useMemo(() => {
    const map = new Map<string, FollowUp[]>();
    for (const f of (rows ?? []).filter((x) => x.active)) {
      const key = f.follower_id ?? `c:${f.follower_comrade_id}`;
      map.set(key, [...(map.get(key) ?? []), f]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rows]);

  async function run(fn: () => Promise<unknown>, message: string) {
    try {
      await fn();
      toast(message);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
    }
    revalidate("/api/follow-ups", "/api/comrades", "/api/inbox");
  }

  const quietCount = mine.filter((f) => days(f) >= QUIET_DAYS).length;
  const candidateCount = (comrades ?? []).filter((c) => c.candidate_since && c.candidate_until && !c.left_at).length;
  const initialsOf = (n: string) =>
    n
      .replace(/^Comrade\s+/i, "")
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  const status = (f: FollowUp) => {
    const quiet = days(f) >= QUIET_DAYS;
    return <span className={"small" + (quiet ? " red" : "")}>{quiet && f.last_touched_at ? `Quiet ${days(f)} days` : since(f).replace(/^./, (c) => c.toUpperCase())}</span>;
  };

  return (
    <div className="screen pg">
      <div className="ph">
        <div>
          <h1>Follow-ups</h1>
          <p className="sub">Who&apos;s keeping in touch with whom.</p>
        </div>
      </div>

      <div className="tabs3">
        <button type="button" className={tab === "yours" ? "on" : ""} onClick={() => setTab("yours")}>
          Yours · {mine.length}
        </button>
        <button type="button" className={tab === "candidates" ? "on" : ""} onClick={() => setTab("candidates")}>
          Candidates · {candidateCount}
        </button>
        <button type="button" className={tab === "everyone" ? "on" : ""} onClick={() => setTab("everyone")}>
          Everyone · {(rows ?? []).filter((f) => f.active).length}
        </button>
      </div>

      {tab === "candidates" && <Candidates followUps={rows ?? []} />}

      {tab === "yours" && (
        <section>
          {quietCount > 0 && (
            <p className="small red" style={{ marginTop: 0 }}>
              {quietCount} gone quiet. A quick message is enough.
            </p>
          )}
          <div className="list">
            {mine.map((f) => {
              const quiet = days(f) >= QUIET_DAYS;
              const who = person(f.person_id);
              const phone = ofComrade(who);
              const isOpen = openId === f.id;
              return (
                <div key={f.id} className="li" style={{ flexWrap: "wrap", gap: 10 }}>
                  <span className="av" style={quiet ? { background: "var(--red)" } : undefined}>
                    {initialsOf(who?.name ?? "?")}
                  </span>
                  <button type="button" className="grow min0" style={{ textAlign: "left", padding: 0, background: "none", border: 0 }} onClick={() => setOpenId(isOpen ? null : f.id)} aria-expanded={isOpen}>
                    <span className="t" style={{ display: "block" }}>
                      {who?.name ?? "Someone"}
                    </span>
                    {status(f)}
                    {f.with_id ? <span className="small"> · with {name(f.with_id)}</span> : null}
                  </button>
                  {phone && (
                    <a className="btn-ic sm" href={waLink(phone)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${who?.name ?? ""}`}>
                      <MessageCircle size={16} />
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn btn-o btn-sm"
                    onClick={() => {
                      setData((p) => (p ?? []).map((x) => (x.id === f.id ? { ...x, last_touched_at: new Date().toISOString() } : x)));
                      void run(() => patch(`/api/follow-ups/${f.id}`, { touch: true }), "Logged");
                    }}
                  >
                    Spoke
                  </button>
                  {isOpen && (
                    <div className="w100 stack6">
                      {f.note && <p className="small" style={{ margin: 0 }}>{f.note}</p>}
                      {phone && (
                        <a className="link small" href={`tel:${phone}`}>
                          <Phone size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> Call
                        </a>
                      )}
                      {!phone && who && !who.profile_id && addingPhone !== who.id && (
                        <button type="button" className="link small" style={{ textAlign: "left" }} onClick={() => (setAddingPhone(who.id), setPhoneText("+44 "))}>
                          + WhatsApp number
                        </button>
                      )}
                      {!phone && who?.profile_id && <p className="small muted" style={{ margin: 0 }}>No number on their profile yet</p>}
                      {addingPhone === who?.id && (
                        <form
                          className="row gap6"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const n = normalizePhone(phoneText);
                            if (!n) return toast("That doesn't look like a number");
                            setAddingPhone(null);
                            void run(() => patch(`/api/comrades/${who.id}`, { phone: n }), "Number saved");
                          }}
                        >
                          <input className="inp grow" type="tel" value={phoneText} onChange={(e) => setPhoneText(e.target.value)} aria-label="WhatsApp number" autoFocus />
                          <button type="submit" className="btn btn-p btn-sm">
                            Save
                          </button>
                        </form>
                      )}
                      <FollowUpDetail f={f} onDone={() => setOpenId(null)} run={run} />
                    </div>
                  )}
                </div>
              );
            })}
            {mine.length === 0 && <p className="nothing">Nobody yet. Take on someone you met: a contact, a new recruit.</p>}
          </div>
          {helping.length > 0 && (
            <div className="stack6 mt8">
              <h4 className="dayh">Going along with</h4>
              {helping.map((f) => (
                <div key={f.id} className="li">
                  <div className="grow min0">
                    <p className="t">
                      {followerName(f)} → {person(f.person_id)?.name ?? "someone"}
                    </p>
                    <p className="small">Show them how you&apos;d do it; next time they lead. {since(f)}</p>
                  </div>
                  <button type="button" className="link small" onClick={() => run(() => patch(`/api/follow-ups/${f.id}`, { with_id: null }), "Stepped back")}>
                    Step back
                  </button>
                </div>
              ))}
            </div>
          )}
          {taking ? (
            <AddFollowUp comrades={comrades ?? []} onAdd={(personName) => (setTaking(false), run(() => post("/api/follow-ups", { person_name: personName }), `You're following up ${personName}`))} />
          ) : (
            <button type="button" className="link small mt8" onClick={() => setTaking(true)}>
              + Take someone on
            </button>
          )}
        </section>
      )}

      {tab === "everyone" && (
        <section>
          {isOfficer &&
            (assigning ? (
              <AssignFollowUp comrades={comrades ?? []} profiles={profiles} onAssign={(body, label) => (setAssigning(false), run(() => post("/api/follow-ups", body), label))} />
            ) : (
              <button type="button" className="link small" onClick={() => setAssigning(true)}>
                + Assign someone
              </button>
            ))}
          <div className="stack8 mt8">
            {groups.map(([key, list]) => (
              <div key={key}>
                <h4 className="dayh">
                  {followerName(list[0])} <span>{list.length}</span>
                </h4>
                <div className="list">
                  {list.map((f) => (
                    <div key={f.id} className="li" style={{ gap: 10 }}>
                      <span className="av" style={days(f) >= QUIET_DAYS ? { background: "var(--red)" } : undefined}>
                        {initialsOf(person(f.person_id)?.name ?? "?")}
                      </span>
                      <div className="grow min0">
                        <p className="t">{person(f.person_id)?.name ?? "Someone"}</p>
                        <p className="small" style={{ margin: 0 }}>
                          {status(f)}
                          {f.with_id ? ` · with ${name(f.with_id)}` : ""}
                        </p>
                      </div>
                      {!f.with_id && f.follower_id && f.follower_id !== actor?.id && (
                        <button type="button" className="link small" onClick={() => run(() => patch(`/api/follow-ups/${f.id}`, { with_id: actor?.id }), "You're going along · it's in your inbox")}>
                          Go along
                        </button>
                      )}
                      {(isOfficer || f.follower_id === actor?.id) && (
                        <button
                          type="button"
                          className="link small muted"
                          onClick={() => {
                            if (!window.confirm(`Stop following up ${person(f.person_id)?.name ?? "them"}?`)) return;
                            setData((p) => (p ?? []).filter((x) => x.id !== f.id));
                            void run(() => del(`/api/follow-ups/${f.id}`), "Removed");
                          }}
                        >
                          End
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {groups.length === 0 && <p className="nothing">No follow-ups yet.</p>}
          </div>
        </section>
      )}
    </div>
  );
}

function AddFollowUp({ comrades, onAdd }: { comrades: Comrade[]; onAdd: (name: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="row gap8 mt8"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onAdd(value.trim());
        setValue("");
      }}
    >
      <datalist id="people-names">
        {comrades.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
      <input className="inp grow" list="people-names" value={value} onChange={(e) => setValue(e.target.value)} placeholder="I'll follow up…" aria-label="Who you'll follow up" />
      <button type="submit" className="btn btn-o btn-sm" disabled={!value.trim()}>
        Add
      </button>
    </form>
  );
}

/** Officers: put someone on a comrade's list (a handover if they had a follower). */
function AssignFollowUp({
  comrades,
  profiles,
  onAssign,
}: {
  comrades: Comrade[];
  profiles: { id: string; name: string }[];
  onAssign: (body: Record<string, string>, label: string) => void;
}) {
  const [who, setWho] = useState("");
  const [by, setBy] = useState("");
  const noApp = comrades.filter((c) => !c.profile_id);
  return (
    <form
      className="stack6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!who.trim() || !by) return;
        const [kind, id] = by.split(":");
        onAssign({ person_name: who.trim(), ...(kind === "p" ? { follower_id: id } : { follower_comrade_id: id }) }, `${who.trim()} assigned`);
        setWho("");
      }}
    >
      <div className="row gap8">
        <input className="inp grow" list="people-names" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Person" aria-label="Person to follow up" />
        <select className="inp grow" value={by} onChange={(e) => setBy(e.target.value)} aria-label="Followed up by">
          <option value="">Followed up by…</option>
          {profiles.map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {p.name}
            </option>
          ))}
          {noApp.map((c) => (
            <option key={c.id} value={`c:${c.id}`}>
              {c.name} (no app)
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-o btn-sm" disabled={!who.trim() || !by}>
          Set
        </button>
      </div>
    </form>
  );
}

/**
 * One person you follow up: what's been talked about (kept, so whoever takes
 * over can carry on), add a note, or hand them over to another comrade.
 */
function FollowUpDetail({ f, onDone, run }: { f: FollowUp; onDone: () => void; run: (fn: () => Promise<unknown>, message: string) => Promise<void> }) {
  const { name, profiles } = usePeople();
  const { hint } = useWorkload();
  const [note, setNote] = useState("");
  const [to, setTo] = useState("");
  const [handNote, setHandNote] = useState("");
  const history = [...(f.notes ?? [])].reverse();
  return (
    <div className="w100 stack6 mt6" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      {history.length > 0 ? (
        <div className="mlog">
          {history.slice(0, 8).map((n, i) => (
            <p key={i}>
              <b>{name(n.by)}</b> {n.text} <span>{fmtDay(n.at)}</span>
            </p>
          ))}
        </div>
      ) : (
        <p className="small" style={{ margin: 0 }}>No notes yet.</p>
      )}
      <form
        className="row gap6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!note.trim()) return;
          void run(() => patch(`/api/follow-ups/${f.id}`, { touch: true, note }), "Noted");
          setNote("");
        }}
      >
        <input className="inp grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you talk about?" aria-label="Note" />
        <button type="submit" className="btn btn-p btn-sm" disabled={!note.trim()}>
          Add
        </button>
      </form>
      <div className="stack6">
        <span className="small" style={{ fontWeight: 700 }}>
          Someone to go with you
        </span>
        <span className="small">First time, or not sure how to start? Bring someone who&apos;s done it before.</span>
        <select
          className="inp"
          value={f.with_id ?? ""}
          onChange={(e) => void run(() => patch(`/api/follow-ups/${f.id}`, { with_id: e.target.value || null }), e.target.value ? "Asked · it's in their inbox" : "Going alone")}
          aria-label="Who's going with you"
        >
          <option value="">Nobody</option>
          {profiles
            .filter((p) => p.id !== f.follower_id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {hint(p.id) ? ` · ${hint(p.id)}` : ""}
              </option>
            ))}
        </select>
      </div>
      <div className="stack6">
        <span className="small" style={{ fontWeight: 700 }}>
          Hand over
        </span>
        <HolderPicker value={to} onChange={setTo} empty="Who takes over?" />
        {to && (
          <>
            <input className="inp" value={handNote} onChange={(e) => setHandNote(e.target.value)} placeholder="Anything they should know (optional)" aria-label="Handover note" />
            <button
              type="button"
              className="btn btn-o btn-sm"
              onClick={() => {
                void run(() => patch(`/api/follow-ups/${f.id}`, { handover_to: to, note: handNote }), "Handed over");
                onDone();
              }}
            >
              Hand over
            </button>
          </>
        )}
      </div>
    </div>
  );
}
