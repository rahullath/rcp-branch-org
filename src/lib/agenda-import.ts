import type { AgendaSection, PrepLink, PrepLinkKind } from "./types";

/*
 * Reads the branch's agenda doc (the Google Doc the secretary already
 * writes: header, burning questions, political discussion + preparation,
 * organisational items, Branch Programme table, Follow-up table) as pasted
 * text or text pulled out of a PDF. Pure: no I/O, so it can be checked
 * against real docs and run in a preview before anything is saved.
 *
 * Tables survive copy-paste as one cell per line (and from PDFs/tab-separated
 * exports as several cells per line); both shapes are handled.
 */

export interface ParsedItem {
  section: AgendaSection;
  title: string;
  duration: number | null;
  /** Who leads it, as written ("JB", "All", "Morgan?"). */
  lead: string | null;
  prep: PrepLink[];
}

export interface ParsedProgrammeRow {
  topic: string;
  comrade: string | null;
  /** Written with a "?" — asked but not confirmed. */
  tentative: boolean;
  /** YYYY-MM-DD, or null when the doc gives no date yet. */
  date: string | null;
}

export interface ParsedFollowUp {
  names: string[];
  by: string;
}

export interface ParsedAgenda {
  title: string | null;
  meeting: {
    date: string | null;
    start: string | null;
    end: string | null;
    meet: string | null;
    location: string | null;
    chair: string | null;
    minutes: string | null;
  };
  items: ParsedItem[];
  programme: ParsedProgrammeRow[];
  followUps: ParsedFollowUp[];
  warnings: string[];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Day + month without a year → the year that puts it nearest to `now` (agendas are about now). */
function inferYear(month: number, day: number, now: Date): string {
  const y = now.getFullYear();
  const candidates = [y - 1, y, y + 1].map((yy) => ({ yy, t: Date.UTC(yy, month - 1, day) }));
  candidates.sort((a, b) => Math.abs(a.t - now.getTime()) - Math.abs(b.t - now.getTime()));
  return `${candidates[0].yy}-${pad(month)}-${pad(day)}`;
}

/** "12th October", "Mon 12 Oct 2026", "12/10", "12/10/26". */
export function parseDate(text: string, now: Date): string | null {
  const named = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?(?:\s+(\d{4}))?/);
  if (named) {
    const m = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase());
    if (m >= 0) {
      const day = Number(named[1]);
      return named[3] ? `${named[3]}-${pad(m + 1)}-${pad(day)}` : inferYear(m + 1, day, now);
    }
  }
  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    if (numeric[3]) {
      const yy = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3];
      return `${yy}-${pad(month)}-${pad(day)}`;
    }
    return inferYear(month, day, now);
  }
  return null;
}

const time = (s: string) => {
  const m = s.match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${pad(Number(m[1]))}:${m[2]}` : null;
};

const DATE_TOKEN = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/;

/** "KT", "Morgan?", "Tom", "Comrade Ana", "Jo Bloggs" — a name, not a topic. */
export function looksLikePerson(token: string): boolean {
  const t = token.replace(/\?$/, "").trim();
  if (!t) return false;
  if (/^[A-Z]{2,4}$/.test(t)) return true;
  if (/^all$/i.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length > 2) return false;
  return words.every((w) => /^[A-Z][a-z'’-]+$/.test(w)) && !/^(The|Topic|Comrade|Date|Name|Reading|Branch)$/.test(t);
}

function prepKind(url: string, hint: string): PrepLinkKind {
  const h = hint.toLowerCase();
  if (/spotify\.com/.test(url)) return "spotify";
  if (/youtu\.?be/.test(url) || /video/.test(h)) return "youtube";
  if (/podcast|audio|listen/.test(h)) return "podcast";
  return "article";
}

/** A readable label: the hint if it says something, else the article's slug. */
function prepLabel(url: string, kind: PrepLinkKind, hint: string): string {
  const cleanHint = hint.replace(/^[-–:\s]+/, "").trim();
  if (cleanHint && !/^(video|article|audio|podcast|text)$/i.test(cleanHint)) return cleanHint;
  if (kind === "youtube") return "Video";
  if (kind === "podcast" || kind === "spotify") return "Audio";
  try {
    const slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    const words = slug.replace(/\.(html?|php)$/, "").replace(/[-_]+/g, " ").trim();
    if (words) return words.charAt(0).toUpperCase() + words.slice(1);
  } catch {
    /* not a URL we can read — fall through */
  }
  return "Article";
}

type Mode = "header" | "items" | "org" | "programme" | "follow";

/** "Title (10) -JB" → title, duration, lead. A lead needs a space before the dash, so "Anti-war" stays whole. */
function splitItem(line: string): { title: string; duration: number | null; lead: string | null } {
  let rest = line.trim().replace(/[:\s]+$/, "");
  let lead: string | null = null;
  const leadMatch = rest.match(/\s[-–—]\s*([^-–—]{1,40})$/);
  if (leadMatch) {
    lead = leadMatch[1].trim();
    rest = rest.slice(0, leadMatch.index).trim();
  }
  let duration: number | null = null;
  const dur = rest.match(/\((\d{1,3})\s*(?:min|mins|m)?\)/i);
  if (dur) {
    duration = Number(dur[1]);
    rest = (rest.slice(0, dur.index) + rest.slice(dur.index! + dur[0].length)).replace(/\s{2,}/g, " ").trim();
  }
  return { title: rest.replace(/[:\s]+$/, "").replace(/!+$/, "").trim(), duration, lead };
}

export function parseAgendaDoc(raw: string, now = new Date()): ParsedAgenda {
  const out: ParsedAgenda = {
    title: null,
    meeting: { date: null, start: null, end: null, meet: null, location: null, chair: null, minutes: null },
    items: [],
    programme: [],
    followUps: [],
    warnings: [],
  };
  const text = raw.replace(/\r/g, "").replace(/ /g, " ");
  // Tab-separated rows (Docs/Sheets exports) become separate cells.
  const lines = text.split("\n").flatMap((l) => l.split("\t")).map((l) => l.trim());

  let mode: Mode = "header";
  let lastPolitical: ParsedItem | null = null;
  const programmeTokens: string[] = [];
  const followTokens: string[] = [];

  for (const line of lines) {
    if (!line) continue;
    const lower = line.toLowerCase();

    // ---- section switches --------------------------------------------------
    if (/^branch programme\b/.test(lower)) {
      mode = "programme";
      continue;
    }
    if (/^follow[\s-]?ups?\b/.test(lower)) {
      mode = "follow";
      continue;
    }
    const bq = line.match(/^burning questions?\s*(?:\((\d+)\))?\s*:?\s*(.*)$/i);
    if (bq) {
      const item: ParsedItem = { section: "political", title: bq[2] ? `Burning questions: ${bq[2].trim()}` : "Burning questions", duration: bq[1] ? Number(bq[1]) : null, lead: null, prep: [] };
      out.items.push(item);
      mode = "items";
      continue;
    }
    const pol = line.match(/^political discussion\s*(?:\((\d+)\))?\s*:?\s*(.*)$/i);
    if (pol) {
      const { title, lead } = splitItem(pol[2] || "Political discussion");
      lastPolitical = { section: "political", title, duration: pol[1] ? Number(pol[1]) : null, lead, prep: [] };
      out.items.push(lastPolitical);
      mode = "items";
      continue;
    }
    if (/^(paper|organi[sz]ational)\s+(discussion|sales|items|business)?\s*(\(\d+\))?\s*:?\s*$/i.test(line)) {
      mode = "org";
      continue;
    }
    if (/^preparation\b/i.test(line)) {
      const after = line.replace(/^preparation\s*:?\s*/i, "");
      if (after) addPrep(after);
      continue;
    }

    // ---- by mode -------------------------------------------------------------
    if (mode === "header") {
      const kv = line.match(/^(location|venue|where|chair|minutes|minute[- ]taker)\s*:\s*(.*)$/i);
      if (kv) {
        const key = kv[1].toLowerCase();
        const value = kv[2].trim() || null;
        if (key === "chair") out.meeting.chair = value;
        else if (key.startsWith("minute")) out.meeting.minutes = value;
        else out.meeting.location = value && /^tbc$/i.test(value) ? null : value;
        continue;
      }
      if (!out.meeting.date) {
        const d = parseDate(line, now);
        if (d) {
          out.meeting.date = d;
          const times = [...line.matchAll(/(\d{1,2}[:.]\d{2})/g)].map((m) => time(m[1]));
          const meet = line.match(/meet\D{0,6}(\d{1,2}[:.]\d{2})/i);
          out.meeting.meet = meet ? time(meet[1]) : null;
          const own = times.filter((t) => t !== out.meeting.meet);
          out.meeting.start = own[0] ?? null;
          out.meeting.end = own[1] ?? null;
          continue;
        }
      }
      if (!out.title && /agenda|meeting|branch/i.test(line)) {
        out.title = line;
        continue;
      }
      continue;
    }

    if (/https?:\/\//.test(line)) {
      addPrep(line);
      continue;
    }

    if (mode === "org" || mode === "items") {
      // A plain line after the political block is an organisational item too.
      const { title, duration, lead } = splitItem(line);
      if (title) out.items.push({ section: "organizational", title, duration, lead, prep: [] });
      continue;
    }

    if (mode === "programme") {
      if (/^(topic|comrade|date|comrades who should|who|lead[- ]?off)\b/i.test(line)) continue;
      programmeTokens.push(...splitRowLine(line));
      continue;
    }

    if (mode === "follow") {
      if (/^(name|followed up by|follow[- ]?up by|by)$/i.test(line) || /^name\b.*\bby$/i.test(line)) continue;
      followTokens.push(...splitFollowLine(line));
    }
  }

  function addPrep(line: string) {
    const target = lastPolitical ?? out.items.filter((i) => i.section === "political").pop();
    const urls = [...line.matchAll(/https?:\/\/\S+/g)];
    urls.forEach((m, i) => {
      const url = m[0].replace(/[),.]+$/, "");
      // The hint is whatever follows the link up to the next one ("-video").
      const hint = line.slice(m.index! + m[0].length, urls[i + 1]?.index ?? line.length).trim();
      const kind = prepKind(url, hint);
      if (!target) {
        out.warnings.push(`A link has no political item to attach to: ${url}`);
        return;
      }
      if (!target.prep.some((p) => p.url === url)) target.prep.push({ url, kind, label: prepLabel(url, kind, hint) });
    });
  }

  out.programme = parseProgramme(programmeTokens);
  out.followUps = parseFollowUps(followTokens);

  if (!out.meeting.date) out.warnings.push("No meeting date found — add a line like “12th October 18:30”.");
  for (const r of out.programme) if (!r.date) out.warnings.push(`“${r.topic}” has no date yet, so it isn't scheduled.`);
  return out;
}

/** A PDF row like "Reform or Revolution: Greece KT 12/10" → its cells. */
function splitRowLine(line: string): string[] {
  const dateAtEnd = line.match(/^(.*\S)\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)$/);
  if (!dateAtEnd) return [line];
  const rest = dateAtEnd[1];
  const person = rest.match(/^(.*\S)\s+([A-Z]{2,4}\??|[A-Z][a-z'’-]+\?)$/);
  // "Lenin and Trotsky?" — a name after a joining word belongs to the topic.
  const joined = person && /\b(and|or|of|the|&|vs|on|in)$/i.test(person[1]);
  return person && !joined ? [person[1], person[2], dateAtEnd[2]] : [rest, dateAtEnd[2]];
}

/**
 * Rows of (topic, comrade?, date?). Cells arrive one per token; empty cells
 * are simply missing, so a row ends at its date or when the next topic starts.
 */
function parseProgramme(tokens: string[]): ParsedProgrammeRow[] {
  const rows: ParsedProgrammeRow[] = [];
  let cur: ParsedProgrammeRow | null = null;
  const now = new Date();
  for (const tok of tokens) {
    if (DATE_TOKEN.test(tok)) {
      if (cur) {
        cur.date = parseDate(tok, now);
        rows.push(cur);
        cur = null;
      }
      continue;
    }
    if (cur && !cur.comrade && looksLikePerson(tok)) {
      cur.comrade = tok.replace(/\?$/, "").trim();
      cur.tentative = tok.trim().endsWith("?");
      continue;
    }
    if (cur) rows.push(cur);
    cur = { topic: tok.replace(/\s+\?$/, "?").trim(), comrade: null, tentative: false, date: null };
  }
  if (cur) rows.push(cur);
  return rows;
}

/**
 * A PDF row "Nell, Kit Dan" → ["Nell, Kit", "Dan"]: the last word is the
 * follower when it isn't part of the comma list. A cell on its own line
 * ("Nell, Kit, Ben, Jo", "Dan") is left alone.
 */
function splitFollowLine(line: string): string[] {
  const m = line.match(/^(.*[^,\s])\s+([A-Z][a-z'’-]+)$/);
  if (!m || /,\s*$/.test(m[1]) === true) return [line];
  return [m[1], m[2]];
}

/** Alternating cells: who (one or a comma list) → followed up by. */
function parseFollowUps(tokens: string[]): ParsedFollowUp[] {
  const out: ParsedFollowUp[] = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const names = tokens[i]
      .split(/\s*,\s*|\s+and\s+|\s*&\s*/)
      .map((n) => n.trim())
      .filter(Boolean);
    const by = tokens[i + 1].trim();
    if (names.length && by) out.push({ names, by });
  }
  return out;
}

/** "Morgan?" → "Morgan (tbc)", the way lead-offs are shown when unconfirmed. */
export function leadLabel(name: string, tentative: boolean) {
  return tentative ? `${name} (tbc)` : name;
}

/** Same topic written two ways ("Reform or Revolution" / "Reform or Revolution: Greece"). */
export function sameTopic(a: string, b: string) {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const x = n(a);
  const y = n(b);
  return !!x && !!y && (x === y || x.startsWith(y + " ") || y.startsWith(x + " "));
}
