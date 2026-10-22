/* eslint-disable @next/next/no-img-element -- the card is exported with html-to-image, which needs plain <img> */
import type { CSSProperties } from "react";
import { COLOURWAYS, type ColourwayId } from "./rcs-graphic";
import { QrTile } from "./qr-tile";

/*
 * The term card: a branch's coming events on one printable card. Drawn from the rows it is
 * given, so nothing about a branch, a date or an event is fixed here. `u` turns design units
 * (1u = 1% of the shorter side) into a CSS length, so the same card renders as a fluid preview
 * (cqmin), as fixed pixels for a PNG, and in millimetres for print.
 */

export interface TermRow {
  key: string;
  /** "Mon" */
  weekday: string;
  /** "26" */
  day: string;
  /** "Oct" */
  month: string;
  time: string;
  title: string;
  where: string;
}

export type TermSizeId = "a5" | "a6" | "square";

/** Trim sizes in millimetres (the square is a social post: pixels, 1080). */
export const TERM_SIZES: Record<TermSizeId, { label: string; mmW: number; mmH: number; pxW: number; pxH: number }> = {
  a5: { label: "A5 print", mmW: 148, mmH: 210, pxW: 1748, pxH: 2480 },
  a6: { label: "A6 flyer", mmW: 105, mmH: 148, pxW: 1240, pxH: 1748 },
  square: { label: "Social square", mmW: 150, mmH: 150, pxW: 1080, pxH: 1080 },
};

export interface TermOptions {
  cw: ColourwayId;
  size: TermSizeId;
  kicker: string;
  title: string;
  period: string;
  footer: string;
  qr: string;
  qrCaption: string;
  qrBrand: boolean;
  qrLower: boolean;
  emblem: boolean;
  grain: boolean;
  /** Extend the colour 3 mm past the trim, for the printer. Print and PNG only. */
  bleed: boolean;
}

export const DEFAULT_TERM_OPTIONS: TermOptions = {
  cw: "red",
  size: "a5",
  kicker: "",
  title: "What's on",
  period: "",
  footer: "",
  qr: "",
  qrCaption: "whatsapp",
  qrBrand: true,
  qrLower: true,
  emblem: true,
  grain: true,
  bleed: false,
};

/** The type size for a list of `n` lines on this size of card (1u = 1% of the card's shorter side). */
function baseSize(size: TermSizeId, n: number) {
  if (size === "square") return n <= 4 ? 4.2 : n <= 6 ? 3.6 : 3.1;
  if (size === "a6") return n <= 4 ? 4.6 : n <= 6 ? 4 : 3.5;
  return n <= 5 ? 4.2 : n <= 8 ? 3.5 : n <= 10 ? 3.1 : 2.75;
}

const PAD = 7;
/** A line's height as a multiple of the type size (measured from the rendered card). */
const ROW_K = 2.6;
/** Height of the QR tile with its caption band, in u (measured from the rendered tile). */
const QR_SIZE = 19;
const QR_BLOCK = QR_SIZE + 9.5;

/** Heading size: shrinks so the heading stays on one line however long it is. */
export function headingSize(title: string, square: boolean) {
  const start = title.length > 16 ? (square ? 8 : 9) : square ? 10 : 12;
  return Math.max(6, Math.min(start, (100 - 2 * PAD) / Math.max(1, title.length * 0.55)));
}

/** How many lines fit on the card with what's around them. Whole lines only: a longer list is cut here, not mid-line. */
export function rowCapacity(o: Pick<TermOptions, "size" | "kicker" | "title" | "period" | "footer" | "emblem" | "qr">, kickerShown: boolean): number {
  const square = o.size === "square";
  const cardH = (100 * TERM_SIZES[o.size].mmH) / TERM_SIZES[o.size].mmW;
  const header = (kickerShown ? 2.8 * 1.15 : 0) + 2.4 + headingSize(o.title, square) * 0.9 + (o.period ? 3.4 * 1.2 + 1.6 : 0) + 4;
  const footer = o.qr.trim() ? QR_BLOCK : o.footer || o.emblem ? 10 : 0;
  const avail = cardH - 2 * PAD - header - footer - (footer ? 3 : 0);
  let best = 1;
  for (let n = 1; n <= 30; n++) {
    const base = baseSize(o.size, n);
    const row = base * ROW_K;
    const gap = base * 0.55;
    const cols = square && n > 4 ? 2 : 1;
    const perCol = Math.ceil(n / cols);
    if (perCol * row + (perCol - 1) * gap <= avail) best = n;
  }
  return best;
}

const ARCHIVO = "var(--font-archivo), Archivo, sans-serif";
const ONE_LINE: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const R = "/brand/rcs";

export function TermCard({ rows, o, u, frame, bleedU = 0 }: { rows: TermRow[]; o: TermOptions; u: (n: number) => string; frame: CSSProperties; bleedU?: number }) {
  const c = COLOURWAYS[o.cw];
  const square = o.size === "square";
  const hasQr = !!o.qr.trim();
  const n = rows.length;
  // Type steps down as the list grows, so a longer term still fits the card.
  const base = baseSize(o.size, n);
  const pad = PAD;
  const heading: CSSProperties = {
    fontFamily: `'Brunson', ${ARCHIVO}`,
    fontWeight: 700,
    textTransform: "uppercase",
    lineHeight: 0.9,
    margin: 0,
    fontSize: u(headingSize(o.title, square)),
    whiteSpace: "nowrap",
  };
  return (
    <div style={{ ...frame, position: "relative", overflow: "hidden", background: c.bg, color: c.fg }}>
      <div style={{ position: "absolute", inset: u(bleedU), display: "flex", flexDirection: "column", padding: u(pad) }}>
        {o.kicker && <p style={{ font: `800 ${u(2.8)}/1.15 ${ARCHIVO}`, letterSpacing: "0.14em", textTransform: "uppercase", margin: 0 }}>{o.kicker}</p>}
        <h1 style={{ ...heading, marginTop: u(2.4) }}>{o.title}</h1>
        {o.period && <p style={{ font: `700 ${u(3.4)}/1.2 ${ARCHIVO}`, margin: `${u(1.6)} 0 0`, letterSpacing: "0.04em", textTransform: "uppercase" }}>{o.period}</p>}
        <div
          style={{
            marginTop: u(4),
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: square && n > 4 ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
            gridAutoRows: "min-content",
            alignContent: "start",
            columnGap: u(4),
            rowGap: u(base * 0.55),
            overflow: "hidden",
          }}
        >
          {rows.map((r) => (
            <div key={r.key} style={{ display: "flex", gap: u(base * 0.7), alignItems: "stretch" }}>
              <div style={{ background: c.blockBg, color: c.blockFg, minWidth: u(base * 3.6), padding: `${u(base * 0.25)} ${u(base * 0.4)}`, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <span style={{ fontFamily: `'Brunson', ${ARCHIVO}`, fontWeight: 700, fontSize: u(base * 1.4), lineHeight: 1 }}>{r.day}</span>
                <span style={{ font: `700 ${u(base * 0.6)}/1.1 ${ARCHIVO}`, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {r.weekday} {r.month}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0, alignSelf: "center" }}>
                <p style={{ font: `800 ${u(base)}/1.1 ${ARCHIVO}`, textTransform: "uppercase", margin: 0, letterSpacing: "0.01em", ...ONE_LINE }}>{r.title}</p>
                {(r.time || r.where) && <p style={{ font: `600 ${u(base * 0.72)}/1.25 ${ARCHIVO}`, margin: `${u(base * 0.18)} 0 0`, ...ONE_LINE }}>{[r.time, r.where].filter(Boolean).join(" · ")}</p>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ flex: "none", marginTop: u(3), display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: u(4) }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: u(4), flex: "1 1 0", minWidth: 0, overflow: "hidden" }}>
            {o.emblem && <img src={c.mark} alt="" style={{ height: u(c.wide ? 5.4 : 9), width: "auto", display: "block" }} />}
            {o.footer && <p style={{ font: `800 ${u(3)}/1.2 ${ARCHIVO}`, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0, flex: "1 1 0", minWidth: 0, ...ONE_LINE }}>{o.footer}</p>}
          </div>
          {hasQr && <QrTile link={o.qr} caption={o.qrCaption} corner="br" size={QR_SIZE} brand={o.qrBrand} lower={o.qrLower} frame={c.blockBg} frameText={c.blockFg} flow u={u} />}
        </div>
      </div>
      {o.grain && <div style={{ position: "absolute", inset: 0, backgroundImage: `url('${R}/grain.png')`, backgroundSize: "cover", mixBlendMode: "multiply", opacity: 0.16, pointerEvents: "none" }} />}
    </div>
  );
}
