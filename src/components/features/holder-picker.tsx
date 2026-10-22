"use client";

import { useData } from "@/lib/hooks";
import { useProfiles } from "@/lib/profiles-context";
import type { Comrade, Material } from "@/lib/types";

/** "p:<profile id>" for someone on the app, "c:<People id>" for someone who isn't yet, "" for nobody. */
export type HolderValue = string;

export const holderValue = (m: Pick<Material, "holder_id" | "holder_comrade_id">): HolderValue =>
  m.holder_id ? `p:${m.holder_id}` : m.holder_comrade_id ? `c:${m.holder_comrade_id}` : "";

export const holderFields = (v: HolderValue) => ({
  holder_id: v.startsWith("p:") ? v.slice(2) : null,
  holder_comrade_id: v.startsWith("c:") ? v.slice(2) : null,
});

/** Who has it — everyone on the app, and People not on it yet (like Ben). */
export function HolderPicker({
  value,
  onChange,
  empty = "Nobody — it's in a place",
  className = "inp",
  hint,
  label = "Who has it",
}: {
  value: HolderValue;
  onChange: (v: HolderValue) => void;
  empty?: string;
  className?: string;
  /** Extra text after each name, e.g. their current load. */
  hint?: (profileId: string) => string;
  label?: string;
}) {
  const { profiles } = useProfiles();
  const { data: comrades } = useData<Comrade[]>("/api/comrades");
  const offApp = (comrades ?? []).filter((c) => !c.profile_id).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{empty}</option>
      <optgroup label="On the app">
        {[...profiles]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {p.name}
              {hint?.(p.id) ? ` · ${hint(p.id)}` : ""}
            </option>
          ))}
      </optgroup>
      {offApp.length > 0 && (
        <optgroup label="Not on the app yet">
          {offApp.map((c) => (
            <option key={c.id} value={`c:${c.id}`}>
              {c.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

/** The holder's name from either kind of value. */
export function useHolderName() {
  const { profiles } = useProfiles();
  const { data: comrades } = useData<Comrade[]>("/api/comrades");
  return (m: Pick<Material, "holder_id" | "holder_comrade_id">) =>
    (m.holder_id && profiles.find((p) => p.id === m.holder_id)?.name) || (m.holder_comrade_id && (comrades ?? []).find((c) => c.id === m.holder_comrade_id)?.name) || null;
}
