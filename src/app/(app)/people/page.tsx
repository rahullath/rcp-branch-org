"use client";

import { useState } from "react";
import { del, patch, post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { hasAnyRole } from "@/lib/permissions";
import type { AgendaAction, Comrade, Profile } from "@/lib/types";
import { usePeople } from "@/components/features/primitives";
import { useToast } from "@/components/features/toast";

type Saved = Comrade & { moved?: number };

const splitAliases = (s: string) => s.split(",").map((a) => a.trim()).filter(Boolean);
const bare = (n: string) => n.replace(/^Comrade\s+/i, "").trim().toLowerCase();

/** An account whose name looks like this person — offered as a one-tap link. */
function suggest(c: Comrade, profiles: Profile[], linked: Set<string>) {
  const names = [c.name, ...c.aliases].map(bare);
  return profiles.find((p) => {
    if (linked.has(p.id)) return false;
    const full = bare(p.name);
    return names.includes(full) || (bare(c.name).includes(" ") && full === bare(c.name));
  });
}

/**
 * Everyone the agenda names, by full name and the short forms people write
 * (DP, Kit, CK). People without an account are kept; linking them to an
 * account later moves their waiting follow-ups into that inbox.
 */
export default function PeoplePage() {
  const actor = useActor();
  const toast = useToast();
  const { profiles } = usePeople();
  const { data: comrades, loading } = useData<Comrade[]>("/api/comrades");
  const { data: actions } = useData<AgendaAction[]>("/api/agenda-actions");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const isOfficer = !!actor?.role.some((r) => r !== "member");
  const isGs = hasAnyRole(actor, "general_secretary");

  const linked = new Set((comrades ?? []).map((c) => c.profile_id).filter((x): x is string => !!x));
  const waiting = (id: string) => (actions ?? []).filter((a) => a.owner_comrade_id === id && !a.owner_id && !a.done).length;
  const rows = [...(comrades ?? [])].sort((a, b) => Number(!!a.profile_id) - Number(!!b.profile_id) || a.name.localeCompare(b.name));

  async function save(id: string | null, body: Record<string, unknown>) {
    try {
      const saved = id ? await patch<Saved>(`/api/comrades/${id}`, body) : await post<Saved>("/api/comrades", body);
      revalidate("/api/comrades", "/api/agenda-actions", "/api/inbox");
      toast(saved.moved ? `Linked · ${saved.moved} follow-up${saved.moved === 1 ? "" : "s"} moved to their inbox` : "Saved");
      setEditing(null);
      setAdding(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save that");
    }
  }

  if (!isOfficer) {
    return (
      <div className="screen pg">
        <p className="nothing">People are kept by officers.</p>
      </div>
    );
  }

  return (
    <div className="screen pg">
      <div className="ph">
        <div className="grow min0">
          <h1>People</h1>
          <p className="sub">Names and short forms the agenda uses. Link someone when they get an account.</p>
        </div>
        {!adding && (
          <button type="button" className="btn btn-p btn-sm" onClick={() => setAdding(true)}>
            Add
          </button>
        )}
      </div>

      {adding && <PersonForm profiles={profiles} linked={linked} onCancel={() => setAdding(false)} onSave={(b) => save(null, b)} />}

      {loading && !comrades ? (
        <p className="small">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="nothing">Nobody yet. Importing an agenda adds the names it finds.</p>
      ) : (
        <div className="matlist">
          {rows.map((c) => {
            const profile = c.profile_id ? profiles.find((p) => p.id === c.profile_id) : null;
            const hint = !c.profile_id ? suggest(c, profiles, linked) : undefined;
            const n = waiting(c.id);
            if (editing === c.id) {
              return (
                <PersonForm
                  key={c.id}
                  person={c}
                  profiles={profiles}
                  linked={linked}
                  onCancel={() => setEditing(null)}
                  onSave={(b) => save(c.id, b)}
                  onDelete={
                    isGs
                      ? async () => {
                          if (!confirm(`Remove ${c.name}? Their waiting follow-ups stay, without a name.`)) return;
                          await del(`/api/comrades/${c.id}`).catch((e) => toast(e.message));
                          revalidate("/api/comrades");
                          setEditing(null);
                        }
                      : undefined
                  }
                />
              );
            }
            return (
              <div key={c.id} className="mat-r" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <button type="button" className="grow min0" style={{ textAlign: "left" }} onClick={() => setEditing(c.id)}>
                  <span className="t">{c.name}</span>
                  <span className="small" style={{ display: "block" }}>
                    {c.aliases.length > 0 ? c.aliases.join(", ") + " · " : ""}
                    {profile ? `Account: ${profile.name}` : "No account yet"}
                    {n > 0 && ` · ${n} follow-up${n === 1 ? "" : "s"} waiting`}
                  </span>
                </button>
                {hint && (
                  <button type="button" className="btn btn-o btn-sm" onClick={() => save(c.id, { profile_id: hint.id })}>
                    Link to {hint.name.replace(/^Comrade\s+/i, "")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PersonForm({
  person,
  profiles,
  linked,
  onSave,
  onCancel,
  onDelete,
}: {
  person?: Comrade;
  profiles: Profile[];
  linked: Set<string>;
  onSave: (body: Record<string, unknown>) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [aliases, setAliases] = useState(person?.aliases.join(", ") ?? "");
  const [profileId, setProfileId] = useState(person?.profile_id ?? "");
  const choices = profiles.filter((p) => p.id === person?.profile_id || !linked.has(p.id));

  return (
    <div className="ask stack6">
      <input className="inp" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Full name" />
      <input className="inp" placeholder="Short forms, e.g. DP, Dan" value={aliases} onChange={(e) => setAliases(e.target.value)} aria-label="Short forms" />
      <select className="inp" value={profileId} onChange={(e) => setProfileId(e.target.value)} aria-label="Account">
        <option value="">No account yet</option>
        {choices.map((p) => (
          <option key={p.id} value={p.id}>
            Account: {p.name}
          </option>
        ))}
      </select>
      <div className="row gap8">
        {onDelete && (
          <button type="button" className="btn btn-o btn-sm" onClick={onDelete}>
            Remove
          </button>
        )}
        <span className="grow" />
        <button type="button" className="btn btn-o btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-p btn-sm"
          disabled={!name.trim()}
          onClick={() => {
            const body: Record<string, unknown> = { name: name.trim(), aliases: splitAliases(aliases) };
            if ((person?.profile_id ?? "") !== profileId) body.profile_id = profileId || null;
            else if (!person && profileId) body.profile_id = profileId;
            onSave(body);
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
