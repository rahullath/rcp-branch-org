/* Client-safe half of the JSON import: the modules and the prompt for a chat assistant. */

/*
 * Every field the importer is asked for, per section, lives in import-fields.json. The prompt is
 * written from it, the importer's rows are typed from it (reading anything else won't compile),
 * and `npm run build` checks the importer reads every one of them.
 */
import FIELDS from "./import-fields.json";

export type ImportRow<M extends ImportModule> = { [K in keyof (typeof FIELDS)[M]]?: unknown };

export const IMPORT_MODULES = ["contacts", "events", "actions", "follow_ups", "materials", "pledges", "reading_groups", "topic_ideas", "locations", "people"] as const;
export type ImportModule = (typeof IMPORT_MODULES)[number];

export const MODULE_LABEL: Record<ImportModule, string> = {
  contacts: "Contacts",
  events: "Events",
  actions: "Actions",
  follow_ups: "Follow-ups",
  materials: "Materials",
  pledges: "Levy pledges",
  reading_groups: "Reading groups",
  topic_ideas: "Topic ideas",
  locations: "Locations",
  people: "People",
};

export interface JsonImportLine {
  module: ImportModule;
  index: number;
  label: string;
  detail: string;
  change: "create" | "skip";
  /** Existing things that look like the same one, worded differently — a person decides. */
  similar?: string[];
}

/** The prompt to paste into a chat assistant with your notes. Today's date makes "next Tuesday" resolvable. */
export function importPrompt(today: string, branch: string) {
  return `You are helping a branch of the Revolutionary Communist Party (${branch}, UK) move its notes into its organising app. Below my message I'll paste a dump of notes — chat messages, meeting notes, lists. Turn it into ONE JSON object and reply with ONLY that JSON (no commentary, no code fences).

Today is ${today} (Europe/London). Resolve relative dates ("Tuesday", "next week") to YYYY-MM-DD. Times are 24h "HH:MM".
Keep people's names exactly as written (initials like "JB" or "BN" are fine — the app matches them). Never invent anything: if something is unclear, leave the field out. Anything that doesn't fit goes in "notes".
Books, pamphlets and IDOMs: use the full title as Wellred Books sells it if you know it. IDOM issues: "In Defence of Marxism #41: The Fall of Woman" (number, then the issue's title if you know it).
Readings for a meeting: put the main one first; the rest are "also good".
Contact stage: "talked" once they've had a proper chat or coffee, "came" once they came to something, "joined" if they joined; otherwise "met".
Phone numbers: UK by default — write them as +44… (07700 900123 → +447700900123).

Use only the sections that apply; omit empty ones:
{
${IMPORT_MODULES.map((m) => `  "${m}": [{ ${Object.entries(FIELDS[m]).map(([k, v]) => `"${k}": ${v}`).join(", ")} }],`).join("\n")}
  "notes": ["anything left over"]
}

Here are my notes:
`;
}
