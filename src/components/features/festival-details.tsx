"use client";

import { useState } from "react";
import { put } from "@/lib/client";
import { revalidate } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import type { Festival } from "@/lib/types";
import { useToast } from "./toast";

/** Admin only: the festival's name, days, place and ticket link. Everything else on the page reads from this. */
export function FestivalDetails({ festival }: { festival: Festival | null }) {
  const actor = useActor();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: festival?.name ?? "", start_date: festival?.start_date ?? "", end_date: festival?.end_date ?? "", location: festival?.location ?? "", url: festival?.url ?? "" });
  const [busy, setBusy] = useState(false);
  if (!actor?.isAdmin) return null;
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    try {
      await put("/api/festival-config", f);
      revalidate("/api/festival-config");
      setOpen(false);
      toast("Festival details saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <p className="small">
        <button type="button" className="link" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : festival ? "Edit the festival's details" : "Set up the festival"}
        </button>
      </p>
      {open && (
        <div className="stack6">
          <input className="inp" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Name" aria-label="Name" />
          <div className="row gap8">
            <label className="small grow">
              First day
              <input className="inp" type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} />
            </label>
            <label className="small grow">
              Last day
              <input className="inp" type="date" value={f.end_date} onChange={(e) => set("end_date", e.target.value)} />
            </label>
          </div>
          <input className="inp" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Where, e.g. London" aria-label="Where" />
          <input className="inp" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="Tickets and info link (https://…)" inputMode="url" aria-label="Link" />
          <button type="button" className="btn btn-p" onClick={save} disabled={busy || !f.name.trim() || !f.start_date || !f.end_date}>
            Save
          </button>
        </div>
      )}
    </section>
  );
}
