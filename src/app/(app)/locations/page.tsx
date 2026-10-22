"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useData } from "@/lib/hooks";
import { del, patch, post } from "@/lib/client";
import { useActor } from "@/lib/actor-context";
import type { Location } from "@/lib/types";
import { canManage } from "@/lib/permissions";
import { packFor } from "@/data/spots";
import { LocationForm, LocationGroups, type LocationInput } from "@/components/features/locations";
import { useToast } from "@/components/features/toast";

/** Where the branch works — stalls, sales, meetings, socials — by area, with what each place is like. */
export default function LocationsPage() {
  const actor = useActor();
  const toast = useToast();
  const { data: locations, setData } = useData<Location[]>("/api/locations");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const rows = (locations ?? []).filter((l) => !l.archived);
  const have = new Set(rows.map((l) => l.name.toLowerCase()));
  const pack = packFor(actor?.branch?.district);
  const missing = (pack?.spots ?? []).filter((s) => !have.has(s.name.toLowerCase()));
  const isOrganiser = !!actor?.role.some((r) => r === "organizer" || r === "general_secretary");

  async function add(input: LocationInput) {
    const created = await post<Location>("/api/locations", input);
    setData((p) => [...(p ?? []), created]);
    setAdding(false);
    toast("Added");
  }

  async function save(l: Location, input: LocationInput) {
    const updated = await patch<Location>(`/api/locations/${l.id}`, input);
    setData((p) => (p ?? []).map((x) => (x.id === updated.id ? updated : x)));
  }

  async function remove(l: Location) {
    if (!window.confirm(`Delete “${l.name}”?`)) return;
    await del(`/api/locations/${l.id}`);
    setData((p) => (p ?? []).filter((x) => x.id !== l.id));
  }

  async function addSuggested() {
    setBusy(true);
    try {
      const made: Location[] = [];
      for (const s of missing) made.push(await post<Location>("/api/locations", s));
      setData((p) => [...(p ?? []), ...made]);
      toast(`${made.length} spots added`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add them all");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen pg">
      <div className="ph">
        <div className="grow min0">
          <h1>Locations</h1>
          <p className="sub">Where we sell, stall, meet and go after — by area.</p>
        </div>
        <button type="button" className="btn btn-p btn-sm" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add
        </button>
      </div>

      {adding && <LocationForm onSave={add} onCancel={() => setAdding(false)} />}

      {isOrganiser && missing.length > 0 && (
        <div className="ask row gap8" style={{ alignItems: "center" }}>
          <p className="small grow" style={{ margin: 0 }}>
            {missing.length} {pack?.district} spots you don&apos;t have yet: {pack?.areas.slice(0, 5).join(", ")}…
          </p>
          <button type="button" className="btn btn-o btn-sm" disabled={busy} onClick={addSuggested}>
            Add them
          </button>
        </div>
      )}

      {rows.length === 0 && !adding ? (
        <p className="nothing">No locations yet.</p>
      ) : (
        <LocationGroups locations={rows} canEdit={(l) => canManage(actor, l.created_by, "organizer")} onSave={save} onDelete={remove} />
      )}
    </div>
  );
}
