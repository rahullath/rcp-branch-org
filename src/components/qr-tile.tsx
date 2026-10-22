import type { CSSProperties } from "react";
import QRCode from "qrcode";

/** What a pasted link needs before it can be a QR: a scheme, no stray spaces. */
export function normaliseLink(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
}

/** Quick starts for the QR box: what the label says and what to paste. */
export const QR_KINDS = [
  { id: "whatsapp", label: "WhatsApp group", caption: "Scan to join the WhatsApp", hint: "https://chat.whatsapp.com/…" },
  { id: "instagram", label: "Instagram", caption: "Follow us on Instagram", hint: "https://instagram.com/…" },
  { id: "link", label: "Any link", caption: "Scan to find out more", hint: "https://…" },
] as const;

export type QrCorner = "br" | "bl" | "tr" | "tl";

/** The QR as an SVG path over a square grid (1 unit per module), or null when the text can't be encoded. */
function modules(text: string): { size: number; d: string } | null {
  try {
    const { modules: m } = QRCode.create(text, { errorCorrectionLevel: "M" });
    const size = m.size;
    let d = "";
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
    return { size, d };
  } catch {
    return null;
  }
}

/**
 * A white tile with the QR and an optional caption, pinned to a corner of the
 * graphic. `u` turns design units into CSS lengths, as in RcsGraphic.
 */
export function QrTile({ link, caption, corner, size, u }: { link: string; caption: string; corner: QrCorner; size: number; u: (n: number) => string }) {
  const text = normaliseLink(link);
  const q = text ? modules(text) : null;
  if (!q) return null;
  const pos: CSSProperties = { position: "absolute", [corner[0] === "t" ? "top" : "bottom"]: u(4), [corner[1] === "l" ? "left" : "right"]: u(4) };
  return (
    <div style={{ ...pos, background: "#fff", color: "#000", padding: u(1.8), width: u(size), boxSizing: "content-box", textAlign: "center" }}>
      <svg viewBox={`-2 -2 ${q.size + 4} ${q.size + 4}`} style={{ display: "block", width: "100%", height: "auto" }} shapeRendering="crispEdges" role="img" aria-label="QR code">
        <path d={q.d} fill="#000" />
      </svg>
      {caption && <p style={{ margin: `${u(0.8)} 0 0`, font: `800 ${u(2.4)}/1.15 var(--font-archivo), Archivo, sans-serif`, letterSpacing: "0.06em", textTransform: "uppercase" }}>{caption}</p>}
    </div>
  );
}
