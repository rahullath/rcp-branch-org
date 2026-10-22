"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ArrowLeft, Download, Printer, Share2 } from "lucide-react";
import { toPng } from "html-to-image";
import { useActor } from "@/lib/actor-context";
import { useData } from "@/lib/hooks";
import { festivalDates } from "@/lib/festival";
import { useFestival } from "@/lib/festival-config";
import { EVENT_TYPE_META, type BranchLinks, type Event, type EventType } from "@/lib/types";
import { COLOURWAYS, type ColourwayId } from "@/components/rcs-graphic";
import { QR_KINDS } from "@/components/qr-tile";
import { DEFAULT_TERM_OPTIONS, rowCapacity, TERM_SIZES, TermCard, type TermOptions, type TermRow, type TermSizeId } from "@/components/termcard";
import { fmtDayNum, fmtMonth, fmtTime, fmtWeekday, firstPart } from "@/components/features/primitives";
import { useToast } from "@/components/features/toast";
import { Spinner } from "@/components/ui";

/** Types a society hands out by default: the ones contacts can come to. Branch and committee meetings are the member-only ones. */
const PUBLIC_TYPES: EventType[] = ["open_meeting", "reading_group", "social", "uni_stall", "paper_sale", "mobilization"];
const ALL_TYPES: EventType[] = ["open_meeting", "reading_group", "social", "uni_stall", "paper_sale", "mobilization", "postering", "phonebank", "branch"];
const BLEED_MM = 3;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ukDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
/** "26 Oct – 18 Dec" from two YYYY-MM-DD days. */
const periodText = (a: string, b: string) => festivalDates({ start_date: a, end_date: b }).replace("–", " – ");

type Extra = { key: string; weekday: string; day: string; month: string; time: string; title: string; where: string };

/**
 * The term card: pick a stretch of dates, tick the events that go on it, say what the card calls
 * itself, and print it (A5, A6) or save it as a picture for social. Everything comes from the
 * branch's own events and saved links, and every line can be edited or added by hand.
 */
export default function TermCardPage() {
  const actor = useActor();
  const toast = useToast();
  const { data: events, loading } = useData<Event[]>("/api/events");
  const { data: links } = useData<BranchLinks | null>("/api/branch-links");
  const { festival } = useFestival();
  const [now] = useState(() => Date.now());
  const [from, setFrom] = useState(() => isoDay(now));
  const [to, setTo] = useState(() => isoDay(now + 56 * 86400_000));
  const [types, setTypes] = useState<Set<EventType>>(new Set(PUBLIC_TYPES));
  const [off, setOff] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, { title?: string; where?: string }>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [withFestival, setWithFestival] = useState(true);
  const [o, setO] = useState<TermOptions>(DEFAULT_TERM_OPTIONS);
  const [busy, setBusy] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const size = TERM_SIZES[o.size];
  const kicker = o.kicker || actor?.branch?.name || "";
  const opts: TermOptions = { ...o, kicker, period: o.period || periodText(from, to) };
  const bleedMm = o.bleed && o.size !== "square" ? BLEED_MM : 0;
  const set = <K extends keyof TermOptions>(k: K, v: TermOptions[K]) => setO((p) => ({ ...p, [k]: v }));

  // Events in the window and of the chosen kinds, soonest first.
  const candidates = useMemo(
    () =>
      (events ?? [])
        .filter((e) => !e.archived && e.status !== "off" && types.has(e.event_type) && ukDay(e.start_time) >= from && ukDay(e.start_time) <= to)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [events, types, from, to],
  );

  const rows: TermRow[] = useMemo(() => {
    const out: (TermRow & { at: string })[] = candidates
      .filter((e) => !off.has(e.id))
      .map((e) => ({
        key: e.id,
        at: e.start_time,
        weekday: fmtWeekday(e.start_time),
        day: fmtDayNum(e.start_time).replace(/^0/, ""),
        month: fmtMonth(e.start_time),
        time: fmtTime(e.start_time),
        title: (edits[e.id]?.title ?? firstPart(e.title, " — ")).trim(),
        where: (edits[e.id]?.where ?? firstPart(e.location || "")).trim(),
      }));
    // If the festival is already an event in the app, that line is the one on the card.
    const already = candidates.some((e) => !off.has(e.id) && festival && e.title.toLowerCase().includes(festival.name.toLowerCase()));
    if (festival && withFestival && !already && festival.start_date <= to && festival.end_date >= from) {
      const d = new Date(`${festival.start_date}T12:00:00Z`);
      out.push({
        key: "festival",
        at: `${festival.start_date}T00:00:00Z`,
        weekday: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
        day: String(d.getUTCDate()),
        month: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
        time: festivalDates(festival),
        title: festival.name,
        where: festival.location ?? "",
      });
    }
    for (const x of extras) out.push({ ...x, at: "9" });
    return out.sort((a, b) => a.at.localeCompare(b.at)).map((r) => ({ key: r.key, weekday: r.weekday, day: r.day, month: r.month, time: r.time, title: r.title, where: r.where }));
  }, [candidates, off, edits, extras, festival, withFestival, from, to]);

  const capacity = rowCapacity(o.size);
  // Whole lines only: anything past what fits is left off rather than cut in half.
  const shown = rows.slice(0, capacity);
  const toggleType = (t: EventType) => setTypes((p) => (p.has(t) ? new Set([...p].filter((x) => x !== t)) : new Set([...p, t])));
  const toggleOff = (id: string) => setOff((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
  const fileName = `term-card-${from}-${o.size}`;

  /** Link chips: fill in the branch's saved link for WhatsApp or Instagram. */
  function pickKind(k: (typeof QR_KINDS)[number]) {
    const saved = k.saved ? links?.[k.saved] : null;
    setO((p) => ({ ...p, qrCaption: k.caption, ...(saved ? { qr: saved } : {}) }));
  }

  async function savePng() {
    setBusy(true);
    setExporting(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await document.fonts.ready;
      const node = exportRef.current?.firstElementChild as HTMLElement | null;
      if (!node) throw new Error("Couldn't render the card");
      await Promise.all([...node.querySelectorAll("img")].map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r)))));
      const w = size.pxW + Math.round((bleedMm / size.mmW) * size.pxW * 2);
      const h = size.pxH + Math.round((bleedMm / size.mmH) * size.pxH * 2);
      const url = await toPng(node, { width: w, height: h, pixelRatio: 1, cacheBust: true });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.png`;
      a.click();
      toast(`Saved ${w}×${h}px${o.size === "square" ? "" : " (300 dpi)"}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save the picture");
    } finally {
      setExporting(false);
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    setExporting(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await document.fonts.ready;
      const node = exportRef.current?.firstElementChild as HTMLElement | null;
      if (!node) throw new Error("Couldn't render the card");
      const url = await toPng(node, { width: size.pxW, height: size.pxH, pixelRatio: 1, cacheBust: true });
      const file = new File([await (await fetch(url)).blob()], `${fileName}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: opts.title });
      else toast("This browser has no share sheet. Use Save picture.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast(e instanceof Error ? e.message : "Couldn't share");
    } finally {
      setExporting(false);
      setBusy(false);
    }
  }

  // Preview: fluid, sized by its container. Export: fixed pixels. Print: millimetres.
  const previewFrame = { aspectRatio: `${size.mmW} / ${size.mmH}`, containerType: "size" as const, width: "100%", maxHeight: 420 };
  const unitMm = size.mmW / 100;
  const printW = size.mmW + bleedMm * 2;
  const printH = size.mmH + bleedMm * 2;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="screen pg pg-g">
      <div className="ph">
        <Link className="btn-ic" href="/social-media" aria-label="Back to Social">
          <ArrowLeft size={18} strokeWidth={2.25} />
        </Link>
        <div className="grow min0">
          <h1 style={{ fontSize: 22 }}>Term card</h1>
          <p className="sub">Your coming events on one card to print or post.</p>
        </div>
      </div>

      <div className="preview">
        <div className="pv-in" style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ width: o.size === "square" ? "100%" : "auto", height: o.size === "square" ? "auto" : 400, aspectRatio: `${size.mmW} / ${size.mmH}`, maxWidth: "100%" }}>
            <TermCard rows={shown} o={opts} u={(n) => `${n}cqmin`} frame={{ ...previewFrame, width: "100%", height: "100%", maxHeight: "none" }} />
          </div>
        </div>
      </div>
      {rows.length > capacity && <p className="small red">{size.label} fits {capacity} lines, so the last {rows.length - capacity} {rows.length - capacity === 1 ? "is" : "are"} left off. Untick some, or pick a shorter stretch of dates.</p>}
      {rows.length === 0 && <p className="small">Nothing in these dates for the kinds ticked. Widen the dates, tick more kinds, or add a line by hand.</p>}

      <div className="fld">
        <span>Dates</span>
        <div className="row gap8">
          <label className="small grow">
            From
            <input className="inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="small grow">
            To
            <input className="inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="fld">
        <span>Kinds of event</span>
        <div className="row gap6 wrap">
          {ALL_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="lchip big"
              aria-pressed={types.has(t)}
              style={types.has(t) ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : undefined}
              onClick={() => toggleType(t)}
            >
              {EVENT_TYPE_META[t].label}
            </button>
          ))}
        </div>
        <p className="small" style={{ margin: "4px 0 0" }}>
          Branch meetings are for members, so they&apos;re off unless you tick them.
        </p>
      </div>

      <div className="fld">
        <span>
          On the card · {rows.length}
        </span>
        <div className="matlist">
          {candidates.map((e) => {
            const on = !off.has(e.id);
            const open = editing === e.id;
            const title = edits[e.id]?.title ?? firstPart(e.title, " — ");
            const where = edits[e.id]?.where ?? firstPart(e.location || "");
            return (
              <div key={e.id} className="mat-r" style={{ alignItems: "flex-start", gap: 8, opacity: on ? 1 : 0.5 }}>
                <input type="checkbox" checked={on} onChange={() => toggleOff(e.id)} aria-label={`Include ${title}`} style={{ marginTop: 4 }} />
                <span className="grow min0 stack6">
                  {open ? (
                    <>
                      <input className="inp" value={title} onChange={(ev) => setEdits((p) => ({ ...p, [e.id]: { ...p[e.id], title: ev.target.value } }))} aria-label="Title on the card" />
                      <input className="inp" value={where} onChange={(ev) => setEdits((p) => ({ ...p, [e.id]: { ...p[e.id], where: ev.target.value } }))} placeholder="Where" aria-label="Where" />
                    </>
                  ) : (
                    <span>
                      <span className="t" style={{ display: "block" }}>
                        {title}
                      </span>
                      <span className="small" style={{ display: "block" }}>
                        {fmtWeekday(e.start_time)} {fmtDayNum(e.start_time)} {fmtMonth(e.start_time)} · {fmtTime(e.start_time)}
                        {where ? ` · ${where}` : ""}
                      </span>
                    </span>
                  )}
                </span>
                <button type="button" className="link small" onClick={() => setEditing(open ? null : e.id)}>
                  {open ? "Done" : "Edit"}
                </button>
              </div>
            );
          })}
          {festival && festival.start_date <= to && festival.end_date >= from && !candidates.some((e) => e.title.toLowerCase().includes(festival.name.toLowerCase())) && (
            <label className="mat-r" style={{ gap: 8 }}>
              <input type="checkbox" checked={withFestival} onChange={(e) => setWithFestival(e.target.checked)} />
              <span className="grow min0">
                <span className="t" style={{ display: "block" }}>
                  {festival.name}
                </span>
                <span className="small">{festivalDates(festival)}</span>
              </span>
            </label>
          )}
          {extras.map((x) => (
            <div key={x.key} className="mat-r" style={{ gap: 8 }}>
              <span className="grow min0 stack6">
                <input className="inp" value={x.title} onChange={(e) => setExtras((p) => p.map((y) => (y.key === x.key ? { ...y, title: e.target.value } : y)))} placeholder="What" aria-label="What" />
                <span className="row gap8">
                  <input className="inp" style={{ width: 70 }} value={x.weekday} maxLength={4} onChange={(e) => setExtras((p) => p.map((y) => (y.key === x.key ? { ...y, weekday: e.target.value } : y)))} placeholder="Mon" aria-label="Weekday" />
                  <input className="inp" style={{ width: 60 }} value={x.day} maxLength={2} inputMode="numeric" onChange={(e) => setExtras((p) => p.map((y) => (y.key === x.key ? { ...y, day: e.target.value } : y)))} placeholder="26" aria-label="Day" />
                  <input className="inp" style={{ width: 70 }} value={x.month} maxLength={4} onChange={(e) => setExtras((p) => p.map((y) => (y.key === x.key ? { ...y, month: e.target.value } : y)))} placeholder="Oct" aria-label="Month" />
                  <input className="inp grow" value={x.where} onChange={(e) => setExtras((p) => p.map((y) => (y.key === x.key ? { ...y, where: e.target.value } : y)))} placeholder="Time · where" aria-label="Time and place" />
                </span>
              </span>
              <button type="button" className="link small" onClick={() => setExtras((p) => p.filter((y) => y.key !== x.key))}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <p className="small" style={{ margin: "6px 0 0" }}>
          <button type="button" className="link" onClick={() => setExtras((p) => [...p, { key: `x${Date.now()}`, weekday: "", day: "", month: "", time: "", title: "", where: "" }])}>
            Add a line by hand
          </button>
        </p>
      </div>

      <div className="fld">
        <span>Words</span>
        <div className="stack6">
          <input className="inp" value={o.kicker} onChange={(e) => set("kicker", e.target.value)} placeholder={`Top line (${actor?.branch?.name ?? "your branch"})`} aria-label="Top line" />
          <input className="inp" value={o.title} onChange={(e) => set("title", e.target.value)} placeholder="Heading, e.g. Autumn term" aria-label="Heading" />
          <input className="inp" value={o.period} onChange={(e) => set("period", e.target.value)} placeholder={`Dates line (${periodText(from, to)})`} aria-label="Dates line" />
          <input className="inp" value={o.footer} onChange={(e) => set("footer", e.target.value)} placeholder="Bottom line, e.g. communist.red/join" aria-label="Bottom line" />
        </div>
      </div>

      <div className="fld">
        <span>QR code</span>
        <div className="opts">
          <div className="mini" style={{ flexWrap: "wrap" }}>
            {QR_KINDS.filter((k) => k.id !== "rsvp").map((k) => (
              <button key={k.id} type="button" className={o.qrCaption === k.caption ? "on" : ""} onClick={() => pickKind(k)}>
                {k.label}
              </button>
            ))}
          </div>
          <div className="fgrid">
            <div className="fld">
              <input value={o.qr} onChange={(e) => set("qr", e.target.value)} placeholder="Paste a link, or pick WhatsApp to use your branch's saved one" inputMode="url" autoCapitalize="none" spellCheck={false} aria-label="Link for the QR code" />
            </div>
            {o.qr && (
              <div className="fld">
                <input value={o.qrCaption} onChange={(e) => set("qrCaption", e.target.value)} placeholder="Caption under the QR" aria-label="QR caption" />
              </div>
            )}
          </div>
          {o.qr && (
            <div className="opt">
              <span>Style</span>
              <div className="mini">
                <button type="button" className={o.qrBrand ? "on" : ""} onClick={() => set("qrBrand", true)}>
                  Hammer &amp; sickle
                </button>
                <button type="button" className={!o.qrBrand ? "on" : ""} onClick={() => set("qrBrand", false)}>
                  Plain
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fld">
        <span>Look</span>
        <div className="opts">
          <div className="opt">
            <span>Size</span>
            <div className="mini">
              {(Object.keys(TERM_SIZES) as TermSizeId[]).map((k) => (
                <button key={k} type="button" className={o.size === k ? "on" : ""} onClick={() => set("size", k)}>
                  {TERM_SIZES[k].label}
                </button>
              ))}
            </div>
          </div>
          <div className="opt">
            <span>Colour</span>
            <div className="mini">
              {(Object.keys(COLOURWAYS) as ColourwayId[]).map((k) => (
                <button key={k} type="button" className={o.cw === k ? "on" : ""} onClick={() => set("cw", k)}>
                  {COLOURWAYS[k].label}
                </button>
              ))}
            </div>
          </div>
          <div className="opt">
            <span>Emblem</span>
            <div className="mini">
              <button type="button" className={o.emblem ? "on" : ""} onClick={() => set("emblem", true)}>
                On
              </button>
              <button type="button" className={!o.emblem ? "on" : ""} onClick={() => set("emblem", false)}>
                Off
              </button>
            </div>
          </div>
          <div className="opt">
            <span>Print grain</span>
            <div className="mini">
              <button type="button" className={o.grain ? "on" : ""} onClick={() => set("grain", true)}>
                On
              </button>
              <button type="button" className={!o.grain ? "on" : ""} onClick={() => set("grain", false)}>
                Off
              </button>
            </div>
          </div>
          {o.size !== "square" && (
            <div className="opt">
              <span>3 mm bleed</span>
              <div className="mini">
                <button type="button" className={o.bleed ? "on" : ""} onClick={() => set("bleed", true)}>
                  On
                </button>
                <button type="button" className={!o.bleed ? "on" : ""} onClick={() => set("bleed", false)}>
                  Off
                </button>
              </div>
            </div>
          )}
        </div>
        {o.size !== "square" && <p className="small" style={{ margin: "6px 0 0" }}>Bleed is for a print shop: the colour runs 3 mm past the trim so a cut never leaves a white edge. For a home printer leave it off.</p>}
      </div>

      <div className="actbar">
        <button type="button" className="btn btn-o grow" onClick={savePng} disabled={busy || shown.length === 0}>
          <Download size={16} strokeWidth={2.25} />
          Save picture
        </button>
        {o.size !== "square" ? (
          <button type="button" className="btn btn-p grow" onClick={() => window.print()} disabled={shown.length === 0}>
            <Printer size={16} strokeWidth={2.25} />
            Print / PDF
          </button>
        ) : (
          <button type="button" className="btn btn-p grow" onClick={share} disabled={busy || shown.length === 0}>
            <Share2 size={16} strokeWidth={2.25} />
            Share
          </button>
        )}
      </div>
      {o.size !== "square" && <p className="small">Print / PDF opens your browser&apos;s print window: choose &ldquo;Save as PDF&rdquo; for a file, and set margins to none and scale to 100%.</p>}

      {exporting &&
        createPortal(
          <div ref={exportRef} aria-hidden style={{ position: "fixed", left: -30000, top: 0, pointerEvents: "none" }}>
            <TermCard
              rows={shown}
              o={opts}
              u={(n) => `${n * (size.pxW / 100)}px`}
              bleedU={bleedMm ? (bleedMm / size.mmW) * 100 : 0}
              frame={{ width: size.pxW + Math.round((bleedMm / size.mmW) * size.pxW * 2), height: size.pxH + Math.round((bleedMm / size.mmH) * size.pxH * 2) }}
            />
          </div>,
          document.body,
        )}

      {o.size !== "square" &&
        createPortal(
          <div className="tc-print">
            <style>{`
              .tc-print { display: none; }
              @media print {
                @page { size: ${printW}mm ${printH}mm; margin: 0; }
                body > *:not(.tc-print) { display: none !important; }
                .tc-print { display: block; width: ${printW}mm; height: ${printH}mm; }
                html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
              }
            `}</style>
            <TermCard rows={shown} o={opts} u={(n) => `${n * unitMm}mm`} bleedU={bleedMm ? (bleedMm / size.mmW) * 100 : 0} frame={{ width: `${printW}mm`, height: `${printH}mm` }} />
          </div>,
          document.body,
        )}
    </div>
  );
}
