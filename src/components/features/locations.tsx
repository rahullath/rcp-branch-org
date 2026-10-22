"use client";

import { useId, useMemo, useState } from "react";
import { MapPin, Pencil, Trash2 } from "lucide-react";
import type { Location, LocationCategory } from "@/lib/types";
import { useActor } from "@/lib/actor-context";
import { useData } from "@/lib/hooks";
import { LOCATION_TAGS, areasFor, mapsUrl } from "@/data/spots";

export const LOCATION_KIND: Record<LocationCategory, string> = {
  paper_sale: "Paper sale",
  uni_stall: "Uni stall",
  meeting: "Meeting",
  social: "Social",
};

export type LocationInput = Pick<Location, "name" | "category" | "area" | "description" | "book_url"> & { tags: string[] };

/** Add or edit a spot: what it's for, which area, what it's like. */
export function LocationForm({ location, onSave, onCancel }: { location?: Location; onSave: (input: LocationInput) => Promise<void>; onCancel: () => void }) {
  const areaList = useId();
  const district = useActor()?.branch?.district;
  const { data: known } = useData<Location[]>("/api/locations");
  const [name, setName] = useState(location?.name ?? "");
  const [category, setCategory] = useState<LocationCategory>(location?.category ?? "paper_sale");
  const [area, setArea] = useState(location?.area ?? "");
  const [tags, setTags] = useState<string[]>(location?.tags ?? []);
  const [extra, setExtra] = useState("");
  const [description, setDescription] = useState(location?.description ?? "");
  const [bookUrl, setBookUrl] = useState(location?.book_url ?? "");
  const [busy, setBusy] = useState(false);
  const allTags = [...new Set([...LOCATION_TAGS, ...tags])];

  return (
    <form
      className="ask stack6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const more = extra.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
        try {
          await onSave({ name: name.trim(), category, area: area.trim() || null, description: description.trim() || null, book_url: /^https?:\/\//.test(bookUrl.trim()) ? bookUrl.trim() : null, tags: [...new Set([...tags, ...more])] });
        } finally {
          setBusy(false);
        }
      }}
    >
      <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Library Bridge" aria-label="Name" required autoFocus />
      <span className="tabs4">
        {(Object.keys(LOCATION_KIND) as LocationCategory[]).map((k) => (
          <button key={k} type="button" className={category === k ? "on" : ""} onClick={() => setCategory(k)}>
            {LOCATION_KIND[k]}
          </button>
        ))}
      </span>
      <input className="inp" list={areaList} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area: a neighbourhood, campus or high street" aria-label="Area" />
      <datalist id={areaList}>
        {areasFor(district, known ?? []).map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      <div className="row gap6 wrap">
        {allTags.map((t) => (
          <button
            key={t}
            type="button"
            className={"lchip" + (tags.includes(t) ? " on" : "")}
            style={tags.includes(t) ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : undefined}
            aria-pressed={tags.includes(t)}
            onClick={() => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}
          >
            {t}
          </button>
        ))}
      </div>
      <input className="inp" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Other labels, comma separated" aria-label="Other labels" />
      <input className="inp" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes — best spot, when it's busy, who to book with" aria-label="Notes" />
      <input className="inp" type="url" value={bookUrl} onChange={(e) => setBookUrl(e.target.value)} placeholder="Booking link, if it needs booking (uni room booking, library…)" aria-label="Booking link" />
      <div className="row gap8">
        <button type="submit" className="btn btn-p btn-sm" disabled={busy || !name.trim()}>
          {location ? "Save" : "Add"}
        </button>
        <button type="button" className="btn btn-o btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Spots grouped by area, with area chips to narrow it. `action` adds a
 * button per row (Paper sales: "Plan a sale here"); `canEdit` decides who
 * gets the pencil and bin.
 */
export function LocationGroups({
  locations,
  action,
  canEdit,
  onSave,
  onDelete,
}: {
  locations: Location[];
  action?: (l: Location) => React.ReactNode;
  canEdit?: (l: Location) => boolean;
  onSave?: (l: Location, input: LocationInput) => Promise<void>;
  onDelete?: (l: Location) => void;
}) {
  const [area, setArea] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const district = useActor()?.branch?.district;
  const areas = useMemo(() => {
    const order = areasFor(district, locations);
    const present = [...new Set(locations.map((l) => l.area || "Elsewhere"))];
    return present.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  }, [locations, district]);
  const shown = areas.filter((a) => !area || a === area);

  return (
    <>
      {areas.length > 1 && (
        <div className="chips">
          <button type="button" className={"chip" + (!area ? " on" : "")} onClick={() => setArea(null)}>
            All
          </button>
          {areas.map((a) => (
            <button key={a} type="button" className={"chip" + (area === a ? " on" : "")} onClick={() => setArea(a)}>
              {a}
            </button>
          ))}
        </div>
      )}
      {shown.map((a) => (
        <section key={a}>
          <p className="dayh">{a}</p>
          <div className="stack6">
            {locations
              .filter((l) => (l.area || "Elsewhere") === a)
              .sort((x, y) => x.name.localeCompare(y.name))
              .map((l) =>
                editing === l.id && onSave ? (
                  <LocationForm key={l.id} location={l} onCancel={() => setEditing(null)} onSave={async (input) => (await onSave(l, input), setEditing(null))} />
                ) : (
                  <div key={l.id} className="li" style={{ alignItems: "flex-start" }}>
                    <div className="grow min0">
                      <p className="lc-k">{LOCATION_KIND[l.category] ?? l.category}</p>
                      <p className="t">{l.name}</p>
                      {l.description && <p className="small">{l.description}</p>}
                      {!!l.tags?.length && (
                        <div className="row gap6 wrap mt6">
                          {l.tags.map((t) => (
                            <span key={t} className="lchip">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="row gap8 wrap mt6" style={{ alignItems: "center" }}>
                        <a className="link small" href={mapsUrl(l, district)} target="_blank" rel="noopener noreferrer">
                          <MapPin size={12} style={{ display: "inline", verticalAlign: "-1px" }} /> Map
                        </a>
                        {l.book_url && (
                          <a className="link small" href={l.book_url} target="_blank" rel="noopener noreferrer">
                            Book it ↗
                          </a>
                        )}
                        {action?.(l)}
                      </div>
                    </div>
                    {canEdit?.(l) && (
                      <div className="row gap6">
                        <button type="button" className="btn-ic sm" aria-label={`Edit ${l.name}`} onClick={() => setEditing(l.id)}>
                          <Pencil size={15} />
                        </button>
                        {onDelete && (
                          <button type="button" className="btn-ic sm" aria-label={`Delete ${l.name}`} onClick={() => onDelete(l)}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ),
              )}
          </div>
        </section>
      ))}
    </>
  );
}
