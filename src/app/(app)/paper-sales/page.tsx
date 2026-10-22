"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useData } from "@/lib/hooks";
import { patch, post } from "@/lib/client";
import { useActor } from "@/lib/actor-context";
import { useProfiles } from "@/lib/profiles-context";
import { EVENT_TYPE_META, type Availability, type Comrade, type Event, type EventGuest, type EventReport, type Location, type Material } from "@/lib/types";
import { byStartAsc, byStartDesc, dayDiff, isUpcoming } from "@/lib/dates";
import { useRsvps } from "@/lib/use-rsvps";
import { EventModal } from "@/components/event-modal";
import { bestTimes, SLOT_WORD, slotStart, type BestTime } from "@/lib/best-times";
import { SectionHead, StateTag, firstPart, fmtDay, fmtDayNum, fmtMonth, fmtTime, fmtWeekday } from "@/components/features/primitives";
import { LocationGroups } from "@/components/features/locations";
import { useToast } from "@/components/features/toast";
import type { DistrictSale } from "@/lib/district";

const SALE_TYPES: Event["event_type"][] = ["paper_sale", "uni_stall"];
const isPaper = (m: Material) => m.category === "literature" && /^the communist\b(?! manifesto)|\bpaper|\bissue\b/i.test(m.name) && m.qty > 0;

/**
 * Paper sales are events like any other — this page is the view of them
 * that matters for selling: what's coming, who's usually free which day,
 * the papers in hand and who has them, how the last sales went, and every
 * spot we sell at, by area.
 */
export default function PaperSalesPage() {
  const [now] = useState(() => Date.now());
  const actor = useActor();
  const toast = useToast();
  const { profiles } = useProfiles();
  const { data: events, setData } = useData<Event[]>("/api/events");
  const { data: guests } = useData<EventGuest[]>("/api/event-guests");
  const { data: reports } = useData<EventReport[]>("/api/event-reports");
  const { data: locations } = useData<Location[]>("/api/locations");
  // One availability: the weekly grid (mornings / afternoons / evenings). Older "paper sale days" still count for anyone who hasn't filled the grid in.
  const { data: availability } = useData<Availability[]>("/api/availability");
  const { data: materials } = useData<Material[]>("/api/materials");
  const { data: comrades } = useData<Comrade[]>("/api/comrades");
  const { mine, goingCount } = useRsvps();
  const [plan, setPlan] = useState<Partial<Event> | null>(null);

  const sales = (events ?? []).filter((e) => SALE_TYPES.includes(e.event_type) && !e.archived);
  const upcoming = sales.filter((e) => isUpcoming(e, now)).sort(byStartAsc);
  const past = sales.filter((e) => !isUpcoming(e, now)).sort(byStartDesc).slice(0, 6);
  const going = (e: Event) => goingCount(e.id) + (guests ?? []).filter((g) => g.event_id === e.id && g.status === "going").length;

  // The fortnight's best slots: most people usually free, nobody away, no sale there already.
  // Slots already used: sales, plus branch and open meetings (nobody sells through those).
  const busy = [...upcoming, ...(events ?? []).filter((e) => (e.event_type === "branch" || e.event_type === "open_meeting") && !e.archived && isUpcoming(e, now))];
  const best = bestTimes(availability ?? [], profiles.map((p) => p.id), busy, now);
  const anyoneSet = (availability ?? []).some((a) => (a.slots?.length ?? 0) > 0 || (a.activity === "paper_sale" && a.days.length > 0));
  const first = (id: string) => (id === actor?.id ? "you" : (profiles.find((p) => p.id === id)?.name.replace(/^Comrade\s+/i, "").split(/\s+/)[0] ?? "a comrade"));
  const planAt = (t?: BestTime) => setPlan({ event_type: "paper_sale", paper_issue: issue, ...(t ? { start_time: slotStart(t) } : {}) });

  const holder = (m: Material) =>
    profiles.find((p) => p.id === m.holder_id)?.name ?? (comrades ?? []).find((c) => c.id === m.holder_comrade_id)?.name ?? m.holder_label ?? "the branch";
  const papers = (materials ?? []).filter(isPaper);
  const issue = papers[0]?.name;

  async function save(input: Partial<Event>) {
    const created = await post<Event>("/api/events", input);
    setData((p) => [created, ...(p ?? [])]);
    setPlan(null);
    toast("Sale on the calendar · everyone gets one notification");
  }

  const row = (e: Event, isPast = false) => {
    const g = going(e);
    return (
      <Link key={e.id} className={"evcard" + (isPast ? " past" : "")} href={`/events/${e.id}`}>
        <span className={"dateblk" + (!isPast && dayDiff(e.start_time, now) === 0 ? " today" : "")}>
          <b>{fmtDayNum(e.start_time)}</b>
          <span>{isPast ? fmtMonth(e.start_time) : fmtWeekday(e.start_time)}</span>
        </span>
        <span className="grow min0">
          <span className="kicker">
            {EVENT_TYPE_META[e.event_type]?.label ?? e.event_type}
            {e.status === "tentative" && !isPast && <span className="red"> · only if {e.target} go</span>}
            {e.status === "off" && <span className="red"> · called off</span>}
          </span>
          <span className="t" style={{ display: "block" }}>
            {firstPart(e.location || e.title)}
          </span>
          <span className="small" style={{ display: "block" }}>
            {fmtTime(e.start_time)}
            {e.paper_issue ? ` · ${e.paper_issue}` : ""}
          </span>
          <span className="evstat">
            {isPast ? (
              <>
                <span>{g} went</span>
                {/* Sold is what the report says; copies taken is only how many went out. */}
                {(() => {
                  const r = (reports ?? []).find((x) => x.event_id === e.id);
                  return r ? <span>{r.sold} sold</span> : e.copies_out != null ? <span>{e.copies_out} taken</span> : null;
                })()}
              </>
            ) : (
              <span className={e.target && g < e.target ? "warn" : ""}>
                {g}
                {e.target ? ` of ${e.target}` : ""} going
              </span>
            )}
          </span>
        </span>
        {!isPast && <StateTag status={mine(e.id)?.status} />}
      </Link>
    );
  };

  return (
    <div className="screen pg">
      <div className="ph">
        <div className="grow min0">
          <h1>Paper sales</h1>
          <p className="sub">What&apos;s on, who&apos;s free, where we sell.</p>
        </div>
        <button type="button" className="btn btn-p btn-sm" onClick={() => planAt(best[0])}>
          <Plus size={16} /> Plan a sale
        </button>
      </div>

      {papers.length > 0 && (
        <section>
          <SectionHead title="Papers in hand" />
          <div className="stack6">
            {papers.map((m) => (
              <Link key={m.id} className="li li-link" href="/materials">
                <div className="grow min0">
                  <p className="t">
                    {m.qty} × {m.name}
                  </p>
                  <p className="small">
                    With {holder(m)}
                    {m.note ? ` · ${m.note}` : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {actor?.role.some((r) => r !== "member") && <Subscribers />}

      <section>
        <SectionHead title="Coming up" />
        {upcoming.length === 0 ? <p className="nothing">No sales or stalls planned.</p> : <div className="stack8">{upcoming.map((e) => row(e))}</div>}
      </section>

      {best.length > 0 ? (
        <section>
          <SectionHead title="Best times" />
          <div className="stack6">
            {best.map((t) => (
              <div key={`${t.date}-${t.slot}`} className="li">
                <div className="grow min0">
                  <p className="t" style={{ margin: 0 }}>
                    {fmtDay(`${t.date}T12:00:00Z`)} {SLOT_WORD[t.slot]}
                  </p>
                  <p className="small" style={{ margin: 0 }}>
                    {t.people.length} free · {t.people.map(first).join(", ")}
                  </p>
                </div>
                <button type="button" className="btn btn-o btn-sm" onClick={() => planAt(t)}>
                  Plan it
                </button>
              </div>
            ))}
          </div>
          <p className="small mt6">
            From when people are usually free.{" "}
            <Link className="link" href="/availability">
              Set yours
            </Link>
          </p>
        </section>
      ) : (
        <p className="small">
          {anyoneSet ? "No time in the next two weeks with two or more free." : "Nobody has said when they're usually free, so there's nothing to suggest yet."}{" "}
          <Link className="link" href="/availability">
            Set yours
          </Link>
        </p>
      )}

      <OtherBranchSales />


      {past.length > 0 && (
        <section>
          <SectionHead title="Recent" />
          <div className="stack8">{past.map((e) => row(e, true))}</div>
        </section>
      )}

      <section>
        <SectionHead title="Where we sell" />
        <p className="small" style={{ marginTop: 0 }}>
          Every spot, by area. <Link className="link" href="/locations">Add or edit spots</Link>
        </p>
        <LocationGroups
          locations={(locations ?? []).filter((l) => !l.archived)}
          action={(l) => (
            <button type="button" className="link small" onClick={() => setPlan({ event_type: l.category === "uni_stall" ? "uni_stall" : "paper_sale", location: l.name, paper_issue: issue })}>
              Plan a sale here
            </button>
          )}
        />
      </section>

      {plan && <EventModal preset={plan} onClose={() => setPlan(null)} onSave={save} />}
    </div>
  );
}

/**
 * Other branches' sales and stalls in the district. Free on their day and
 * not ours? Go — you're added to their event as "Name (your branch)", so they
 * know who's coming. Nothing else of theirs shows here.
 */
function OtherBranchSales() {
  const toast = useToast();
  const { data, setData } = useData<DistrictSale[]>("/api/district/sales");
  if (!data?.length) return null;
  async function answer(s: DistrictSale, status: "going" | "maybe" | "no") {
    const next = s.mine === status ? "no" : status;
    try {
      await post("/api/district/sales", { event_id: s.id, status: next });
      setData((p) => (p ?? []).map((x) => (x.id === s.id ? { ...x, mine: next === "no" ? null : next, going: x.going + (next === "going" ? 1 : 0) - (x.mine === "going" ? 1 : 0) } : x)));
      toast(next === "no" ? "Taken off their list" : `On ${s.branch}'s list as ${next}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't do that");
    }
  }
  return (
    <section>
      <SectionHead title="Other branches' sales" />
      <p className="small" style={{ marginTop: 0 }}>Free on their day and not ours? Join them — they&apos;ll see you&apos;re coming.</p>
      <div className="stack6">
        {data.map((s) => (
          <div key={s.id} className="li" style={{ flexWrap: "wrap" }}>
            <div className="grow min0">
              <p className="lc-k">
                {s.branch} · {fmtWeekday(s.start_time)} {fmtDayNum(s.start_time)} {fmtMonth(s.start_time)} · {fmtTime(s.start_time)}
              </p>
              <p className="t">{firstPart(s.location || s.title)}</p>
              <p className="small">
                {s.going}
                {s.target ? ` of ${s.target}` : ""} going{s.status === "tentative" ? " · only if enough go" : ""}
              </p>
            </div>
            <div className="row gap6">
              {(["going", "maybe"] as const).map((st) => (
                <button key={st} type="button" className={"btn btn-sm " + (s.mine === st ? "btn-p" : "btn-o")} aria-pressed={s.mine === st} onClick={() => answer(s, st)}>
                  {st === "going" ? "I'll come" : "Maybe"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Who gets print copies, from what they've said in Settings — so the new
 * IDOM or paper goes to them without asking round. If someone isn't actually
 * subscribed, "Not subscribed" quietly sets them back to none.
 */
function Subscribers() {
  const toast = useToast();
  const { profiles, setProfiles } = useProfiles();
  const [open, setOpen] = useState(false);
  const rows = (k: "paper_sub_kind" | "idom_sub_kind") => profiles.filter((p) => p[k] === "physical").sort((a, b) => a.name.localeCompare(b.name));
  const digital = (k: "paper_sub_kind" | "idom_sub_kind") => profiles.filter((p) => p[k] === "digital").length;
  const paper = rows("paper_sub_kind");
  const idom = rows("idom_sub_kind");
  async function clear(id: string, k: "paper_sub_kind" | "idom_sub_kind") {
    setProfiles(profiles.map((p) => (p.id === id ? { ...p, [k]: "none" } : p)));
    try {
      await patch(`/api/profiles/${id}`, { [k]: "none" });
      toast("Taken off the list");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't change it");
    }
  }
  const copy = (title: string, list: typeof paper) => navigator.clipboard.writeText(`${title}:\n${list.map((p) => `- ${p.name}`).join("\n")}`).then(() => toast("List copied"));
  return (
    <section>
      <SectionHead title="Print subscribers" action={open ? "Hide" : "Show"} onAction={() => setOpen((v) => !v)} />
      <p className="small" style={{ marginTop: 0 }}>
        Paper: {paper.length} print, {digital("paper_sub_kind")} digital · IDOM: {idom.length} print, {digital("idom_sub_kind")} digital. From what people set in Settings.
      </p>
      {open &&
        ([
          ["The Communist", "paper_sub_kind", paper],
          ["In Defence of Marxism", "idom_sub_kind", idom],
        ] as const).map(([title, k, list]) => (
          <div key={k} className="mt8">
            <div className="row between" style={{ alignItems: "baseline" }}>
              <p className="t" style={{ margin: 0 }}>
                {title} <span className="muted">· {list.length}</span>
              </p>
              {list.length > 0 && (
                <button type="button" className="link small" onClick={() => copy(title, list)}>
                  Copy list
                </button>
              )}
            </div>
            <div className="stack6 mt6">
              {list.map((p) => (
                <div key={p.id} className="li">
                  <span className="grow t">{p.name}</span>
                  <button type="button" className="link small muted" onClick={() => clear(p.id, k)}>
                    Not subscribed
                  </button>
                </div>
              ))}
              {list.length === 0 && <p className="small">Nobody yet.</p>}
            </div>
          </div>
        ))}
    </section>
  );
}
