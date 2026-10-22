import type {
  ActivityLogEntry,
  AgendaContribution,
  AgendaItem,
  Availability,
  AwayRange,
  ChecklistItems,
  Contact,
  Event,
  EventChecklist,
  ImportBatch,
  ImportKind,
  ImportRow,
  Location,
  Material,
  PaperSale,
  Pledge,
  Profile,
  ReadingGroup,
  ReadingGroupMember,
  Session,
  SocialPost,
  Transaction,
  Weekday,
} from "./types";
import { IMPORT_VERIFIERS, contactOwner, itemChecked } from "./types";
import { classifyPayload, matchContact } from "./import-normalize";
import { canVerifyImportRow } from "./permissions";
import { isSupabaseConfigured } from "./config";
import { tidyName } from "./identity";
import {
  deleteRow,
  findRow,
  insertRow,
  listRows,
  updateRow,
} from "./dev-store";
import { createAdminClient, createClient } from "./supabase/server";
import type { Actor } from "./auth";

/** Drops undefined/null keys — for optional columns added by later migrations. */
function definedOnly(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

/* ============================= profiles ============================= */

export async function listProfiles(): Promise<Profile[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("*").order("name");
    return ((data ?? []) as Profile[]).map(tidyName);
  }
  return listRows<Profile>("profiles");
}

/**
 * People from other branches going to (or helping at) a district/national event: just name, initials
 * and branch, so the event can show who's coming instead of "A comrade". Not in `listProfiles`, so
 * they never turn up in pickers.
 */
export async function listEventVisitors(): Promise<Profile[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("event_visitors");
  return ((data ?? []) as { id: string; name: string; initials: string | null; branch_name: string | null }[]).map(
    (v) => tidyName({ id: v.id, name: v.name, initials: v.initials, role: [], branch_tag: v.branch_name ?? undefined } as Profile),
  );
}

export async function getProfile(id: string): Promise<Profile | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("*").eq("id", id).single();
    return data ? tidyName(data as Profile) : null;
  }
  return findRow<Profile>("profiles", id) ?? null;
}

export async function updateProfile(id: string, patch: Partial<Profile>): Promise<Profile | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("profiles").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return (data as Profile) ?? null;
  }
  return updateRow<Profile>("profiles", id, patch) ?? null;
}

export async function countGeneralSecretaries(): Promise<number> {
  const profiles = await listProfiles();
  return profiles.filter((p) => p.role.includes("general_secretary")).length;
}

export async function deleteProfile(id: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
  return deleteRow("profiles", id);
}

/* ============================= contacts ============================= */

export interface ContactFilters {
  search?: string;
  status?: string;
  scope?: "mine" | "all";
}

const STATUS_ORDER: Record<string, number> = {
  call_today: 0,
  new: 1,
  contacted: 2,
  in_reading_group: 3,
  cold: 4,
};

/** Postgres "undefined column" — the owner_id migration hasn't been applied yet. */
function isMissingOwnerColumn(error: { message?: string; code?: string } | null) {
  return !!error && (error.code === "42703" || /owner_id/.test(error.message ?? ""));
}

/** An unknown column, from Postgres (42703) or PostgREST's schema cache (PGRST204). */
function isMissingColumn(error: { message?: string; code?: string } | null) {
  return !!error && (error.code === "42703" || error.code === "PGRST204");
}

/**
 * Insert with optional newer columns; if the database hasn't had that
 * migration yet, retry without them so core features keep working.
 */
async function insertTolerant(table: string, base: Record<string, unknown>, extra: Record<string, unknown>) {
  const supabase = await createClient();
  let res = await supabase.from(table).insert({ ...base, ...extra }).select().single();
  if (Object.keys(extra).length > 0 && isMissingColumn(res.error)) {
    res = await supabase.from(table).insert(base).select().single();
  }
  return res;
}

/**
 * Contacts are personal: each comrade works their own list. Pass `actor` to scope to theirs; `scope: "all"` is honoured only
 * for the secretary (re-assigning a departed comrade's list).
 * Omit `actor` for internal, server-side use (import dedupe matching).
 */
export async function listContacts(filters: ContactFilters = {}, actor?: Actor | null): Promise<Contact[]> {
  const seeAll = filters.scope === "all" && !!actor?.role.includes("general_secretary");
  const mine = (c: Contact) => !actor || seeAll || contactOwner(c) === actor.id;

  let rows: Contact[];
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    let query = supabase.from("contacts").select("*").eq("archived", false).order("created_at", { ascending: false });
    if (filters.status) query = query.eq("status", filters.status);
    const { data } = await query;
    rows = ((data ?? []) as Contact[]).filter(mine);
  } else {
    rows = listRows<Contact>("contacts").filter((c) => !c.archived).filter(mine);
    if (filters.status) rows = rows.filter((c) => c.status === filters.status);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter((c) => c.name.toLowerCase().includes(q) || (c.labels ?? []).some((l) => l.toLowerCase().includes(q)));
    return rows;
  }
  return rows.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
}

export async function getContact(id: string): Promise<Contact | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("contacts").select("*").eq("id", id).single();
    return (data as Contact) ?? null;
  }
  return findRow<Contact>("contacts", id) ?? null;
}

export async function createContact(actor: Actor, data: Partial<Contact>): Promise<Contact> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const payload = {
        name: data.name,
        met_date: data.met_date ?? null,
        location_type: data.location_type ?? null,
        about: data.about ?? null,
        what_worked: data.what_worked ?? null,
        phone: data.phone ?? null,
        paper_sold: data.paper_sold ?? null,
        pamphlet_sold: data.pamphlet_sold ?? null,
        status: data.status ?? "new",
        labels: data.labels ?? [],
        notes: data.notes ?? [],
        buddy_id: data.buddy_id ?? null,
        consent_given_at: data.consent_given_at ?? null,
        created_by: actor.id,
        created_at: now,
    };
    const withNewColumns = definedOnly({ tier: data.tier, met_event_id: data.met_event_id, last_contact_at: data.last_contact_at, stage: data.stage, stage_at: data.stage && data.stage !== "met" ? now : undefined });
    let { data: row, error } = await insertTolerant("contacts", { ...payload, owner_id: actor.id }, withNewColumns);
    // Tolerate the window before the owner_id migration is applied.
    if (isMissingOwnerColumn(error)) {
      ({ data: row, error } = await supabase.from("contacts").insert(payload).select().single());
    }
    if (error) throw new Error(error.message);
    return row as Contact;
  }
  return insertRow<Contact>("contacts", {
    ...data,
    id: undefined,
    status: (data.status ?? "new") as Contact["status"],
    labels: data.labels ?? [],
    notes: data.notes ?? [],
    consent_given_at: data.consent_given_at ?? null,
    created_by: actor.id,
    owner_id: actor.id,
    created_at: now,
  });
}

export async function updateContact(id: string, patch: Partial<Contact>): Promise<Contact | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("contacts").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return (data as Contact) ?? null;
  }
  return updateRow<Contact>("contacts", id, patch) ?? null;
}

export async function addContactNote(id: string, text: string, actorId: string): Promise<Contact | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data: current } = await supabase.from("contacts").select("notes").eq("id", id).single();
    const notes = [...((current?.notes as Contact["notes"]) ?? [])];
    notes.push({ text, created_by: actorId, created_at: new Date().toISOString() });
    const { data, error } = await supabase
      .from("contacts")
      .update({ notes })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Contact;
  }
  const contact = findRow<Contact>("contacts", id);
  if (!contact) return null;
  const notes = [...(contact.notes ?? [])];
  notes.push({ text, created_by: actorId, created_at: new Date().toISOString() });
  return updateRow<Contact>("contacts", id, { notes }) ?? null;
}

/** Soft delete — organizing history on a contact is worth keeping around. */
export async function archiveContact(id: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("contacts").update({ archived: true }).eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
  return Boolean(updateRow<Contact>("contacts", id, { archived: true }));
}

/* ============================= events ============================= */

export interface EventFilters {
  type?: string;
}

/** Committee meetings someone was invited to without being an officer. RLS hides committee rows from members, so this reads with the service role. */
async function invitedCommittee(viewerId: string): Promise<Event[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data } = await admin.from("events").select("*").eq("event_type", "committee").eq("archived", false).contains("invitees", [viewerId]);
  return (data ?? []) as Event[];
}

/**
 * `canSeeCommittee` (officers) sees every committee meeting; with `viewerId`
 * a member also sees the ones they were invited to.
 */
export async function listEvents(filters: EventFilters = {}, canSeeCommittee = false, viewerId?: string): Promise<Event[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    let query = supabase.from("events").select("*").eq("archived", false).order("start_time");
    if (filters.type && filters.type !== "all" && filters.type !== "mobilize") {
      query = query.eq("event_type", filters.type);
    }
    const { data } = await query;
    let rows = (data ?? []) as Event[];
    if (filters.type === "mobilize") rows = rows.filter((e) => e.is_mobilization);
    if (!canSeeCommittee) {
      rows = rows.filter((e) => e.event_type !== "committee");
      if (viewerId && (!filters.type || filters.type === "all" || filters.type === "committee")) rows = [...rows, ...(await invitedCommittee(viewerId))].sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return rows.sort((a, b) => (a.is_mobilization === b.is_mobilization ? 0 : a.is_mobilization ? -1 : 1));
  }

  let rows = listRows<Event>("events").filter((e) => !e.archived);
  if (filters.type && filters.type !== "all") {
    if (filters.type === "mobilize") rows = rows.filter((e) => e.is_mobilization);
    else rows = rows.filter((e) => e.event_type === filters.type);
  }
  if (!canSeeCommittee) rows = rows.filter((e) => e.event_type !== "committee" || (!!viewerId && (e.invitees ?? []).includes(viewerId)));
  return rows.sort((a, b) => (a.is_mobilization === b.is_mobilization ? 0 : a.is_mobilization ? -1 : 1));
}

export async function getEvent(id: string): Promise<Event | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("events").select("*").eq("id", id).single();
    return (data as Event) ?? null;
  }
  return findRow<Event>("events", id) ?? null;
}

/** An event as this person may see it: officers and invitees get committee meetings, nobody else does. */
export async function getEventFor(id: string, viewerId: string, isOfficer: boolean): Promise<Event | null> {
  const e = await getEvent(id);
  if (e) return e.event_type !== "committee" || isOfficer || (e.invitees ?? []).includes(viewerId) ? e : null;
  if (isOfficer || !isSupabaseConfigured) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("events").select("*").eq("id", id).eq("event_type", "committee").contains("invitees", [viewerId]).maybeSingle();
  return (data as Event) ?? null;
}

export async function createEvent(actor: Actor, data: Partial<Event>): Promise<Event> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured) {
    const { data: row, error } = await insertTolerant(
      "events",
      {
        title: data.title,
        event_type: data.event_type ?? "branch",
        start_time: data.start_time ?? now,
        location: data.location ?? "",
        description: data.description ?? null,
        is_mobilization: data.is_mobilization ?? false,
        meetup_time: data.meetup_time ?? null,
        chair_id: data.chair_id ?? null,
        minutes_id: data.minutes_id ?? null,
        posted_by: actor.id,
        created_at: now,
      },
      // Optional columns: left out when unset.
      definedOnly({
        lead_id: data.lead_id,
        target: data.target,
        session_id: data.session_id,
        status: data.status,
        confirm_by: data.confirm_by,
        paper_issue: data.paper_issue,
        copies_out: data.copies_out,
        reading_group_id: data.reading_group_id,
        scope: data.scope,
      }),
    );
    if (error) throw new Error(error.message);
    return row as Event;
  }
  return insertRow<Event>("events", {
    ...(data as Partial<Event>),
    id: undefined,
    event_type: (data.event_type ?? "branch") as Event["event_type"],
    is_mobilization: data.is_mobilization ?? false,
    chair_id: data.chair_id ?? null,
    minutes_id: data.minutes_id ?? null,
    posted_by: actor.id,
    created_at: now,
  });
}

export async function updateEvent(id: string, patch: Partial<Event>): Promise<Event | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("events").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return (data as Event) ?? null;
  }
  return updateRow<Event>("events", id, patch) ?? null;
}

/** Soft delete — an event's RSVPs/agenda items are organizing history. */
export async function archiveEvent(id: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("events").update({ archived: true }).eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
  return Boolean(updateRow<Event>("events", id, { archived: true }));
}

/** Archiving an event doesn't cascade (soft delete, not a real DELETE, so
 * the FK's on-delete-cascade never fires) — call this alongside archiveEvent
 * so a deleted meeting's agenda items don't end up invisibly orphaned
 * (still pointing at a now-hidden event_id, but not in the "unassigned" bucket either). */
export async function archiveAgendaItemsForEvent(eventId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.from("agenda_items").update({ archived: true }).eq("event_id", eventId);
    return;
  }
  const db = (await import("./dev-store")).devStore.load();
  for (const row of db.agenda as unknown as { event_id?: string | null; archived?: boolean }[]) {
    if (row.event_id === eventId) row.archived = true;
  }
  (await import("./dev-store")).devStore.save(db);
}

export async function listRsvps(): Promise<{ event_id: string; user_id: string; status: string; name?: string }[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("rsvps").select("*");
    return (data ?? []) as { event_id: string; user_id: string; status: string; name?: string }[];
  }
  return (await import("./dev-store")).devStore.db.rsvps as {
    event_id: string;
    user_id: string;
    status: string;
    name?: string;
  }[];
}

export async function clearRsvp(actor: Actor, eventId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("rsvps").delete().eq("event_id", eventId).eq("user_id", actor.id);
    if (error) throw new Error(error.message);
    return;
  }
  const db = (await import("./dev-store")).devStore.load();
  db.rsvps = (db.rsvps as { event_id: string; user_id: string }[]).filter(
    (r) => !(r.event_id === eventId && r.user_id === actor.id),
  ) as typeof db.rsvps;
  (await import("./dev-store")).devStore.save(db);
}

export async function setRsvp(
  actor: Actor,
  eventId: string,
  status: "going" | "maybe" | "no",
): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    // Single round trip — (event_id, user_id) is the primary key.
    const { error } = await supabase
      .from("rsvps")
      .upsert({ event_id: eventId, user_id: actor.id, status }, { onConflict: "event_id,user_id" });
    if (error) throw new Error(error.message);
    return;
  }
  const db = (await import("./dev-store")).devStore.load();
  const rows = db.rsvps as { event_id: string; user_id: string; status: string; name?: string }[];
  const idx = rows.findIndex((r) => r.event_id === eventId && r.user_id === actor.id);
  if (idx >= 0) rows[idx].status = status;
  else rows.push({ event_id: eventId, user_id: actor.id, status });
  (await import("./dev-store")).devStore.save(db);
}

/* ============================= sessions ============================= */

export async function listSessions(): Promise<Session[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("sessions").select("*").order("position");
    return (data ?? []) as Session[];
  }
  return listRows<Session>("sessions").sort((a, b) => a.position - b.position);
}

export async function updateSession(id: string, patch: Partial<Session>): Promise<Session | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("sessions").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return (data as Session) ?? null;
  }
  return updateRow<Session>("sessions", id, patch) ?? null;
}

export async function createSession(data: Partial<Session> & { topic: string }): Promise<Session> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("sessions")
      .insert({
        series_id: data.series_id ?? "series-1",
        position: data.position ?? 1,
        topic: data.topic,
        session_date: data.session_date ?? null,
        start_time: data.start_time ?? null,
        location: data.location ?? null,
        leadoff_name: data.leadoff_name ?? null,
        chair_name: data.chair_name ?? null,
        reading_link: data.reading_link ?? null,
        prep_questions: data.prep_questions ?? [],
        summary: data.summary ?? null,
        completed: data.completed ?? false,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as Session;
  }
  return insertRow<Session>("sessions", {
    ...(data as Partial<Session>),
    id: undefined,
    completed: data.completed ?? false,
  });
}

export async function deleteSession(id: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
  return deleteRow("sessions", id);
}

/* ============================= materials ============================= */

export async function listMaterials(): Promise<Material[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("materials").select("*").order("created_at");
    return (data ?? []) as Material[];
  }
  return listRows<Material>("materials");
}

export async function getMaterial(id: string): Promise<Material | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("materials").select("*").eq("id", id).single();
    return (data as Material) ?? null;
  }
  return findRow<Material>("materials", id) ?? null;
}

export async function createMaterial(actor: Actor, data: Partial<Material>): Promise<Material> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("materials")
      .insert({
        name: data.name,
        description: data.description ?? null,
        icon: data.icon ?? "inventory_2",
        category: data.category ?? "gear",
        qty: data.qty ?? 1,
        status: data.status ?? "available",
        holder_id: data.holder_id ?? null,
        holder_label: data.holder_label ?? (data.holder_id || data.holder_comrade_id ? null : "Branch cupboard"),
        note: data.note ?? null,
        created_by: actor.id,
        created_at: now,
        ...definedOnly({ holder_comrade_id: data.holder_comrade_id, wanted: data.wanted, purpose: data.purpose }),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as Material;
  }
  return insertRow<Material>("materials", {
    ...(data as Partial<Material>),
    id: undefined,
    category: (data.category ?? "gear") as Material["category"],
    status: (data.status ?? "available") as Material["status"],
    created_by: actor.id,
    created_at: now,
  });
}

export async function updateMaterial(id: string, patch: Partial<Material>): Promise<Material | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("materials")
      .update({ ...patch, last_updated: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return (data as Material) ?? null;
  }
  return updateRow<Material>("materials", id, { ...patch, last_updated: new Date().toISOString() }) ?? null;
}

export async function deleteMaterial(id: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("materials").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
  return deleteRow("materials", id);
}

/* ============================= locations ============================= */

export async function listLocations(): Promise<Location[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("locations").select("*").eq("archived", false).order("name");
    return (data ?? []) as Location[];
  }
  return listRows<Location>("locations").filter((l) => !l.archived);
}

export async function getLocation(id: string): Promise<Location | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("locations").select("*").eq("id", id).single();
    return (data as Location) ?? null;
  }
  return findRow<Location>("locations", id) ?? null;
}

export async function createLocation(actor: Actor, data: Partial<Location>): Promise<Location> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("locations")
      .insert({
        name: data.name,
        category: data.category ?? "paper_sale",
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        description: data.description ?? null,
        created_by: actor.id,
        created_at: now,
        ...definedOnly({ area: data.area, tags: data.tags && data.tags.length ? data.tags : undefined, book_url: data.book_url ?? undefined }),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as Location;
  }
  return insertRow<Location>("locations", {
    ...(data as Partial<Location>),
    id: undefined,
    category: (data.category ?? "paper_sale") as Location["category"],
    created_by: actor.id,
    created_at: now,
  });
}

export async function updateLocation(id: string, patch: Partial<Location>): Promise<Location | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("locations").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return (data as Location) ?? null;
  }
  return updateRow<Location>("locations", id, patch) ?? null;
}

/** Soft delete — organizing history on a location is worth keeping around. */
export async function archiveLocation(id: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("locations").update({ archived: true }).eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
  return Boolean(updateRow<Location>("locations", id, { archived: true }));
}

/* ============================= event checklists ============================= */


export async function listEventChecklists(): Promise<EventChecklist[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("event_checklists").select("*");
    return (data ?? []) as EventChecklist[];
  }
  return listRows<EventChecklist>("event_checklists");
}

export async function getEventChecklistByEvent(eventId: string): Promise<EventChecklist | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("event_checklists").select("*").eq("event_id", eventId).maybeSingle();
    return (data as EventChecklist) ?? null;
  }
  return listRows<EventChecklist>("event_checklists").find((c) => c.event_id === eventId) ?? null;
}

/** Merges `patch.items` into whatever exists, creating the row on first
 * write. Flips to complete (and un-acknowledged, for the badge) the moment
 * every item is ticked and a photo is attached — sticky once set, doesn't
 * un-complete if something's later unticked. */
export async function upsertEventChecklist(
  actor: Actor,
  eventId: string,
  patch: { items?: ChecklistItems; photo_url?: string | null; video_urls?: string[] },
): Promise<EventChecklist> {
  const existing = await getEventChecklistByEvent(eventId);
  const mergedItems: ChecklistItems = { ...(existing?.items ?? {}) };
  const now = new Date().toISOString();
  if (patch.items) {
    for (const [rawKey, value] of Object.entries(patch.items)) {
      const key = rawKey as keyof ChecklistItems;
      mergedItems[key] = { checked: itemChecked(value), by: actor.id, at: now };
    }
  }
  const photoUrl = patch.photo_url !== undefined ? patch.photo_url : (existing?.photo_url ?? null);
  const videoUrls = patch.video_urls !== undefined ? patch.video_urls : (existing?.video_urls ?? []);

  // The photo is what Social needs; unticked boxes shouldn't keep it from them.
  const nowComplete = !!photoUrl;
  const alreadyComplete = !!existing?.completed_at;
  const completion =
    nowComplete && !alreadyComplete
      ? { completed_by: actor.id, completed_at: now, acknowledged: false }
      : {};

  const row = {
    event_id: eventId,
    items: mergedItems,
    photo_url: photoUrl,
    video_urls: videoUrls,
    ...completion,
  };

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    if (existing) {
      const { data, error } = await supabase
        .from("event_checklists")
        .update(row)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as EventChecklist;
    }
    const { data, error } = await supabase
      .from("event_checklists")
      .insert({ ...row, created_by: actor.id, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as EventChecklist;
  }

  if (existing) {
    return updateRow<EventChecklist>("event_checklists", existing.id, row) as EventChecklist;
  }
  return insertRow<EventChecklist>("event_checklists", {
    ...row,
    acknowledged: false,
    created_by: actor.id,
    created_at: new Date().toISOString(),
  });
}

/** Clears the Social badge — for one checklist (its photo was turned into a post) or all of them. */
export async function acknowledgeCompletedChecklists(id?: string): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    let query = supabase
      .from("event_checklists")
      .update({ acknowledged: true })
      .not("completed_at", "is", null)
      .eq("acknowledged", false);
    if (id) query = query.eq("id", id);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return;
  }
  for (const c of listRows<EventChecklist>("event_checklists")) {
    if (c.completed_at && !c.acknowledged && (!id || c.id === id)) {
      updateRow<EventChecklist>("event_checklists", c.id, { acknowledged: true });
    }
  }
}

/* ============================= availability ============================= */

export async function listAvailability(activity?: string): Promise<Availability[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    let query = supabase.from("availability").select("*");
    if (activity) query = query.eq("activity", activity);
    const { data } = await query;
    return (data ?? []) as Availability[];
  }
  const rows = listRows<Availability>("availability");
  return activity ? rows.filter((a) => a.activity === activity) : rows;
}

/** Self-serve upsert keyed by (user_id, activity) — a member sets their
 * own standing days, no officer gating. */
export async function upsertAvailability(
  userId: string,
  activity: string,
  patch: { days?: Weekday[]; note?: string | null; slots?: string[]; away?: AwayRange[] },
): Promise<Availability> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("availability")
      .upsert(
        { user_id: userId, activity, ...patch, updated_at: now },
        { onConflict: "user_id,activity" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Availability;
  }
  const existing = listRows<Availability>("availability").find((a) => a.user_id === userId && a.activity === activity);
  if (existing) {
    return updateRow<Availability>("availability", existing.id, { ...patch, updated_at: now }) as Availability;
  }
  return insertRow<Availability>("availability", {
    user_id: userId,
    activity,
    days: patch.days ?? [],
    slots: patch.slots ?? [],
    away: patch.away ?? [],
    note: patch.note ?? null,
    updated_at: now,
  });
}

/* ============================= reading groups ============================= */

export async function listReadingGroups(): Promise<ReadingGroup[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("reading_groups").select("*").eq("archived", false).order("title");
    return (data ?? []) as ReadingGroup[];
  }
  return listRows<ReadingGroup>("reading_groups").filter((g) => !g.archived);
}

export async function getReadingGroup(id: string): Promise<ReadingGroup | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("reading_groups").select("*").eq("id", id).single();
    return (data as ReadingGroup) ?? null;
  }
  return findRow<ReadingGroup>("reading_groups", id) ?? null;
}

export async function createReadingGroup(actor: Actor, data: Partial<ReadingGroup>): Promise<ReadingGroup> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured) {
    const { data: row, error } = await insertTolerant(
      "reading_groups",
      {
        title: data.title,
        runner_id: data.runner_id === undefined ? actor.id : data.runner_id,
        cadence: data.cadence ?? null,
        current_chapter: data.current_chapter ?? null,
        created_by: actor.id,
        created_at: now,
      },
      definedOnly({
        book: data.book,
        capacity: data.capacity,
        status: data.status,
        schedule: data.schedule,
        location: data.location,
        audience: data.audience,
        level: data.level,
        plan: data.plan,
      }),
    );
    if (error) throw new Error(error.message);
    return row as ReadingGroup;
  }
  return insertRow<ReadingGroup>("reading_groups", {
    ...(data as Partial<ReadingGroup>),
    id: undefined,
    runner_id: data.runner_id === undefined ? actor.id : data.runner_id,
    archived: false,
    created_by: actor.id,
    created_at: now,
  });
}

export async function updateReadingGroup(id: string, patch: Partial<ReadingGroup>): Promise<ReadingGroup | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("reading_groups").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return (data as ReadingGroup) ?? null;
  }
  return updateRow<ReadingGroup>("reading_groups", id, patch) ?? null;
}

/** Soft delete — matches locations/contacts/events; history stays queryable. */
export async function archiveReadingGroup(id: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("reading_groups").update({ archived: true }).eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
  return Boolean(updateRow<ReadingGroup>("reading_groups", id, { archived: true }));
}

export async function listReadingGroupMembers(groupId: string): Promise<ReadingGroupMember[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("reading_group_members").select("*").eq("group_id", groupId);
    return (data ?? []) as ReadingGroupMember[];
  }
  return listRows<ReadingGroupMember>("reading_group_members").filter((m) => m.group_id === groupId);
}

export async function listAllReadingGroupMembers(): Promise<ReadingGroupMember[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("reading_group_members").select("*");
    return (data ?? []) as ReadingGroupMember[];
  }
  return listRows<ReadingGroupMember>("reading_group_members");
}

export async function joinReadingGroup(groupId: string, userId: string, isLead = false): Promise<ReadingGroupMember> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured) {
    const { data, error } = await insertTolerant(
      "reading_group_members",
      { group_id: groupId, user_id: userId, joined_at: now },
      isLead ? { is_lead: true } : {},
    );
    if (error) throw new Error(error.message);
    return data as ReadingGroupMember;
  }
  return insertRow<ReadingGroupMember>("reading_group_members", {
    group_id: groupId,
    user_id: userId,
    is_lead: isLead,
    joined_at: now,
  });
}

/** "I'll co-lead" / step back — a member flips their own lead flag. */
export async function setReadingGroupLead(groupId: string, userId: string, isLead: boolean): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("reading_group_members").update({ is_lead: isLead }).eq("group_id", groupId).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return;
  }
  const row = listRows<ReadingGroupMember>("reading_group_members").find((m) => m.group_id === groupId && m.user_id === userId);
  if (row) updateRow<ReadingGroupMember>("reading_group_members", row.id, { is_lead: isLead });
}

export async function leaveReadingGroup(groupId: string, userId: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("reading_group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return true;
  }
  const row = listRows<ReadingGroupMember>("reading_group_members").find(
    (m) => m.group_id === groupId && m.user_id === userId,
  );
  return row ? deleteRow("reading_group_members", row.id) : false;
}

/* ============================= agenda ============================= */

export async function listAgenda(): Promise<AgendaItem[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("agenda_items").select("*").eq("archived", false).order("sort_order");
    return (data ?? []) as AgendaItem[];
  }
  return listRows<AgendaItem>("agenda")
    .filter((i) => !i.archived)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function getAgendaItem(id: string): Promise<AgendaItem | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("agenda_items").select("*").eq("id", id).single();
    return (data as AgendaItem) ?? null;
  }
  return findRow<AgendaItem>("agenda", id) ?? null;
}

export async function createAgendaItem(actor: Actor, data: Partial<AgendaItem>): Promise<AgendaItem> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured) {
    const { data: row, error } = await insertTolerant(
      "agenda_items",
      {
        meeting_date: data.meeting_date ?? null,
        section: data.section ?? "organizational",
        title: data.title,
        duration: data.duration ?? null,
        description: data.description ?? null,
        icon: data.icon ?? "event_note",
        attachment: data.attachment ?? null,
        leadoff_name: data.leadoff_name ?? null,
        chair_name: data.chair_name ?? null,
        reading: data.reading ?? null,
        reports: data.reports ?? [],
        tasks: data.tasks ?? [],
        event_id: data.event_id ?? null,
        prep_links: data.prep_links ?? [],
        created_by: actor.id,
        sort_order: data.sort_order ?? 99,
        created_at: now,
      },
      definedOnly({ link: data.link }),
    );
    if (error) throw new Error(error.message);
    return row as AgendaItem;
  }
  return insertRow<AgendaItem>("agenda", {
    ...(data as Partial<AgendaItem>),
    id: undefined,
    section: (data.section ?? "organizational") as AgendaItem["section"],
    event_id: data.event_id ?? null,
    prep_links: data.prep_links ?? [],
    created_by: actor.id,
    sort_order: data.sort_order ?? 99,
    created_at: now,
  });
}

export async function updateAgendaItem(id: string, patch: Partial<AgendaItem>): Promise<AgendaItem | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("agenda_items").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return (data as AgendaItem) ?? null;
  }
  return updateRow<AgendaItem>("agenda", id, patch) ?? null;
}

/** Soft delete — agenda history stays around for reference. */
export async function archiveAgendaItem(id: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("agenda_items").update({ archived: true }).eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
  return Boolean(updateRow<AgendaItem>("agenda", id, { archived: true }));
}

/** Every open branch-prep contribution across all agenda items — small
 * table, the agenda page groups these client-side by `agenda_item_id`. */
export async function listAgendaContributions(): Promise<AgendaContribution[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("agenda_contributions").select("*").order("created_at");
    return (data ?? []) as AgendaContribution[];
  }
  return listRows<AgendaContribution>("agenda_contributions").sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function createAgendaContribution(actor: Actor, agendaItemId: string, text: string): Promise<AgendaContribution> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("agenda_contributions")
      .insert({ agenda_item_id: agendaItemId, author_id: actor.id, text, created_at: now })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as AgendaContribution;
  }
  return insertRow<AgendaContribution>("agenda_contributions", {
    agenda_item_id: agendaItemId,
    author_id: actor.id,
    text,
    created_at: now,
  });
}

export async function getAgendaContribution(id: string): Promise<AgendaContribution | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("agenda_contributions").select("*").eq("id", id).single();
    return (data as AgendaContribution) ?? null;
  }
  return findRow<AgendaContribution>("agenda_contributions", id) ?? null;
}

export async function deleteAgendaContribution(id: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("agenda_contributions").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
  return deleteRow("agenda_contributions", id);
}

/* ============================= finance ============================= */

export async function listTransactions(): Promise<Transaction[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("transactions").select("*").order("created_at", { ascending: false });
    return (data ?? []) as Transaction[];
  }
  return listRows<Transaction>("transactions");
}

export async function createTransaction(actor: Actor, data: Partial<Transaction>): Promise<Transaction> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("transactions")
      .insert({
        amount: data.amount ?? 0,
        type: data.type ?? "expense",
        category: data.category ?? null,
        description: data.description ?? "",
        recorded_by: actor.id,
        created_at: now,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as Transaction;
  }
  return insertRow<Transaction>("transactions", {
    ...(data as Partial<Transaction>),
    id: undefined,
    type: (data.type ?? "expense") as Transaction["type"],
    recorded_by: actor.id,
    created_at: now,
  });
}

export async function updateTransaction(id: string, patch: Partial<Transaction>): Promise<Transaction | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("transactions").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return (data as Transaction) ?? null;
  }
  return updateRow<Transaction>("transactions", id, patch) ?? null;
}

export async function deleteTransaction(id: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
  return deleteRow("transactions", id);
}

export async function listPledges(): Promise<Pledge[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("pledges").select("*");
    return (data ?? []) as Pledge[];
  }
  return listRows<Pledge>("pledges");
}

/** Branch-wide pledged/paid totals — everyone can see these, even when the rows are private. */
export async function pledgeTotals(): Promise<{ pledged: number; paid: number; people: number }> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("pledge_totals");
    return (data as { pledged: number; paid: number; people: number }) ?? { pledged: 0, paid: 0, people: 0 };
  }
  const rows = listRows<Pledge>("pledges");
  return { pledged: rows.reduce((n, p) => n + p.amount, 0), paid: rows.filter((p) => p.status === "paid").reduce((n, p) => n + p.amount, 0), people: rows.length };
}

export async function createPledge(actor: Actor, data: Partial<Pledge>): Promise<Pledge> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("pledges")
      .insert({
        // A pledge is for an account, or for someone in People without one.
        user_id: data.comrade_id ? (data.user_id ?? null) : (data.user_id ?? actor.id),
        ...(data.comrade_id ? { comrade_id: data.comrade_id } : {}),
        amount: data.amount ?? 0,
        status: data.status ?? "unpaid",
        method: data.method ?? null,
        paid_at: data.paid_at ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as Pledge;
  }
  return insertRow<Pledge>("pledges", {
    ...(data as Partial<Pledge>),
    id: undefined,
    status: (data.status ?? "unpaid") as Pledge["status"],
  });
}

export async function updatePledge(id: string, patch: Partial<Pledge>): Promise<Pledge | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("pledges").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return (data as Pledge) ?? null;
  }
  return updateRow<Pledge>("pledges", id, patch) ?? null;
}

export async function deletePledge(id: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("pledges").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
  return deleteRow("pledges", id);
}

/* ============================= imports ============================= */

export interface IngestRowInput {
  kind: ImportKind;
  payload: Record<string, unknown>;
}

export async function createImport(
  actor: Actor,
  input: { source: string; raw?: string | null; rows: IngestRowInput[] },
): Promise<ImportBatch & { rows: ImportRow[] }> {
  const now = new Date().toISOString();
  const contacts = await listContacts();
  const staged = input.rows.map(({ kind, payload }) => {
    const { payload: cleanPayload, extras } = classifyPayload(kind, payload ?? {});
    const match = kind === "people" ? matchContact(cleanPayload, contacts) : {};
    return {
      kind,
      payload: cleanPayload,
      extras,
      status: "pending" as const,
      match_id: match.match_id ?? null,
      match_score: match.match_score ?? null,
    };
  });

  let batch: ImportBatch;
  const createdRows: ImportRow[] = [];
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data: batchData, error: batchError } = await supabase
      .from("imports")
      .insert({ source: input.source, raw: input.raw ?? null, created_by: actor.id, created_at: now })
      .select()
      .single();
    if (batchError) throw new Error(batchError.message);
    batch = batchData as ImportBatch;
    if (staged.length > 0) {
      const { data: rowsData, error: rowsError } = await supabase
        .from("import_rows")
        .insert(staged.map((r) => ({ ...r, import_id: batch.id, created_at: now })))
        .select();
      if (rowsError) throw new Error(rowsError.message);
      createdRows.push(...(rowsData as ImportRow[]));
    }
  } else {
    batch = insertRow<ImportBatch>("imports", {
      source: input.source,
      raw: input.raw ?? null,
      created_by: actor.id,
      created_at: now,
    });
    for (const r of staged) {
      createdRows.push(
        insertRow<ImportRow>("import_rows", { ...r, import_id: batch.id, created_at: now }),
      );
    }
  }

  await logActivity(actor, "import.created", null, null, null, `${createdRows.length} row(s) staged from ${input.source}`);
  return { ...batch, rows: createdRows };
}

/** Rows still `pending` whose `kind` the actor verifies: the officer
 * inbox's contents. Each row is annotated
 * with its batch's `source`/`created_by` for display. */
export async function listPendingImportRows(
  actor: Actor,
): Promise<(ImportRow & { batch_source?: string; batch_created_by?: string | null })[]> {
  const allowedKinds = (Object.keys(IMPORT_VERIFIERS) as ImportKind[]).filter((k) => canVerifyImportRow(actor, k));
  if (allowedKinds.length === 0) return [];

  let rows: ImportRow[];
  let batches: ImportBatch[];
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const [rowsRes, batchesRes] = await Promise.all([
      supabase.from("import_rows").select("*").eq("status", "pending").in("kind", allowedKinds).order("created_at"),
      supabase.from("imports").select("*"),
    ]);
    rows = (rowsRes.data ?? []) as ImportRow[];
    batches = (batchesRes.data ?? []) as ImportBatch[];
  } else {
    rows = listRows<ImportRow>("import_rows")
      .filter((r) => r.status === "pending" && allowedKinds.includes(r.kind))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    batches = listRows<ImportBatch>("imports");
  }

  const batchMap = new Map(batches.map((b) => [b.id, b]));
  return rows.map((r) => ({
    ...r,
    batch_source: batchMap.get(r.import_id)?.source,
    batch_created_by: batchMap.get(r.import_id)?.created_by,
  }));
}

export async function getImportRow(id: string): Promise<ImportRow | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("import_rows").select("*").eq("id", id).single();
    return (data as ImportRow) ?? null;
  }
  return findRow<ImportRow>("import_rows", id) ?? null;
}

async function updateImportRow(id: string, patch: Partial<ImportRow>): Promise<ImportRow | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("import_rows").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return (data as ImportRow) ?? null;
  }
  return updateRow<ImportRow>("import_rows", id, patch) ?? null;
}

function extrasNoteText(extras: Record<string, unknown>): string | null {
  const entries = Object.entries(extras).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return null;
  return `Imported (unrecognized fields): ${entries.map(([k, v]) => `${k}: ${v}`).join("; ")}`;
}

/**
 * Verify a pending `people` import row into a live contact — either a fresh
 * contact (consent required, same gate as the normal add-contact flow) or a
 * merge into an existing one (fills only empty fields; consent is never
 * touched by a merge — the existing record's consent status stands).
 * Other kinds aren't wired up yet (no recognized-field classification —
 * see import-normalize.ts) so verify is `people`-only for now; reject still
 * works for every kind.
 */
export async function verifyImportRow(
  actor: Actor,
  rowId: string,
  opts: { payload?: Record<string, unknown>; mergeInto?: string; consent?: boolean },
): Promise<{ row: ImportRow; contact: Contact }> {
  const row = await getImportRow(rowId);
  if (!row) throw new Error("Import row not found");
  if (row.status !== "pending") throw new Error("This row has already been resolved");
  if (row.kind !== "people") {
    throw new Error(`Verify isn't wired up yet for "${row.kind}" imports — reject or add it manually for now`);
  }

  const payload = opts.payload ?? row.payload;
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) throw new Error("Name is required to verify this row");

  const noteText = extrasNoteText(row.extras);
  let contact: Contact;

  if (opts.mergeInto) {
    const existing = await getContact(opts.mergeInto);
    if (!existing) throw new Error("The contact to merge into no longer exists");
    const fillPatch: Partial<Contact> = {};
    for (const key of ["name", "phone", "met_date", "location_type", "about", "what_worked"] as const) {
      const value = payload[key];
      if (value === undefined || value === null || value === "") continue;
      const current = existing[key];
      if (current === undefined || current === null || current === "") {
        (fillPatch as Record<string, unknown>)[key] = value;
      }
    }
    contact =
      Object.keys(fillPatch).length > 0 ? ((await updateContact(existing.id, fillPatch)) ?? existing) : existing;
    if (noteText) contact = (await addContactNote(contact.id, noteText, actor.id)) ?? contact;
  } else {
    if (opts.consent !== true) {
      throw new Error("Consent is required before saving a contact — confirm it, or merge into an existing record instead");
    }
    contact = await createContact(actor, {
      name,
      phone: typeof payload.phone === "string" ? payload.phone : null,
      met_date: typeof payload.met_date === "string" ? payload.met_date : null,
      location_type: typeof payload.location_type === "string" ? payload.location_type : null,
      about: typeof payload.about === "string" ? payload.about : null,
      what_worked: typeof payload.what_worked === "string" ? payload.what_worked : null,
      status: "new",
      labels: [],
      notes: [],
      consent_given_at: new Date().toISOString(),
    });
    if (noteText) contact = (await addContactNote(contact.id, noteText, actor.id)) ?? contact;
  }

  const updated = await updateImportRow(rowId, {
    status: opts.mergeInto ? "merged" : "verified",
    verified_by: actor.id,
    verified_at: new Date().toISOString(),
  });
  await logActivity(
    actor,
    opts.mergeInto ? "import.merged" : "import.verified",
    row.kind,
    rowId,
    contact.id,
    opts.mergeInto ? `Merged into ${contact.name}` : undefined,
  );
  return { row: updated!, contact };
}

export async function rejectImportRow(actor: Actor, rowId: string): Promise<ImportRow> {
  const row = await getImportRow(rowId);
  if (!row) throw new Error("Import row not found");
  if (row.status !== "pending") throw new Error("This row has already been resolved");
  const updated = await updateImportRow(rowId, {
    status: "rejected",
    verified_by: actor.id,
    verified_at: new Date().toISOString(),
  });
  await logActivity(actor, "import.rejected", row.kind, rowId);
  return updated!;
}

export async function logActivity(
  actor: Actor | null,
  action: string,
  kind?: string | null,
  importRowId?: string | null,
  targetId?: string | null,
  note?: string,
): Promise<void> {
  const row = {
    actor_id: actor?.id ?? null,
    action,
    kind: kind ?? null,
    import_row_id: importRowId ?? null,
    target_id: targetId ?? null,
    note: note ?? null,
    created_at: new Date().toISOString(),
  };
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("activity_log").insert(row);
    if (error) throw new Error(error.message);
    return;
  }
  insertRow<ActivityLogEntry>("activity_log", row);
}

/* ============================= paper sales ============================= */

export async function listPaperSales(): Promise<PaperSale[]> {
  const events = await listEvents({ type: "paper_sale" });
  return events.map((e) => ({
    id: e.id,
    location: e.location,
    sale_date: e.start_time,
    sale_time: e.meetup_time,
    channel: "whatsapp",
    status: "announced",
    created_by: e.posted_by,
    created_at: e.created_at,
  }));
}

export async function createPaperSale(actor: Actor, data: Partial<PaperSale>): Promise<PaperSale> {
  const event = await createEvent(actor, {
    title: data.location ? `Paper Sale: ${data.location}` : "Paper Sale",
    event_type: "paper_sale",
    start_time: data.sale_date ?? new Date().toISOString(),
    location: data.location ?? "",
    description: null,
    is_mobilization: false,
    meetup_time: data.sale_time ?? null,
  });
  return {
    id: event.id,
    location: event.location,
    sale_date: event.start_time,
    sale_time: event.meetup_time,
    channel: "whatsapp",
    status: "announced",
    created_by: event.posted_by,
    created_at: event.created_at,
  };
}

/* ============================= social ============================= */

export async function listSocialPosts(): Promise<SocialPost[]> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("social_posts").select("*").order("day_num");
    return (data ?? []) as SocialPost[];
  }
  return listRows<SocialPost>("social_posts");
}

export async function createSocialPost(actor: Actor, data: Partial<SocialPost>): Promise<SocialPost> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("social_posts")
      .insert({
        day: data.day ?? "Mon",
        day_num: data.day_num ?? 1,
        title: data.title,
        platforms: data.platforms ?? "",
        status: data.status ?? "draft",
        post_date: data.post_date ?? null,
        event_id: data.event_id ?? null,
        image: data.image ?? null,
        created_at: now,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as SocialPost;
  }
  return insertRow<SocialPost>("social_posts", {
    ...(data as Partial<SocialPost>),
    id: undefined,
    status: (data.status ?? "draft") as SocialPost["status"],
    created_at: now,
  });
}

export async function updateSocialPost(id: string, patch: Partial<SocialPost>): Promise<SocialPost | null> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("social_posts").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return (data as SocialPost) ?? null;
  }
  return updateRow<SocialPost>("social_posts", id, patch) ?? null;
}

export async function deleteSocialPost(id: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.from("social_posts").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }
  return deleteRow("social_posts", id);
}
