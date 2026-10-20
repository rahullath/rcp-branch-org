"use client";

import { useId, useState } from "react";
import { post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import type { Location } from "@/lib/types";
import { cn } from "@/lib/utils";
import { inputClasses } from "@/components/ui";
import { LOCATION_KIND } from "@/components/v2/locations";
import { useActor } from "@/lib/actor-context";
import { areasFor } from "@/data/spots";

/**
 * Free-text location field that suggests known spots from the Locations
 * tab — `events.location` stays plain text (no FK), so anything typed is
 * still accepted. Native `<input list>` + `<datalist>`, same pattern as
 * PersonPicker. A place that isn't listed yet can be saved as a spot right
 * here (area, kind, needs booking), without leaving the form.
 */
export function LocationInput({
  value,
  onChange,
  placeholder,
  className,
  kind = "meeting",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** What a newly saved spot is for, preselected in the mini form. */
  kind?: Location["category"];
}) {
  const listId = useId();
  const district = useActor()?.branch?.district;
  const { data, setData } = useData<Location[]>("/api/locations");
  const options = data ?? [];
  const [adding, setAdding] = useState(false);
  const [area, setArea] = useState("");
  const [cat, setCat] = useState<Location["category"]>(kind);
  const [booking, setBooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const areaList = useId();
  const typed = value.trim();
  const known = options.some((l) => l.name.trim().toLowerCase() === typed.toLowerCase());
  const online = /^https?:\/\/|online|zoom|teams|meet\.google/i.test(typed);

  return (
    <>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Where?"}
        className={cn(inputClasses, className)}
      />
      <datalist id={listId}>
        {options.map((l) => (
          <option key={l.id} value={l.name}>{[l.area, ...(l.tags ?? [])].filter(Boolean).join(" · ")}</option>
        ))}
      </datalist>
      {data && typed.length >= 3 && !known && !online && !adding && (
        <button type="button" className="link small" style={{ alignSelf: "flex-start", textAlign: "left" }} onClick={() => setAdding(true)}>
          Not on the list · save “{typed}” as a spot
        </button>
      )}
      {adding && (
        // Not a <form>: this sits inside the event form, and forms can't nest.
        <div className="ask stack6">
          <span className="ask-k">New spot · {typed}</span>
          <div className="row gap6 wrap">
            {(Object.keys(LOCATION_KIND) as Location["category"][]).map((k) => (
              <button key={k} type="button" className={"btn btn-sm " + (cat === k ? "btn-p" : "btn-o")} aria-pressed={cat === k} onClick={() => setCat(k)}>
                {LOCATION_KIND[k]}
              </button>
            ))}
          </div>
          <input className="inp" list={areaList} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area: a neighbourhood, campus or high street" aria-label="Area" />
          <datalist id={areaList}>
            {areasFor(district, options).map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <label className="small row gap6" style={{ alignItems: "center" }}>
            <input type="checkbox" checked={booking} onChange={(e) => setBooking(e.target.checked)} /> Needs booking
          </label>
          <div className="row gap8">
            <button
              type="button"
              className="btn btn-p btn-sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const created = await post<Location>("/api/locations", { name: typed, category: cat, area: area.trim() || null, tags: booking ? ["needs booking"] : [] });
                  setData((p) => [...(p ?? []), created]);
                  onChange(created.name);
                  setAdding(false);
                  revalidate("/api/locations");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save spot
            </button>
            <button type="button" className="btn btn-o btn-sm" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
