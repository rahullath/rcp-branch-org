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

/** How many rows a card can show before it gets cramped. */
export function rowCapacity(size: TermSizeId) {
  return size === "a6" ? 8 : size === "square" ? 8 : 13;
}

const ARCHIVO = "var(--font-archivo), Archivo, sans-serif";
const R = "/brand/rcs";

export function TermCard({ rows, o, u, frame, bleedU = 0 }: { rows: TermRow[]; o: TermOptions; u: (n: number) => string; frame: CSSProperties; bleedU?: number }) {
  const c = COLOURWAYS[o.cw];
  const square = o.size === "square";
  const hasQr = !!o.qr.trim();
  const n = rows.length;
  // Type steps down as the list grows, so a longer term still fits the card.
  const base = square ? (n <= 4 ? 4.2 : n <= 6 ? 3.6 : 3.1) : o.size === "a6" ? (n <= 4 ? 4.6 : n <= 6 ? 4 : 3.5) : n <= 5 ? 4.2 : n <= 8 ? 3.5 : n <= 10 ? 3.1 : 2.75;
  const pad = 7;
  const footerH = hasQr ? 30 : o.footer || o.emblem ? 12 : 4;
  const heading: CSSProperties = {
    fontFamily: `'Brunson', ${ARCHIVO}`,
    fontWeight: 700,
    textTransform: "uppercase",
    lineHeight: 0.9,
    margin: 0,
    fontSize: u(o.title.length > 16 ? (square ? 9 : 11) : square ? 11 : 14),
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
            gridTemplateColumns: square && n > 4 ? "1fr 1fr" : "1fr",
            gridAutoRows: "min-content",
            alignContent: "start",
            columnGap: u(4),
            rowGap: u(base * 0.55),
            overflow: "hidden",
          }}
        >
          {rows.map((r) => (
            <div key={r.key} style={{ display: "flex", gap: u(base * 0.7), alignItems: "stretch" }}>
              <div style={{ background: c.blockBg, color: c.blockFg, minWidth: u(base * 3.9), padding: `${u(base * 0.3)} ${u(base * 0.4)}`, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <span style={{ font: `700 ${u(base * 0.62)}/1 ${ARCHIVO}`, letterSpacing: "0.1em", textTransform: "uppercase" }}>{r.weekday}</span>
                <span style={{ fontFamily: `'Brunson', ${ARCHIVO}`, fontWeight: 700, fontSize: u(base * 1.55), lineHeight: 1 }}>{r.day}</span>
                <span style={{ font: `700 ${u(base * 0.62)}/1 ${ARCHIVO}`, letterSpacing: "0.1em", textTransform: "uppercase" }}>{r.month}</span>
              </div>
              <div style={{ minWidth: 0, alignSelf: "center" }}>
                <p style={{ font: `800 ${u(base)}/1.1 ${ARCHIVO}`, textTransform: "uppercase", margin: 0, letterSpacing: "0.01em" }}>{r.title}</p>
                {(r.time || r.where) && <p style={{ font: `600 ${u(base * 0.72)}/1.25 ${ARCHIVO}`, margin: `${u(base * 0.18)} 0 0` }}>{[r.time, r.where].filter(Boolean).join(" · ")}</p>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ height: u(footerH), flex: "none", display: "flex", alignItems: "flex-end", gap: u(4), marginRight: hasQr ? u(28) : 0 }}>
          {o.emblem && <img src={c.mark} alt="" style={{ height: u(c.wide ? 5.4 : 9), width: "auto", display: "block" }} />}
          {o.footer && <p style={{ font: `800 ${u(3)}/1.2 ${ARCHIVO}`, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{o.footer}</p>}
        </div>
      </div>
      {hasQr && (
        <div style={{ position: "absolute", inset: u(bleedU) }}>
          <QrTile link={o.qr} caption={o.qrCaption} corner="br" size={21} brand={o.qrBrand} lower={o.qrLower} frame={c.blockBg} frameText={c.blockFg} u={u} />
        </div>
      )}
      {o.grain && <div style={{ position: "absolute", inset: 0, backgroundImage: `url('${R}/grain.png')`, backgroundSize: "cover", mixBlendMode: "multiply", opacity: 0.16, pointerEvents: "none" }} />}
    </div>
  );
}
