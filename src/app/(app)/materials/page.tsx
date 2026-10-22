"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { del, patch, post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import type { Material, MaterialMove } from "@/lib/types";
import { canManage } from "@/lib/permissions";
import { AddMaterialModal, PURPOSES } from "@/components/material-modal";
import { HolderPicker, useHolderName } from "@/components/features/holder-picker";
import { Spinner } from "@/components/ui";
import { Scrim } from "@/components/features/sheets";
import { fmtDay, usePeople } from "@/components/features/primitives";
import { useToast } from "@/components/features/toast";
import { titleKey, wellredUrl } from "@/lib/wellred";
import { catalogueHits, matches } from "@/lib/catalog";
import type { DistrictMaterial } from "@/lib/district";

/** The current paper (The Communist, an issue): tracked like gear, not as book stock. */
const isPaper = (m: Material) => m.category === "literature" && /^the communist\b(?! manifesto)|\bpaper|\bissue\b/i.test(m.name);

/**
 * Where everything is. Missing items sit at the top; every move is logged
 * with a name and date; claiming on a bring list updates this by itself.
 */
export default function MaterialsPage() {
  const actor = useActor();
  const toast = useToast();
  const { name, nameIn, full, me } = usePeople();
  const { data: materials, loading, setData } = useData<Material[]>("/api/materials");
  const { data: moves } = useData<MaterialMove[]>("/api/material-moves");
  const [open, setOpen] = useState<string | null>(null);
  const [passing, setPassing] = useState<string | null>(null);
  const [selling, setSelling] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [handing, setHanding] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [q, setQ] = useState("");
  const holderName = useHolderName();
  const isOfficer = !!actor?.role.some((r) => r !== "member");

  const all = materials ?? [];
  const term = q.trim().toLowerCase();
  const hit = (m: Material) => !term || matches(term, m.name) || (m.note ?? "").toLowerCase().includes(term);
  const missing = all.filter((m) => m.status === "missing" && hit(m));
  const held = all.filter((m) => m.status !== "missing" && m.qty > 0);
  const holderKey = (m: Material) => (m.holder_id ? `p:${m.holder_id}` : m.holder_comrade_id ? `c:${m.holder_comrade_id}` : `l:${m.holder_label ?? "Branch cupboard"}`);
  const KIND_ORDER = (m: Material) => (m.category === "gear" ? 0 : isPaper(m) ? 1 : m.category === "literature" ? 2 : 3);
  // Everything that exists, by who has it — you first, then people, then places.
  const groups = useMemo(() => {
    const map = new Map<string, Material[]>();
    for (const m of held) if (hit(m)) map.set(holderKey(m), [...(map.get(holderKey(m)) ?? []), m]);
    const label = (k: string, m: Material) => (k === `p:${me}` ? "With you" : k.startsWith("l:") ? k.slice(2) : `With ${holderName(m) ?? "someone"}`);
    return [...map.entries()]
      .map(([k, items]) => ({
        k,
        label: label(k, items[0]) + (k.startsWith("l:") ? "" : items[0].holder_label ? ` · ${items[0].holder_label}` : ""),
        items: [...items].sort((x, y) => KIND_ORDER(x) - KIND_ORDER(y) || x.name.localeCompare(y.name)),
        rank: k === `p:${me}` ? 0 : k.startsWith("l:") ? 2 : 1,
      }))
      .sort((x, y) => x.rank - y.rank || y.items.length - x.items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, term, me, holderName]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // The order plan: `wanted` is how many we want in hand; what to order is that minus what we already have.
  const toOrder = all.filter((m) => (m.wanted ?? 0) > 0);
  const haveOf = (m: Material) => held.filter((x) => x.id !== m.id && titleKey(x.name) === titleKey(m.name));
  const needOf = (m: Material) => Math.max(0, (m.wanted ?? 0) - haveOf(m).reduce((n, x) => n + x.qty, 0) - (m.id && m.qty > 0 ? m.qty : 0));
  const orderTotal = toOrder.reduce((n, m) => n + needOf(m), 0);
  const orderHits = term ? toOrder.filter((m) => m.qty <= 0 && hit(m)) : [];
  const suggestions = term ? catalogueHits(term, all.map((m) => m.name)) : [];

  function orderText() {
    const lines: string[] = [];
    for (const purpose of [...PURPOSES, null]) {
      const items = toOrder.filter((m) => (purpose ? m.purpose === purpose : !PURPOSES.includes(m.purpose as (typeof PURPOSES)[number])) && needOf(m) > 0);
      if (!items.length) continue;
      lines.push(`${purpose ?? "Other"}:`);
      for (const m of items) lines.push(`- ${needOf(m)} × ${m.name}${m.note ? ` (${m.note})` : ""}`);
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  /** "Can we get one?" — goes on the order list for whoever places the next order. */
  async function request(itemName: string, kind: "gear" | "book") {
    try {
      const created = await post<Material>("/api/materials", {
        name: itemName,
        category: kind === "book" ? "literature" : "gear",
        qty: 0,
        wanted: 1,
        status: "available",
        purpose: "Good to have",
        note: `Asked for by ${(actor?.name ?? "a comrade").replace(/^Comrade\s+/i, "").split(" ")[0]}`,
      });
      setData((p) => [...(p ?? []), created]);
      toast("On the order list for next time");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add it");
    }
  }

  async function arrived(m: Material) {
    const n = needOf(m);
    try {
      const updated = await patch<Material>(`/api/materials/${m.id}`, {
        qty: m.qty + n,
        wanted: 0,
        holder_id: me,
        holder_comrade_id: null,
        holder_label: null,
        status: "in_use",
      });
      setData((p) => (p ?? []).map((x) => (x.id === m.id ? updated : x)));
      toast(`${n} × ${m.name} in stock · with you`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
    }
  }
  const logOf = useMemo(() => {
    const map = new Map<string, MaterialMove[]>();
    for (const mv of moves ?? []) map.set(mv.material_id, [...(map.get(mv.material_id) ?? []), mv]);
    return map;
  }, [moves]);

  async function move(m: Material, kind: "take" | "found" | "return" | "pass" | "missing" | "sold", to?: string, qty?: number) {
    try {
      const updated = await post<Material>(`/api/materials/${m.id}/move`, { kind, to, qty });
      setData((p) => (p ?? []).map((x) => (x.id === m.id ? updated : x)));
      const part = qty && qty < m.qty ? `${qty} of them` : null;
      toast(
        kind === "return"
          ? "Back in the cupboard"
          : kind === "pass"
            ? `${part ? part[0].toUpperCase() + part.slice(1) : "It's"} with ${name(to)} now`
            : kind === "sold"
              ? `Sold ${qty ?? 1} · ${Math.max(0, m.qty - (qty ?? 1))} left`
              : kind === "missing"
                ? "Marked missing · the last person with it is asked"
                : "Updated · everyone can see it's with you",
      );
      // Part of a pile moved to someone else: their line changed too.
      if (kind === "pass" && part) revalidate("/api/materials");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
    }
    setPassing(null);
    setSelling(null);
    revalidate("/api/material-moves", "/api/inbox");
  }

  /** How many, when there's more than one: a small number box. */
  const howMany = (m: Material) =>
    m.qty > 1 ? (
      <input
        className="inp"
        type="number"
        min={1}
        max={m.qty}
        value={count}
        onChange={(e) => setCount(Math.max(1, Math.min(m.qty, Number(e.target.value) || 1)))}
        aria-label="How many"
        style={{ width: 72 }}
      />
    ) : null;

  async function ask(m: Material) {
    try {
      const r = await post<{ asked: string }>(`/api/materials/${m.id}/ask`, {});
      toast(`Asked ${r.asked.replace(/^Comrade\s+/i, "")} · it's in their inbox`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't ask");
    }
  }

  async function remove(m: Material) {
    if (!window.confirm(`Delete "${m.name}"?`)) return;
    await del(`/api/materials/${m.id}`);
    setData((p) => (p ?? []).filter((x) => x.id !== m.id));
  }

  const where = (m: Material) => {
    if (m.status === "missing") return "Nobody has confirmed having these";
    // holder_label is a place ("Ana's car"); older rows stored the person's name there — don't repeat it.
    const place = m.holder_label && m.holder_label !== full(m.holder_id) && m.holder_label !== "You" ? m.holder_label : null;
    if (m.holder_id) return "With " + nameIn(m.holder_id) + (place && m.holder_id !== me ? " · " + place : "");
    if (m.holder_comrade_id) return "With " + (holderName(m) ?? "someone not on the app") + (place ? " · " + place : "");
    return m.holder_label ?? "Branch cupboard";
  };

  const row = (m: Material) => {
    const log = logOf.get(m.id) ?? [];
    const last = log[0];
    const isOpen = open === m.id;
    const manage = canManage(actor, m.created_by, "finance_officer", "paper_sales_officer");
    return (
      <div key={m.id} className={"mat" + (isOpen ? " open" : "")}>
        <button type="button" className="mat-r" onClick={() => setOpen(isOpen ? null : m.id)} aria-expanded={isOpen}>
          <span className="grow min0">
            <span className="t trunc">
              {m.name}
              {m.qty > 1 && !m.name.includes("×") ? <span className="muted"> · {m.qty.toLocaleString("en-GB")}</span> : ""}
            </span>
            <span className={"small" + (m.status === "missing" ? " red" : "")} style={{ display: "block" }}>
              {where(m)}
            </span>
          </span>
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {isOpen && (
          <div className="mat-x">
            {m.category !== "gear" && wellredUrl(m.name) && (
              <a className="link small" href={wellredUrl(m.name)!} target="_blank" rel="noopener noreferrer">
                On Wellred ↗
              </a>
            )}
            {m.note && <p className="small" style={{ margin: 0 }}>{m.note}</p>}
            {log.length > 0 && (
              <div className="mlog">
                {log.slice(0, 3).map((l) => (
                  <p key={l.id}>
                    <b>{name(l.actor_id)}</b> {l.action} <span>{fmtDay(l.created_at)}</span>
                  </p>
                ))}
              </div>
            )}
            {passing === m.id ? (
              <div className="row gap8">
                {howMany(m)}
                <div className="grow min0">
                  <HolderPicker value="" empty="Who has it now?" onChange={(v) => v && move(m, "pass", v.startsWith("p:") ? v.slice(2) : v, m.qty > 1 ? count : undefined)} />
                </div>
                <button type="button" className="btn btn-o btn-sm" onClick={() => setPassing(null)}>
                  Cancel
                </button>
              </div>
            ) : selling === m.id ? (
              <div className="row gap8" style={{ alignItems: "center" }}>
                {howMany(m)}
                <button type="button" className="btn btn-p btn-sm" onClick={() => move(m, "sold", undefined, m.qty > 1 ? count : 1)}>
                  Sold {m.qty > 1 ? count : ""}
                </button>
                <button type="button" className="btn btn-o btn-sm" onClick={() => setSelling(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="row gap8 wrap">
                {m.status === "missing" && (
                  <>
                    <button type="button" className="btn btn-p btn-sm" onClick={() => move(m, "found")}>
                      I have them
                    </button>
                    {last && last.actor_id !== me && (
                      <button type="button" className="btn btn-o btn-sm" onClick={() => ask(m)}>
                        Ask {name(last.actor_id)}
                      </button>
                    )}
                  </>
                )}
                {m.status !== "missing" && m.category !== "gear" && m.qty > 0 && (m.holder_id === me || isOfficer) && (
                  <button type="button" className="btn btn-o btn-sm" onClick={() => (setCount(1), setSelling(m.id))}>
                    Sold
                  </button>
                )}
                {m.status !== "missing" && m.holder_id === me && (
                  <>
                    <button type="button" className="btn btn-o btn-sm" onClick={() => (setCount(m.qty), setPassing(m.id))}>
                      Passed it on
                    </button>
                    <button type="button" className="btn btn-o btn-sm" onClick={() => move(m, "return")}>
                      Returned to cupboard
                    </button>
                  </>
                )}
                {m.status !== "missing" && m.holder_id !== me && (
                  <button type="button" className="btn btn-o btn-sm" onClick={() => move(m, "take")}>
                    I&apos;ve got it now
                  </button>
                )}
                {m.status !== "missing" && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => move(m, "missing")}
                  >
                    Mark missing
                  </button>
                )}
                {manage && (
                  <>
                    <button type="button" className="link" onClick={() => setEditing(m)}>
                      Edit
                    </button>
                    <button type="button" className="link" onClick={() => remove(m)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading && !materials) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="screen pg">
      <div className="ph">
        <div>
          <h1>Materials</h1>
          <p className="sub">Who has what.</p>
        </div>
        <div className="row gap6">
          <button type="button" className="btn btn-o btn-sm" onClick={() => setHanding(true)}>
            Hand over
          </button>
          <button type="button" className="btn btn-p btn-sm" onClick={() => setAdding(true)}>
            <Plus size={16} strokeWidth={2.25} />
            Add
          </button>
        </div>
      </div>
      <input className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find anything: a title, IDOM 48, flags" aria-label="Find" />
      {missing.length > 0 && (
        <section>
          <h4 className="dayh red">
            Missing <span>{missing.length}</span>
          </h4>
          <div className="matlist">{missing.map(row)}</div>
        </section>
      )}
      {term && orderHits.length > 0 && (
        <section>
          <h4 className="dayh">
            On the order list <span>{orderHits.length}</span>
          </h4>
          <div className="matlist">
            {orderHits.map((m) => (
              <div key={m.id} className="mat-r">
                <span className="grow min0">
                  <span className="t" style={{ display: "block" }}>
                    {m.name}
                  </span>
                  <span className="small">
                    Want {m.wanted}
                    {needOf(m) ? ` · ${needOf(m)} to order` : " · covered"}
                    {m.note ? ` · ${m.note}` : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {groups.length === 0 && orderHits.length === 0 && !term && <p className="nothing">Nothing recorded yet.</p>}
      {term && groups.length === 0 && missing.length === 0 && <p className="small">Nobody has one at the moment.</p>}
      {term && (suggestions.length > 0 || (groups.length === 0 && orderHits.length === 0)) && (
        <section>
          <h4 className="dayh">Not in stock · ask for it</h4>
          <p className="small" style={{ marginTop: 0 }}>It goes on the order list, so whoever orders next sees it.</p>
          <div className="matlist">
            {suggestions.map((c) => (
              <div key={c.name} className="mat-r">
                <span className="grow min0">
                  <span className="t" style={{ display: "block" }}>
                    {c.name}
                  </span>
                  <span className="small">
                    {c.kind === "book" ? "Wellred" : "Stall gear"}
                    {c.kind === "book" && wellredUrl(c.name) && (
                      <>
                        {" · "}
                        <a className="link" href={wellredUrl(c.name)!} target="_blank" rel="noopener noreferrer">
                          See it ↗
                        </a>
                      </>
                    )}
                  </span>
                </span>
                <button type="button" className="btn btn-o btn-sm" onClick={() => request(c.name, c.kind)}>
                  Ask for it
                </button>
              </div>
            ))}
            {suggestions.length === 0 && (
              <div className="mat-r">
                <span className="grow min0 t">“{q.trim()}”</span>
                <button type="button" className="btn btn-o btn-sm" onClick={() => request(q.trim(), "gear")}>
                  Ask for it
                </button>
              </div>
            )}
          </div>
        </section>
      )}
      {groups.map((g) => {
        const open = expanded.has(g.k) || !!term || g.items.length <= 8;
        const shown = open ? g.items : g.items.slice(0, 6);
        return (
          <section key={g.k}>
            <h4 className="dayh">
              {g.label} <span>{g.items.reduce((n, m) => n + m.qty, 0)} · {g.items.length} lines</span>
            </h4>
            <div className="matlist">{shown.map(row)}</div>
            {!open && (
              <button type="button" className="link small mt6" onClick={() => setExpanded((p) => new Set(p).add(g.k))}>
                Show all {g.items.length}
              </button>
            )}
          </section>
        );
      })}
      {orderTotal > 0 && !term && (
        <section>
          <div className="row between" style={{ alignItems: "baseline" }}>
            <h4 className="dayh">
              To order <span>{orderTotal} copies</span>
            </h4>
            <button type="button" className="link small" onClick={() => navigator.clipboard.writeText(orderText()).then(() => toast("Order list copied"))}>
              Copy order list
            </button>
          </div>
          {[...PURPOSES, null].map((purpose) => {
            // Only what still needs ordering; covered lines are counted below, not listed.
            const items = toOrder.filter((m) => needOf(m) > 0 && (purpose ? m.purpose === purpose : !PURPOSES.includes(m.purpose as (typeof PURPOSES)[number])));
            if (!items.length) return null;
            return (
              <div key={purpose ?? "other"} className="mt8">
                <p className="small" style={{ margin: "0 0 4px", fontWeight: 700 }}>
                  {purpose ?? "Other"}
                </p>
                <div className="matlist">
                  {items.map((m) => {
                    const have = haveOf(m);
                    const haveN = have.reduce((n, x) => n + x.qty, 0) + (m.qty > 0 ? m.qty : 0);
                    const need = needOf(m);
                    const whoHas = [...new Set(have.map((x) => (x.holder_id === me ? "you" : (holderName(x) ?? x.holder_label ?? "the branch").split(/\s+/)[0])))].join(", ");
                    return (
                      <div key={m.id} className="mat-r" style={{ gap: 8 }}>
                        <span className="grow min0">
                          <span className="t" style={{ display: "block" }}>
                            Order {need} · {m.name}
                          </span>
                          <span className="small">
                            Want {m.wanted}
                            {haveN ? ` · have ${haveN}${whoHas ? ` (${whoHas})` : ""}` : " · none in stock"}
                            {m.note ? ` · ${m.note}` : ""}
                            {wellredUrl(m.name) && (
                              <>
                                {" · "}
                                <a className="link" href={wellredUrl(m.name)!} target="_blank" rel="noopener noreferrer">
                                  Wellred ↗
                                </a>
                              </>
                            )}
                          </span>
                        </span>
                        {isOfficer && (
                          <>
                            <button type="button" className="link small" onClick={() => setEditing(m)}>
                              Edit
                            </button>
                            {need > 0 && (
                              <button type="button" className="btn btn-o btn-sm" onClick={() => arrived(m)}>
                                Arrived
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {toOrder.some((m) => needOf(m) === 0) && <p className="small mt6">{toOrder.filter((m) => needOf(m) === 0).length} more on the list already covered.</p>}
        </section>
      )}
      {!term && <OtherBranchesHold />}

      {handing && (
        <HandOver
          items={held.filter((m) => m.holder_id === me)}
          onClose={() => setHanding(false)}
          onDone={() => {
            setHanding(false);
            revalidate("/api/materials", "/api/material-moves");
          }}
        />
      )}
      {adding && (
        <AddMaterialModal
          onClose={() => setAdding(false)}
          onAdd={async (input) => {
            const created = await post<Material>("/api/materials", input);
            setData((p) => [created, ...(p ?? [])]);
            setAdding(false);
          }}
        />
      )}
      {editing && (
        <AddMaterialModal
          material={editing}
          onClose={() => setEditing(null)}
          onAdd={async (input) => {
            const updated = await patch<Material>(`/api/materials/${editing.id}`, input);
            setData((p) => (p ?? []).map((x) => (x.id === updated.id ? updated : x)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** What the other branches in the district hold — to borrow a table or swap papers. Read only. */
function OtherBranchesHold() {
  const { data } = useData<DistrictMaterial[]>("/api/district/materials");
  const [open, setOpen] = useState(false);
  if (!data?.length) return null;
  const branches = [...new Set(data.map((m) => m.branch))];
  return (
    <section>
      <button type="button" className="dayh" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Other branches have <span>{data.length} lines · {open ? "hide" : "show"}</span>
      </button>
      {open &&
        branches.map((b) => (
          <div key={b} className="mt8">
            <p className="small" style={{ margin: "0 0 4px", fontWeight: 700 }}>
              {b}
            </p>
            <div className="matlist">
              {data
                .filter((m) => m.branch === b)
                .map((m) => (
                  <div key={m.id} className="mat-r">
                    <span className="grow min0">
                      <span className="t trunc" style={{ display: "block" }}>
                        {m.name}
                        {m.qty > 1 ? <span className="muted"> · {m.qty}</span> : null}
                      </span>
                      <span className="small">With {m.holder}</span>
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
    </section>
  );
}

/**
 * Hand several things to one person in one go: tick what (and how many), and
 * add anything nobody counted ("bag of leftover papers and IDOMs") as one line.
 */
function HandOver({ items, onClose, onDone }: { items: Material[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [to, setTo] = useState("");
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [bag, setBag] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = Object.entries(picked).filter(([, n]) => n > 0);
  const total = chosen.reduce((n, [, q]) => n + q, 0);

  async function save() {
    setBusy(true);
    try {
      const r = await post<{ to: string }>("/api/materials/handover", { to, items: chosen.map(([id, qty]) => ({ id, qty })), bag: bag.trim() || undefined });
      toast(`Handed to ${r.to.replace(/^Comrade\s+/i, "").split(" ")[0]}${total ? ` · ${total} cop${total === 1 ? "y" : "ies"}` : ""}${bag.trim() ? " · plus the bag" : ""}`);
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
      setBusy(false);
    }
  }

  return (
    <Scrim title="Hand over" onClose={onClose}>
      <div className="stack8">
        <HolderPicker value={to} onChange={setTo} empty="Who did you give them to?" label="Given to" />
        {items.length > 0 && (
          <div className="stack6">
            <p className="small" style={{ margin: 0, fontWeight: 700 }}>
              What you gave them
            </p>
            <div className="matlist" style={{ maxHeight: 280, overflowY: "auto" }}>
              {items.map((m) => {
                const n = picked[m.id] ?? 0;
                return (
                  <label key={m.id} className="mat-r" style={{ gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={n > 0} onChange={(e) => setPicked((p) => ({ ...p, [m.id]: e.target.checked ? m.qty : 0 }))} />
                    <span className="grow min0 t trunc">{m.name}</span>
                    {n > 0 && m.qty > 1 ? (
                      <input
                        className="inp"
                        type="number"
                        min={1}
                        max={m.qty}
                        value={n}
                        onChange={(e) => setPicked((p) => ({ ...p, [m.id]: Math.max(1, Math.min(m.qty, Number(e.target.value) || 1)) }))}
                        onClick={(e) => e.preventDefault()}
                        aria-label={`How many ${m.name}`}
                        style={{ width: 64 }}
                      />
                    ) : (
                      <span className="small muted">{m.qty > 1 ? `${m.qty}` : ""}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}
        <label className="fld">
          <span>Anything not counted</span>
          <input className="inp" value={bag} onChange={(e) => setBag(e.target.value)} placeholder="e.g. Bag of leftover papers, IDOMs and pamphlets" />
        </label>
        <p className="small" style={{ margin: 0 }}>It&apos;s logged as one line with them, so it isn&apos;t lost. They can list what&apos;s inside later.</p>
        <button type="button" className="btn btn-p" disabled={busy || !to || (!chosen.length && !bag.trim())} onClick={save}>
          {busy ? "Saving…" : "Handed over"}
        </button>
      </div>
    </Scrim>
  );
}
