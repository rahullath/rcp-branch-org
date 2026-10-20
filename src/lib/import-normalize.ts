import type { Contact, ImportKind } from "./types";

/**
 * Import normalization + duplicate matching.
 *
 * Stage-1 rule: recognized fields for a `kind` become `payload`; everything
 * else becomes `extras` (dumped into the target record's `notes[]` on
 * verify). Matching only fires for `people` (contacts have the most
 * meaningful keys: phone + name); other kinds get matched when their verify
 * step lands.
 */

const CONTACT_FIELDS = new Set([
  "name",
  "phone",
  "met_date",
  "location_type",
  "about",
  "what_worked",
  "paper_sold",
  "pamphlet_sold",
  "status",
  "labels",
]);

export function classifyPayload(
  kind: ImportKind,
  payload: Record<string, unknown>,
): { payload: Record<string, unknown>; extras: Record<string, unknown> } {
  if (kind === "people") {
    const recognized: Record<string, unknown> = {};
    const extras: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload ?? {})) {
      if (value === undefined) continue;
      if (value === null || value === "") continue;
      if (CONTACT_FIELDS.has(key)) recognized[key] = value;
      else extras[key] = value;
    }
    return { payload: recognized, extras };
  }
  // Unknown schema → keep everything in extras until the kind's verify step
  // defines its recognized fields.
  return { payload: {}, extras: { ...(payload ?? {}) } };
}

/** Normalized UK/E.164-ish phone for matching: digits only, `0` → `44`. */
export function normalizePhone(raw?: unknown): string {
  if (typeof raw !== "string") return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return "";
  return digits.startsWith("0") ? `44${digits.slice(1)}` : digits;
}

/** Name for matching: lowercased, titles stripped, whitespace collapsed. */
export function normalizeName(raw?: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/^(comrade|mr|mrs|ms|miss|dr|sister|brother|com)\b[.\s]+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface MatchCandidate {
  match_id?: string;
  match_score?: number;
}

/**
 * Suggest the most likely duplicate contact for an imported `people` row.
 * Phone match wins over everything; then normalized full-name; a weak
 * fallback of first-name + shared phone tail catches transcriptions.
 */
export function matchContact(
  payload: Record<string, unknown>,
  contacts: Contact[],
): MatchCandidate {
  const phone = normalizePhone(payload.phone);
  const name = normalizeName(payload.name);
  const first = name.split(" ")[0];
  const phoneTail = phone.slice(-6);

  let best: MatchCandidate = {};
  let bestScore = 0;

  for (const c of contacts) {
    let score = 0;
    if (phone && c.phone && normalizePhone(c.phone) === phone) {
      score = 0.95;
    } else if (name && normalizeName(c.name) === name) {
      score = 0.8;
    } else if (
      first &&
      phoneTail.length >= 6 &&
      normalizeName(c.name).split(" ")[0] === first &&
      c.phone &&
      normalizePhone(c.phone).slice(-6) === phoneTail
    ) {
      score = 0.6;
    }
    if (score > bestScore) {
      bestScore = score;
      best = score > 0 ? { match_id: c.id, match_score: score } : {};
    }
  }
  return best;
}