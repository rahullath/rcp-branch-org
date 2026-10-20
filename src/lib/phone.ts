/*
 * Phone numbers are stored in international form (+447700900123) so WhatsApp
 * links and duplicate checks work. People type them every way imaginable;
 * UK is the default, anything already starting with + is left as is.
 */

/** "07700 900123" / "7700900123" / "447700900123" / "+44 (0)7700…" → "+447700900123". Unknown shapes come back trimmed. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "+44") return null;
  let d = trimmed.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) return d.replace(/^\+440/, "+44");
  if (d.startsWith("44") && d.length >= 12) return "+" + d.replace(/^440/, "44");
  if (d.startsWith("0") && d.length === 11) return "+44" + d.slice(1);
  if (d.length === 10 && d.startsWith("7")) return "+44" + d;
  return trimmed;
}

/** "+447700900123" → "+44 7700 900123" for display. */
export function formatPhone(p: string | null | undefined) {
  if (!p) return "";
  const m = p.match(/^\+44(\d{4})(\d{6})$/);
  return m ? `+44 ${m[1]} ${m[2]}` : p;
}

/** Does it look like a usable mobile number once normalized? */
export function looksLikePhone(p: string | null | undefined) {
  return !!p && /^\+\d{10,15}$/.test(p);
}

export interface ContactLine {
  name: string;
  phone: string | null;
  notes: string | null;
  line: string;
}

// UK mobiles in their usual spellings, then any +country number.
const PHONE_RES = [
  /(?:\+|00)44\s?\(?0?\)?\s?7\d{3}[\s-]?\d{3}[\s-]?\d{3}(?!\d)/,
  /(?<!\d)07\d{3}[\s-]?\d{3}[\s-]?\d{3}(?!\d)/,
  /(?<!\d)447\d{9}(?!\d)/,
  /\+\d{1,3}[\s-]?\d[\d\s-]{7,13}\d(?!\d)/,
];

/**
 * A pasted list of contacts, one per line, in whatever shape it came in:
 * "Ben 07700 900456", "Harrison - +44 7700 900123 - 32, interested, bought materials",
 * "Naomi, Ivy's friend". Name is what's before the number (or before the
 * first comma when there isn't one); notes are what's left.
 */
export function parseContactLines(raw: string): ContactLine[] {
  const out: ContactLine[] = [];
  for (const original of raw.split(/\r?\n/)) {
    const line = original.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim();
    if (!line || line.length < 2) continue;
    const m = PHONE_RES.map((re) => line.match(re)).find((x) => x && x.index !== undefined);
    let name = line;
    let rest = "";
    let phone: string | null = null;
    if (m && m.index !== undefined) {
      phone = normalizePhone(m[0]);
      name = line.slice(0, m.index);
      rest = line.slice(m.index + m[0].length);
    } else {
      const cut = line.search(/\s[-–—:]\s|,|\t|\s\(/);
      if (cut > 0) {
        name = line.slice(0, cut);
        rest = line.slice(cut);
      }
    }
    name = name.replace(/[\s,;:–—-]+$/, "").replace(/\t/g, " ").trim();
    let notes = rest.replace(/^[\s,;:–—\-\t)(]+/, "").replace(/[\s)]+$/, "").trim();
    // "Naomi (Ivy's friend)" — the bracket is a note, not part of the name.
    const paren = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    if (paren && paren[1]) {
      name = paren[1].trim();
      notes = [paren[2].trim(), notes].filter(Boolean).join(" · ");
    }
    if (!name) continue;
    out.push({ name: name.slice(0, 80), phone, notes: notes || null, line: original.trim() });
  }
  return out;
}
