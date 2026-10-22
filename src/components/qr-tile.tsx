import type { CSSProperties } from "react";
import QRCode from "qrcode";

/** What a pasted link needs before it can be a QR: a scheme, no stray spaces. */
export function normaliseLink(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
}

/** Quick starts for the QR box: a short caption, and whether the branch can save a link for it. */
export const QR_KINDS = [
  { id: "whatsapp", label: "WhatsApp", caption: "whatsapp", hint: "https://chat.whatsapp.com/…", saved: "whatsapp" },
  { id: "instagram", label: "Instagram", caption: "instagram", hint: "https://instagram.com/…", saved: "instagram" },
  { id: "rsvp", label: "RSVP", caption: "rsvp", hint: "The event's share link", saved: null },
  { id: "link", label: "Other link", caption: "scan me", hint: "https://…", saved: null },
] as const;

export type QrCorner = "br" | "bl" | "tr" | "tl";

const QR_EMBLEM = "/brand/rcs/marks/hammer-sickle-red.png";
const INK = "#0a0a08";
const EYE = "#c8102e";
/** Hammer and sickle are 259×382: height ÷ width. */
const EMBLEM_RATIO = 382 / 259;
const MARGIN = 1.5;

interface Model {
  size: number;
  /** Markup for the modules, one grid unit per module; no <svg> wrapper. */
  inner: string;
  /** Half-width of the cleared centre circle (grid units); 0 when there is no emblem. */
  logoR: number;
}

/**
 * The QR as SVG markup. "brand": rounded modules, red eye centres and a cleared
 * circle for the hammer and sickle (error correction H absorbs it). "plain":
 * square black modules, nothing else.
 */
function build(text: string, brand: boolean): Model | null {
  let qr;
  try {
    qr = QRCode.create(text, { errorCorrectionLevel: brand ? "H" : "M" });
  } catch {
    return null;
  }
  const n: number = qr.modules.size;
  const logoR = brand ? n * 0.15 : 0;
  const mid = n / 2;
  const inFinder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  let dots = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!qr.modules.get(x, y)) continue;
      if (brand && inFinder(x, y)) continue;
      if (logoR && Math.hypot(x + 0.5 - mid, y + 0.5 - mid) < logoR + 0.5)
        continue;
      dots += brand
        ? `<rect x="${x}" y="${y}" width="1" height="1" rx="0.24"/>`
        : `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }
  let inner = `<g fill="${INK}"${brand ? "" : ' shape-rendering="crispEdges"'}>${dots}</g>`;
  if (brand) {
    for (const [fx, fy] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ]) {
      inner +=
        `<rect x="${fx}" y="${fy}" width="7" height="7" rx="1.6" fill="${INK}"/>` +
        `<rect x="${fx + 1}" y="${fy + 1}" width="5" height="5" rx="1" fill="#fff"/>` +
        `<rect x="${fx + 2}" y="${fy + 2}" width="3" height="3" rx="0.8" fill="${EYE}"/>`;
    }
    inner += `<circle cx="${mid}" cy="${mid}" r="${logoR + 0.2}" fill="#fff"/>`;
  }
  return { size: n, inner, logoR };
}

/** The emblem's size and position as fractions of the grid (for the overlay and the export). */
function emblemBox(m: Model) {
  const h = m.logoR * 2 * 0.86;
  const w = h / EMBLEM_RATIO;
  return { w, h, x: m.size / 2 - w / 2, y: m.size / 2 - h / 2 };
}

/**
 * A scannable tile for the graphic: white ground, a frame and caption band in the
 * graphic's colours, the QR itself, and (brand style) the hammer and sickle in the
 * centre. `u` turns design units into CSS lengths, as in RcsGraphic.
 */
export function QrTile({
  link,
  caption,
  corner,
  size,
  brand,
  lower,
  frame,
  frameText,
  u,
}: {
  link: string;
  caption: string;
  corner: QrCorner;
  size: number;
  brand: boolean;
  /** Caption in lowercase instead of capitals. */
  lower: boolean;
  frame: string;
  frameText: string;
  u: (n: number) => string;
}) {
  const text = normaliseLink(link);
  const m = text ? build(text, brand) : null;
  if (!m) return null;
  const pos: CSSProperties = {
    position: "absolute",
    [corner[0] === "t" ? "top" : "bottom"]: u(4),
    [corner[1] === "l" ? "left" : "right"]: u(4),
  };
  const e = emblemBox(m);
  const span = m.size + MARGIN * 2;
  const pad = brand ? 1.2 : 1.8;
  return (
    <div
      style={{
        ...pos,
        width: u(size),
        boxSizing: "content-box",
        background: "#fff",
        color: INK,
        padding: u(pad),
        ...(brand ? { border: `${u(1)} solid ${frame}` } : {}),
        textAlign: "center",
      }}
    >
      <div style={{ position: "relative" }}>
        <svg
          viewBox={`${-MARGIN} ${-MARGIN} ${span} ${span}`}
          style={{ display: "block", width: "100%", height: "auto" }}
          role="img"
          aria-label="QR code"
          dangerouslySetInnerHTML={{ __html: m.inner }}
        />
        {brand && (
          // eslint-disable-next-line @next/next/no-img-element -- exported with html-to-image, which needs a plain <img>
          <img
            src={QR_EMBLEM}
            alt=""
            style={{
              position: "absolute",
              left: `${((e.x + MARGIN) / span) * 100}%`,
              top: `${((e.y + MARGIN) / span) * 100}%`,
              width: `${(e.w / span) * 100}%`,
              height: "auto",
              display: "block",
            }}
          />
        )}
      </div>
      {caption && (
        <p
          style={{
            margin: brand ? `${u(1)} ${u(-pad)} ${u(-pad)}` : `${u(0.8)} 0 0`,
            padding: brand ? `${u(1.2)} ${u(1)}` : 0,
            background: brand ? frame : undefined,
            color: brand ? frameText : INK,
            font: `800 ${u(lower ? 3 : 2.4)}/1.15 var(--font-archivo), Archivo, sans-serif`,
            letterSpacing: lower ? "0.01em" : "0.06em",
            textTransform: lower ? "none" : "uppercase",
          }}
        >
          {caption}
        </p>
      )}
    </div>
  );
}

async function emblemDataUri(): Promise<string> {
  const blob = await (await fetch(QR_EMBLEM)).blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** The QR on its own, as a white tile: a standalone SVG string (emblem embedded) for dropping into Canva or any editor. */
export async function qrStandaloneSvg(
  link: string,
  brand: boolean,
): Promise<string | null> {
  const text = normaliseLink(link);
  const m = text ? build(text, brand) : null;
  if (!m) return null;
  const span = m.size + MARGIN * 2;
  let img = "";
  if (brand) {
    const e = emblemBox(m);
    img = `<image href="${await emblemDataUri()}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-MARGIN} ${-MARGIN} ${span} ${span}" width="1024" height="1024"><rect x="${-MARGIN}" y="${-MARGIN}" width="${span}" height="${span}" fill="#fff"/>${m.inner}${img}</svg>`;
}

/** SVG string → PNG data URL at 1024px. */
export async function svgToPng(svg: string): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1024;
    canvas.getContext("2d")!.drawImage(img, 0, 0, 1024, 1024);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
