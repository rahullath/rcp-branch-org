import type { Actor } from "./auth";
import type { Comrade, ContactStage, ContactTier, EventType, Location, Material, Profile, ReadingGroupAudience } from "./types";
import { createContact, createEvent, createLocation, createMaterial, createPledge, createReadingGroup, listContacts, listEvents, listLocations, listMaterials, listPledges, listProfiles, listReadingGroups } from "./data";
import { createAgendaAction, createComrade, createSharedRead, createTopicIdea, listAgendaActions, listComrades, listTopicIdeas, setFollowUp, setMainRead, listFollowUps, updateFollowUp } from "./data-extras";
import { resolveTitle } from "./link-title";
import { londonDay } from "./follow-through";

const londonDayOf = (iso: string) => londonDay(Date.parse(iso));
import { resolvePerson } from "./agenda-import-apply";
import { formatPhone, normalizePhone } from "./phone";
import { contactOwner } from "./types";
import { titleKey, titleWords } from "./wellred";

/* Words that say what kind of thing it is, not which one. */
const GENERIC = new Set(["communist", "communism", "marxist", "marxism", "revolutionary", "party", "socialist", "branch", "meeting", "group", "reading", "sale", "paper", "stall", "session", "social", "discussion", "talk", "intro", "introduction", "part", "week", "weekly", "monthly", "copies", "copy", "book", "pamphlet", "send", "make", "sort", "ask", "check", "get", "post", "about"]);
const keyWords = (s: string) => new Set(titleWords(s).filter((w) => w.length >= 4 && !GENERIC.has(w)));

/**
 * Up to three existing names that look like `name`: same Wellred title, or
 * a shared distinctive word. It can't know "France and Spain protests" is
 * "European revolutions" — that's why officers' imports go to the admin.
 */
function lookalikes(name: string, existing: string[]) {
  const key = titleKey(name);
  const mine = keyWords(name);
  const out: string[] = [];
  for (const e of existing) {
    if (out.length >= 3 || out.includes(e)) continue;
    if (titleKey(e) === key || [...keyWords(e)].some((w) => mine.has(w))) out.push(e);
  }
  return out;
}

/*
 * The "tidy-up helper" import. Any notes dump goes through a chat assistant with
 * IMPORT_PROMPT and comes back as one JSON object, split by module. This
 * reads that object, matches names to people (accounts, People, initials),
 * shows what it will do, and does it. Same dry-run/apply pattern as the
 * agenda import, so the preview is exactly what gets saved.
 */

export { IMPORT_MODULES, MODULE_LABEL, importPrompt, type ImportModule, type JsonImportLine } from "./import-prompt";
import type { ImportModule, ImportRow, JsonImportLine } from "./import-prompt";

const EVENT_TYPES: EventType[] = ["paper_sale", "social", "branch", "open_meeting", "uni_stall", "phonebank", "postering", "mobilization", "one_on_one", "committee", "reading_group"];
const TIERS: ContactTier[] = ["priority", "potential", "cold"];
const STAGES: ContactStage[] = ["met", "talked", "came", "joined"];
const LOCATION_KINDS: Location["category"][] = ["paper_sale", "meeting", "uni_stall", "social"];
const MATERIAL_KINDS: Material["category"][] = ["gear", "book", "literature"];
const AUDIENCES: ReadingGroupAudience[] = ["members", "new", "contacts", "mixed"];

const str = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
const time = (v: unknown) => (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim().padStart(5, "0") : null);
/** A section's rows, typed from import-fields.json: reading a field the prompt doesn't ask for won't compile. */
const list = <M extends ImportModule>(data: Record<string, unknown>, key: M): ImportRow<M>[] =>
  Array.isArray(data[key]) ? (data[key] as ImportRow<M>[]).filter((x) => x && typeof x === "object") : [];

/** London wall-clock → ISO (BST/GMT handled by trying both offsets). */
function londonISO(day: string, hhmm: string) {
  for (const off of ["+01:00", "+00:00"]) {
    const d = new Date(`${day}T${hhmm}:00${off}`);
    const back = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    if (back === hhmm) return d.toISOString();
  }
  return new Date(`${day}T${hhmm}:00Z`).toISOString();
}

export async function runJsonImport(actor: Actor, data: Record<string, unknown>, opts: { apply: boolean; only?: Partial<Record<ImportModule, number[]>>; skip?: ImportModule[]; by?: string | null }) {
  const { apply } = opts;
  /** Who it's from: an approved request runs as the admin but is led by whoever sent it. */
  const by = opts.by ?? actor.id;
  const lines: JsonImportLine[] = [];
  const warnings: string[] = [];
  const wanted = (m: ImportModule, i: number) => !opts.skip?.includes(m) && (!opts.only || (opts.only[m] ?? []).includes(i));
  const [profiles, comradeRows, contacts, materials, locations, follows, events, actions, groups, pledges, ideas] = await Promise.all([
    listProfiles(),
    listComrades(),
    listContacts(),
    listMaterials(),
    listLocations(),
    listFollowUps(),
    listEvents({}, true),
    listAgendaActions(),
    listReadingGroups(),
    listPledges(),
    listTopicIdeas(),
  ]);
  const same = (a?: string | null, b?: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
  const comrades: Comrade[] = [...comradeRows];

  /** A written name → an account, or a People entry (made if new, only when applying). */
  async function who(raw: string | null): Promise<{ profile: Profile | null; comrade: Comrade | null; label: string } | null> {
    if (!raw) return null;
    const p = resolvePerson(raw, profiles, comrades);
    if (p.status === "all") return null;
    const profile = p.id ? (profiles.find((x) => x.id === p.id) ?? null) : null;
    let comrade = p.comradeId ? (comrades.find((c) => c.id === p.comradeId) ?? null) : null;
    if (!profile && !comrade && apply) {
      comrade = await createComrade(actor, { name: raw.trim(), aliases: [] });
      comrades.push(comrade);
    }
    return { profile, comrade, label: profile?.name ?? comrade?.name ?? `${raw.trim()} (new)` };
  }

  // ---- people ---------------------------------------------------------------
  for (const [i, r] of list(data, "people").entries()) {
    const name = str(r.name, 80);
    if (!name) continue;
    const short = Array.isArray(r.short_names) ? (r.short_names as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const exists = comrades.some((c) => c.name.toLowerCase() === name.toLowerCase());
    const similar = exists ? [] : [...comrades.map((c) => c.name), ...profiles.map((p) => p.name)].filter((n) => n.split(/\s+/)[0].toLowerCase() === name.split(/\s+/)[0].toLowerCase()).slice(0, 3);
    lines.push({ module: "people", index: i, label: name, detail: exists ? "already in People" : short.length ? `also ${short.join(", ")}` : "added to People", change: exists ? "skip" : "create", similar });
    if (!exists && apply && wanted("people", i)) comrades.push(await createComrade(actor, { name, aliases: short }));
  }

  // ---- contacts -------------------------------------------------------------
  const mine = contacts.filter((c) => contactOwner(c) === actor.id && !c.archived);
  for (const [i, r] of list(data, "contacts").entries()) {
    const name = str(r.name, 80);
    if (!name) continue;
    const phone = normalizePhone(str(r.phone, 40));
    const dupe = mine.some((c) => (phone && c.phone === phone) || (!phone && c.name.toLowerCase() === name.toLowerCase()));
    const tier = TIERS.includes(r.tier as ContactTier) ? (r.tier as ContactTier) : "potential";
    const stage = STAGES.includes(r.stage as ContactStage) ? (r.stage as ContactStage) : "met";
    lines.push({ module: "contacts", index: i, label: name, detail: dupe ? "already one of your contacts" : [formatPhone(phone), tier !== "potential" ? tier : null, stage !== "met" ? stage : null, str(r.notes, 60)].filter(Boolean).join(" · "), change: dupe ? "skip" : "create" });
    if (!dupe && apply && wanted("contacts", i)) {
      const now = new Date().toISOString();
      await createContact(actor, {
        name,
        phone,
        about: str(r.notes, 1000),
        tier,
        location_type: str(r.met_at, 40) ?? "other",
        met_date: date(r.met_date),
        status: "new",
        stage,
        labels: [],
        notes: [],
        consent_given_at: now,
        last_contact_at: now,
      });
    }
  }

  // ---- events ---------------------------------------------------------------
  for (const [i, r] of list(data, "events").entries()) {
    const title = str(r.title, 120);
    const day = date(r.date);
    if (!title || !day) {
      if (title) warnings.push(`Event “${title}” has no date (YYYY-MM-DD), so it's skipped.`);
      continue;
    }
    const type = EVENT_TYPES.includes(r.type as EventType) ? (r.type as EventType) : "social";
    const at = time(r.time) ?? "18:00";
    const dupe = events.some((e) => !e.archived && same(e.title, title) && londonDayOf(e.start_time) === day);
    const near = events.filter((e) => !e.archived && Math.abs(Date.parse(e.start_time) - Date.parse(`${day}T12:00:00Z`)) <= 3 * 86400_000);
    const similar = dupe ? [] : [...new Set([...lookalikes(title, near.map((e) => e.title)), ...near.filter((e) => e.event_type === type).map((e) => e.title)])].slice(0, 3).map((t) => `${t} (${londonDayOf(near.find((e) => e.title === t)!.start_time)})`);
    const nReads = Array.isArray(r.readings) ? r.readings.length : 0;
    lines.push({ module: "events", index: i, label: title, detail: dupe ? `already on ${day}` : `${day} ${at} · ${str(r.location, 60) ?? "place TBC"} · ${type.replace("_", " ")}${nReads ? ` · ${nReads} reading${nReads === 1 ? "" : "s"}` : ""}`, change: dupe ? "skip" : "create", similar });
    if (!dupe && apply && wanted("events", i)) {
      const target = num(r.people_needed);
      const meeting = type === "branch" || type === "committee";
      const chair = meeting ? await who(str(r.chair, 60)) : null;
      const minutes = meeting ? await who(str(r.minutes, 60)) : null;
      const lead = await who(str(r.lead, 60));
      const issue = type === "paper_sale" || type === "uni_stall" ? str(r.issue, 20) : null;
      const created = await createEvent(actor, {
        title,
        event_type: type,
        start_time: londonISO(day, at),
        location: str(r.location, 120) ?? "",
        description: str(r.description, 1000),
        is_mobilization: type === "mobilization",
        lead_id: lead?.profile?.id ?? by,
        ...(chair?.profile ? { chair_id: chair.profile.id } : {}),
        ...(minutes?.profile ? { minutes_id: minutes.profile.id } : {}),
        ...(target ? { target } : {}),
        ...(issue ? { paper_issue: issue } : {}),
      });
      // Readings: the first is the main one; titles fixed up from the page if missing.
      const readings = Array.isArray(r.readings) ? (r.readings as { title?: unknown; url?: unknown }[]).filter((x) => typeof x?.url === "string" && /^https?:\/\//.test(x.url as string)).slice(0, 6) : [];
      for (const [n, x] of readings.entries()) {
        const read = await createSharedRead(actor, { url: x.url as string, title: await resolveTitle(str(x.title, 200), x.url as string), note: null, event_id: created.id });
        if (n === 0) await setMainRead(read);
      }
    }
  }

  // ---- actions --------------------------------------------------------------
  for (const [i, r] of list(data, "actions").entries()) {
    const task = str(r.task, 300);
    if (!task) continue;
    const whoRaw = str(r.who, 60);
    if (!whoRaw || /^(anyone|all|everyone|someone|tbc|\?)$/i.test(whoRaw)) {
      // Nobody given it: an open ask anyone can take.
      const due = date(r.due);
      const dupe = actions.some((a) => !a.done && same(a.text, task));
      lines.push({ module: "actions", index: i, label: task, detail: dupe ? "already on the list" : `no one yet${due ? ` · by ${due}` : ""}`, change: dupe ? "skip" : "create" });
      if (!dupe && apply && wanted("actions", i)) await createAgendaAction(actor, { text: task, owner_id: null, due_date: due, source: "Import" });
      continue;
    }
    const owner = await who(whoRaw);
    if (!owner) continue;
    const due = date(r.due);
    const dupe = actions.some((a) => !a.done && same(a.text, task) && ((owner.profile && a.owner_id === owner.profile.id) || (owner.comrade && a.owner_comrade_id === owner.comrade.id)));
    const theirs = actions.filter((a) => !a.done && ((owner.profile && a.owner_id === owner.profile.id) || (owner.comrade && a.owner_comrade_id === owner.comrade.id)));
    const similar = dupe ? [] : lookalikes(task, theirs.map((a) => a.text));
    lines.push({ module: "actions", index: i, label: task, detail: dupe ? `${owner.label} already has this` : `${owner.label}${due ? ` · by ${due}` : " · no date"}`, change: dupe ? "skip" : "create", similar });
    if (!dupe && apply && wanted("actions", i)) {
      await createAgendaAction(actor, { text: task, owner_id: owner.profile?.id ?? owner.comrade?.profile_id ?? null, owner_comrade_id: owner.comrade?.id ?? null, due_date: due, source: "Import" });
    }
  }

  // ---- follow-ups -----------------------------------------------------------
  for (const [i, r] of list(data, "follow_ups").entries()) {
    const personName = str(r.person, 80);
    const byName = str(r.followed_up_by, 80);
    if (!personName || !byName) continue;
    const by = await who(byName);
    const person = await who(personName);
    if (!by || !person) continue;
    const pid = person.comrade?.id ?? null;
    const current = pid ? follows.find((f) => f.person_id === pid) : null;
    const same = current && ((by.profile && current.follower_id === by.profile.id) || (by.comrade && current.follower_comrade_id === by.comrade.id));
    lines.push({ module: "follow_ups", index: i, label: `${by.label} → ${person.label}`, detail: same ? "already the case" : current ? "handover" : "new", change: same ? "skip" : "create" });
    if (!same && apply && wanted("follow_ups", i)) {
      let personId = pid;
      if (!personId && person.profile) {
        personId = comrades.find((c) => c.profile_id === person.profile!.id)?.id ?? (await createComrade(actor, { name: person.profile.name, profile_id: person.profile.id })).id;
      }
      if (personId) {
        const f = await setFollowUp(actor, personId, by.profile ? { profile_id: by.profile.id } : { comrade_id: by.comrade?.id ?? null });
        const along = await who(str(r.going_with, 80));
        if (along?.profile && along.profile.id !== f.follower_id) await updateFollowUp(f.id, { with_id: along.profile.id });
      }
    }
  }

  // ---- materials ------------------------------------------------------------
  for (const [i, r] of list(data, "materials").entries()) {
    const name = str(r.name, 120);
    if (!name) continue;
    const dupe = materials.some((m) => m.name.toLowerCase() === name.toLowerCase());
    const holder = await who(str(r.held_by, 60));
    const qty = num(r.quantity) ?? 1;
    const wantedQty = num(r.to_order) ?? 0;
    lines.push({
      module: "materials",
      index: i,
      label: name,
      detail: dupe ? "already in Materials" : [`${qty} in stock`, holder ? `with ${holder.label}` : null, wantedQty ? `order ${wantedQty}` : null].filter(Boolean).join(" · "),
      change: dupe ? "skip" : "create",
      similar: dupe ? [] : lookalikes(name, materials.map((m) => m.name)),
    });
    if (!dupe && apply && wanted("materials", i)) {
      await createMaterial(actor, {
        name,
        category: MATERIAL_KINDS.includes(r.category as Material["category"]) ? (r.category as Material["category"]) : "gear",
        qty,
        status: holder ? "in_use" : "available",
        holder_id: holder?.profile?.id ?? null,
        holder_comrade_id: holder && !holder.profile ? (holder.comrade?.id ?? null) : null,
        holder_label: holder ? null : str(r.where, 80),
        note: str(r.notes, 300),
        wanted: wantedQty,
        purpose: str(r.purpose, 60),
      });
    }
  }

  // ---- pledges --------------------------------------------------------------
  for (const [i, r] of list(data, "pledges").entries()) {
    const amount = num(r.amount);
    const person = await who(str(r.person, 60));
    if (!amount || !person) continue;
    const dupe = pledges.some((pl) => (person.profile && pl.user_id === person.profile.id) || (person.comrade && pl.comrade_id === person.comrade.id));
    lines.push({ module: "pledges", index: i, label: `${person.label} £${amount}`, detail: dupe ? "already has a pledge" : "branch levy, unpaid", change: dupe ? "skip" : "create" });
    if (!dupe && apply && wanted("pledges", i)) {
      await createPledge(actor, person.profile ? { user_id: person.profile.id, amount, status: "unpaid" } : { user_id: null, comrade_id: person.comrade?.id ?? null, amount, status: "unpaid" });
    }
  }

  // ---- reading groups -------------------------------------------------------
  for (const [i, r] of list(data, "reading_groups").entries()) {
    const title = str(r.title, 120);
    if (!title) continue;
    const running = !!str(r.when, 80);
    const dupe = groups.some((g) => !g.archived && (same(g.title, title) || same(g.book, str(r.text, 120))));
    const live = groups.filter((g) => !g.archived);
    const similar = dupe ? [] : [...new Set([...lookalikes(title, live.map((g) => g.title)), ...lookalikes(str(r.text, 120) ?? title, live.map((g) => g.book ?? "").filter(Boolean))])].slice(0, 3);
    lines.push({ module: "reading_groups", index: i, label: title, detail: dupe ? "already a reading group" : running ? `${str(r.when, 80)} · ${str(r.where, 80) ?? "place TBC"}` : "proposed", change: dupe ? "skip" : "create", similar });
    if (!dupe && apply && wanted("reading_groups", i)) {
      await createReadingGroup(actor, {
        title,
        book: str(r.text, 120) ?? title,
        capacity: 6,
        status: running ? "running" : "proposed",
        runner_id: running ? by : null,
        schedule: str(r.when, 80),
        cadence: str(r.when, 80),
        location: str(r.where, 120),
        audience: AUDIENCES.includes(r.for as ReadingGroupAudience) ? (r.for as ReadingGroupAudience) : null,
        plan: str(r.plan, 1000),
      });
    }
  }

  // ---- topic ideas ----------------------------------------------------------
  for (const [i, r] of list(data, "topic_ideas").entries()) {
    const title = str(r.title, 160);
    if (!title) continue;
    const kind = r.for === "open_meeting" ? "open_meeting" : "branch";
    const live = ideas.filter((t) => !t.used_event_id);
    const dupe = live.some((t) => same(t.title, title));
    lines.push({
      module: "topic_ideas",
      index: i,
      label: title,
      detail: dupe ? "already suggested" : kind === "open_meeting" ? "for an open meeting" : "for a branch discussion",
      change: dupe ? "skip" : "create",
      similar: dupe ? [] : lookalikes(title, live.map((t) => t.title)),
    });
    if (!dupe && apply && wanted("topic_ideas", i)) await createTopicIdea(actor, { title, kind, note: str(r.note, 500) });
  }

  // ---- locations ------------------------------------------------------------
  for (const [i, r] of list(data, "locations").entries()) {
    const name = str(r.name, 120);
    if (!name) continue;
    const dupe = locations.some((l) => l.name.toLowerCase() === name.toLowerCase());
    lines.push({ module: "locations", index: i, label: name, detail: dupe ? "already a location" : [str(r.area, 40), str(r.kind, 20)].filter(Boolean).join(" · "), change: dupe ? "skip" : "create", similar: dupe ? [] : lookalikes(name, locations.map((l) => l.name)) });
    if (!dupe && apply && wanted("locations", i)) {
      await createLocation(actor, {
        name,
        category: LOCATION_KINDS.includes(r.kind as Location["category"]) ? (r.kind as Location["category"]) : "paper_sale",
        description: str(r.notes, 500),
        area: str(r.area, 40),
        tags: Array.isArray(r.tags) ? (r.tags as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 8) : [],
      });
    }
  }

  const leftover = Array.isArray(data.notes) ? (data.notes as unknown[]).filter((x): x is string => typeof x === "string") : [];
  if (leftover.length) warnings.push(`Not imported (didn't fit anywhere): ${leftover.slice(0, 5).join(" · ")}${leftover.length > 5 ? "…" : ""}`);
  return { lines, warnings, applied: apply };
}
