/* eslint-disable @next/next/no-img-element -- brand marks render inside an exported PNG; next/image can't be captured */
import type { CSSProperties, ReactNode } from "react";

/*
 * RCS social graphics (Revolutionary Communist Students design system):
 * Brunson display type, the four poster colourways, print grain, the
 * emblem.
 *
 * Every size is expressed in "u" = 1% of the graphic's shorter side, so the
 * same markup renders the live preview (CSS container-query units) and the
 * full-resolution export (plain pixels) identically.
 */

const R = "/brand/rcs";

export const COLOURWAYS = {
  red: { bg: "#ff3654", fg: "#ffffff", blockBg: "#0a0a08", blockFg: "#ffffff", mark: `${R}/rcs-logo-white.png`, wide: true, emblem: `${R}/marks/emblem-black-transparent.png`, darkMark: `${R}/marks/hammer-sickle-red.png`, label: "Red" },
  yellow: { bg: "#ffeb34", fg: "#0a0a08", blockBg: "#0a0a08", blockFg: "#ffeb34", mark: `${R}/marks/emblem-black-transparent.png`, wide: false, emblem: `${R}/marks/emblem-black-transparent.png`, darkMark: `${R}/marks/hammer-sickle-yellow.png`, label: "Yellow" },
  green: { bg: "#59b788", fg: "#0a0a08", blockBg: "#0a0a08", blockFg: "#59b788", mark: `${R}/marks/emblem-black-transparent.png`, wide: false, emblem: `${R}/marks/emblem-black-transparent.png`, darkMark: `${R}/marks/hammer-sickle-green.png`, label: "Green" },
  black: { bg: "#0a0a08", fg: "#ff3654", blockBg: "#ff3654", blockFg: "#0a0a08", mark: `${R}/marks/emblem-rough-pink.png`, wide: false, emblem: `${R}/marks/emblem-rough-pink.png`, darkMark: `${R}/marks/emblem-black-transparent.png`, label: "Black" },
} as const;

export type ColourwayId = keyof typeof COLOURWAYS;
export type GraphicTpl = "event" | "quote" | "reading" | "paper";
export type GraphicLayout = "stack" | "poster" | "date" | "split" | "emblem";
export type GraphicSize = "post" | "story" | "banner";

export const GRAPHIC_SIZE: Record<GraphicSize, { label: string; w: number; h: number }> = {
  post: { label: "Post", w: 1080, h: 1080 },
  story: { label: "Story", w: 1080, h: 1920 },
  banner: { label: "Banner", w: 1200, h: 600 },
};

export const GRAPHIC_TEMPLATES: [GraphicTpl, string][] = [
  ["event", "Event"],
  ["quote", "Quote"],
  ["reading", "Reading"],
  ["paper", "Paper"],
];

export const GRAPHIC_LAYOUTS: [GraphicLayout, string][] = [
  ["stack", "Stack"],
  ["poster", "Poster"],
  ["date", "Big date"],
  ["split", "Split"],
  ["emblem", "Emblem"],
];

export interface GraphicFields {
  event: { kicker: string; title: string; sub: string; date: string; time: string; where: string; cta: string; link: string };
  quote: { quote: string; attribution: string };
  reading: { session: string; topic: string; when: string };
  paper: { headline: string; bullets: string };
}

export interface GraphicOptions {
  layout: GraphicLayout;
  cw: ColourwayId;
  size: GraphicSize;
  rough: boolean;
  align: "left" | "center";
  emblem: boolean;
  grain: boolean;
  scale: number;
}

export const DEFAULT_GRAPHIC_OPTIONS: GraphicOptions = { layout: "stack", cw: "black", size: "post", rough: false, align: "left", emblem: true, grain: true, scale: 1 };

/** Suggested calls to action — the RCS tagline first. */
export const CTA_SUGGESTIONS = ["Demand the future", "Demand the impossible", "Demand the impossible. Demand the future.", "Free · all welcome", "Join the communists"];

export const DEFAULT_GRAPHIC_FIELDS: GraphicFields = {
  event: { kicker: "Revolutionary Communist Students", title: "Open meeting", sub: "", date: "", time: "", where: "", cta: "Demand the future", link: "communist.red/join" },
  quote: { quote: "Demand the impossible. Demand the future.", attribution: "Revolutionary Communist Students" },
  reading: { session: "Reading group", topic: "", when: "" },
  paper: { headline: "The Communist — out now", bullets: "" },
};

/** Long titles step down so they never overflow their box. */
const fit = (s: string | undefined, base: number, len1 = 22, len2 = 40) => ((s ?? "").length > len2 ? base * 0.62 : (s ?? "").length > len1 ? base * 0.8 : base);

const ARCHIVO = "var(--font-archivo), Archivo, sans-serif";

/**
 * `unitPx` set → fixed pixel rendering for export (1u = unitPx px).
 * Unset → fluid preview sized by its container.
 */
export function RcsGraphic<T extends GraphicTpl>({
  tpl,
  f,
  o,
  unitPx,
  maxH = 300,
}: {
  tpl: T;
  f: GraphicFields[T];
  o: GraphicOptions;
  unitPx?: number;
  maxH?: number;
}) {
  const u = (n: number) => (unitPx ? `${n * unitPx}px` : `${n}cqmin`);
  const c = COLOURWAYS[o.cw];
  const dims = GRAPHIC_SIZE[o.size];
  const center = o.align === "center";
  const wrap: CSSProperties = unitPx
    ? { width: dims.w, height: dims.h, position: "relative", overflow: "hidden" }
    : {
        aspectRatio: `${dims.w} / ${dims.h}`,
        containerType: "size",
        position: "relative",
        overflow: "hidden",
        ...(o.size === "story" ? { height: maxH, margin: "0 auto" } : { width: "100%" }),
      };

  const K: CSSProperties = { font: `800 ${u(3.1)}/1.15 ${ARCHIVO}`, letterSpacing: "0.14em", textTransform: "uppercase", margin: 0 };
  const T = (base: number, text: string, extra: CSSProperties = {}): CSSProperties => ({
    fontFamily: o.rough ? "'Brunson Rough', 'Brunson', sans-serif" : `'Brunson', ${ARCHIVO}`,
    fontWeight: 700,
    fontSize: u(fit(text, base) * o.scale),
    lineHeight: 0.9,
    textTransform: "uppercase",
    margin: 0,
    textWrap: "balance",
    ...extra,
  });
  const B: CSSProperties = { display: "inline-block", background: c.blockBg, color: c.blockFg, font: `700 ${u(4.4)}/1.25 ${ARCHIVO}`, padding: `${u(1.6)} ${u(2.6)}`, textTransform: "uppercase", letterSpacing: "0.02em" };
  const SUB: CSSProperties = { font: `600 ${u(4.4)}/1.3 ${ARCHIVO}`, margin: `${u(2.4)} 0 0` };
  const CTA: CSSProperties = { font: `800 ${u(3.6)}/1.2 ${ARCHIVO}`, letterSpacing: "0.06em", textTransform: "uppercase", margin: `${u(3)} 0 0` };
  const LINK: CSSProperties = { font: `800 ${u(3.6)}/1 ${ARCHIVO}`, letterSpacing: "0.04em", textTransform: "uppercase" };
  const fill: CSSProperties = { position: "absolute", inset: 0, background: c.bg, color: c.fg, display: "flex", flexDirection: "column" };
  const mark = (src: string, h: number, wide: boolean) =>
    o.emblem ? <img src={src} alt="" style={{ height: u(wide ? h * 0.6 : h), width: "auto", display: "block" }} /> : null;
  const foot = (link: string, src: string = c.mark, wide: boolean = c.wide) => (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: center ? "center" : "space-between", gap: u(4) }}>
      {link && <span style={LINK}>{link}</span>}
      {mark(src, 15, wide)}
    </div>
  );

  let art: ReactNode = null;

  if (tpl === "event") {
    const e = f as GraphicFields["event"];
    const dt = [e.date, e.time].filter(Boolean).join(" · ");
    const col = (children: ReactNode, gap = 1.4, mt = 4) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: center ? "center" : "flex-start", gap: u(gap), marginTop: u(mt) }}>{children}</div>
    );

    if (o.layout === "stack") {
      art = (
        <div style={{ ...fill, padding: u(7), textAlign: center ? "center" : "left" }}>
          <p style={K}>{e.kicker}</p>
          <div style={{ margin: "auto 0", paddingTop: u(4), display: "flex", flexDirection: "column", alignItems: center ? "center" : "flex-start" }}>
            <p style={T(15, e.title)}>{e.title}</p>
            {e.sub && <p style={SUB}>{e.sub}</p>}
            {col(
              <>
                {dt && <span style={B}>{dt}</span>}
                {e.where && <span style={B}>{e.where}</span>}
              </>,
            )}
            {e.cta && <p style={CTA}>{e.cta}</p>}
          </div>
          {foot(e.link)}
        </div>
      );
    } else if (o.layout === "poster") {
      art = (
        <div style={{ ...fill, padding: `${u(6)} ${u(6)} 0`, textAlign: center ? "center" : "left" }}>
          <div style={{ display: "flex", justifyContent: center ? "center" : "space-between", alignItems: "flex-start", gap: u(4) }}>
            <p style={K}>{e.kicker}</p>
            {!center && mark(c.mark, 11, c.wide)}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <p style={T(21, e.title, { lineHeight: 0.86 })}>{e.title}</p>
            {e.sub && <p style={SUB}>{e.sub}</p>}
          </div>
          <div style={{ margin: `0 -${u(6)}`, background: c.blockBg, color: c.blockFg, padding: `${u(4)} ${u(6)}`, display: "flex", flexDirection: "column", gap: u(1.4), alignItems: center ? "center" : "stretch" }}>
            <span style={{ font: `800 ${u(5)}/1.1 ${ARCHIVO}`, textTransform: "uppercase" }}>{[dt, e.where].filter(Boolean).join(" · ")}</span>
            <span style={{ display: "flex", justifyContent: center ? "center" : "space-between", gap: u(4), font: `700 ${u(3.4)}/1.1 ${ARCHIVO}`, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {e.cta && <span>{e.cta}</span>}
              {e.link && <span>{e.link}</span>}
            </span>
          </div>
        </div>
      );
    } else if (o.layout === "date") {
      const num = ((e.date || "").match(/\d{1,2}/) || [""])[0];
      const parts = (e.date || "").split(/\s+/);
      const mon = parts.length > 2 ? parts[parts.length - 1] : "";
      const wd = parts.length > 2 ? parts[0] : "";
      art = (
        <div style={{ ...fill, padding: u(7) }}>
          <p style={K}>{e.kicker}</p>
          <div style={{ margin: "auto 0", display: "flex", gap: u(5), alignItems: "flex-start" }}>
            {num && (
              <div style={{ flexShrink: 0, textAlign: "center" }}>
                <p style={{ ...K, fontSize: u(4) }}>{wd}</p>
                <p style={{ margin: 0, fontFamily: "'Brunson', sans-serif", fontSize: u(40 * o.scale), lineHeight: 0.8 }}>{num}</p>
                <p style={{ margin: `${u(1)} 0 0`, font: `800 ${u(6)}/1 ${ARCHIVO}`, textTransform: "uppercase" }}>{mon}</p>
              </div>
            )}
            <div style={{ minWidth: 0, paddingTop: u(4) }}>
              <p style={T(11, e.title)}>{e.title}</p>
              {e.sub && <p style={SUB}>{e.sub}</p>}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: u(1.4), marginTop: u(3) }}>
                {e.time && <span style={B}>{e.time}</span>}
                {e.where && <span style={B}>{e.where}</span>}
              </div>
            </div>
          </div>
          {e.cta && <p style={{ ...CTA, margin: `0 0 ${u(3)}` }}>{e.cta}</p>}
          {foot(e.link)}
        </div>
      );
    } else if (o.layout === "split") {
      art = (
        <div style={{ ...fill, textAlign: center ? "center" : "left" }}>
          <div style={{ flex: 1.35, padding: `${u(7)} ${u(7)} ${u(5)}`, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <p style={K}>{e.kicker}</p>
            <div>
              <p style={T(15, e.title)}>{e.title}</p>
              {e.sub && <p style={SUB}>{e.sub}</p>}
            </div>
          </div>
          <div style={{ flex: 1, background: c.blockBg, color: c.blockFg, padding: `${u(5)} ${u(7)} ${u(6)}`, display: "flex", flexDirection: "column" }}>
            <p style={{ margin: 0, font: `800 ${u(5.6)}/1.15 ${ARCHIVO}`, textTransform: "uppercase" }}>{dt}</p>
            <p style={{ margin: `${u(1)} 0 0`, font: `600 ${u(4.6)}/1.2 ${ARCHIVO}` }}>{e.where}</p>
            {e.cta && <p style={{ ...CTA, margin: `${u(2)} 0 0` }}>{e.cta}</p>}
            <div style={{ marginTop: "auto" }}>{foot(e.link, c.darkMark, false)}</div>
          </div>
        </div>
      );
    } else {
      art = (
        <div style={{ ...fill, padding: u(7), alignItems: "center", textAlign: "center", justifyContent: "space-between" }}>
          <p style={K}>{e.kicker}</p>
          {o.emblem && <img src={c.emblem} alt="" style={{ height: u(30), width: "auto" }} />}
          <div>
            <p style={T(12, e.title)}>{e.title}</p>
            {e.sub && <p style={SUB}>{e.sub}</p>}
            <p style={{ margin: `${u(3)} 0 0`, font: `800 ${u(4.4)}/1.2 ${ARCHIVO}`, textTransform: "uppercase" }}>{[dt, e.where].filter(Boolean).join(" · ")}</p>
          </div>
          <p style={{ ...LINK, margin: 0 }}>{[e.cta, e.link].filter(Boolean).join("  ·  ")}</p>
        </div>
      );
    }
  } else {
    let body: ReactNode = null;
    if (tpl === "quote") {
      const q = f as GraphicFields["quote"];
      body = (
        <>
          <p style={T(13, q.quote, { fontFamily: "'Brunson Rough', 'Brunson', sans-serif" })}>&ldquo;{q.quote}&rdquo;</p>
          {q.attribution && <p style={{ ...K, marginTop: u(4) }}>— {q.attribution}</p>}
        </>
      );
    } else if (tpl === "reading") {
      const r = f as GraphicFields["reading"];
      body = (
        <>
          {r.session && <span style={B}>{r.session}</span>}
          <p style={{ ...T(14, r.topic), marginTop: u(3) }}>{r.topic}</p>
          {r.when && <p style={{ font: `700 ${u(4.2)}/1.3 ${ARCHIVO}`, marginTop: u(3) }}>{r.when}</p>}
        </>
      );
    } else {
      const p = f as GraphicFields["paper"];
      body = (
        <>
          <p style={T(12, p.headline)}>{p.headline}</p>
          <div style={{ marginTop: u(4), display: "flex", flexDirection: "column", alignItems: center ? "center" : "flex-start", gap: u(1.2) }}>
            {p.bullets
              .split("\n")
              .filter(Boolean)
              .slice(0, 4)
              .map((b, i) => (
                <span key={i} style={B}>
                  {b}
                </span>
              ))}
          </div>
        </>
      );
    }
    art = (
      <div style={{ ...fill, padding: u(7), textAlign: center ? "center" : "left" }}>
        <p style={K}>{tpl === "reading" ? "RCS · Reading group" : tpl === "paper" ? "Get the paper" : "Revolutionary Communist Students"}</p>
        <div style={{ margin: "auto 0", paddingTop: u(4) }}>{body}</div>
        {foot("communist.red/join")}
      </div>
    );
  }

  return (
    <div style={wrap}>
      {art}
      {o.grain && (
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url('${R}/grain.png')`, backgroundSize: "cover", mixBlendMode: "multiply", opacity: 0.16, pointerEvents: "none" }} />
      )}
    </div>
  );
}
