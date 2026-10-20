"use client";

import { useRef, useState } from "react";
import { useData } from "@/lib/hooks";
import { patch } from "@/lib/client";
import { isSupabaseConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import type { Event, EventChecklist } from "@/lib/types";
import { Icon } from "@/components/ui";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * The one thing left of the old stall checklist: a photo from the day. It goes
 * straight to Social as a draft post. What to bring lives in the bring list.
 */
export function PhotoForSocial({ event }: { event: Event }) {
  const { data: checklist, setData } = useData<EventChecklist | null>(`/api/event-checklists/${event.id}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setErr("");
    try {
      let url: string;
      if (isSupabaseConfigured) {
        const supabase = createClient();
        const path = `${event.id}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from("checklist-photos").upload(path, file);
        if (error) throw new Error(error.message);
        url = supabase.storage.from("checklist-photos").getPublicUrl(path).data.publicUrl;
      } else url = await readAsDataUrl(file);
      setData(await patch<EventChecklist>(`/api/event-checklists/${event.id}`, { photo_url: url }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't upload the photo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="li li-link" onClick={() => input.current?.click()} disabled={busy}>
        <Icon name="photo_camera" className="text-lg" />
        <span className="grow t">{busy ? "Uploading…" : checklist?.photo_url ? "Photo sent to Social · replace it" : "Photo for Social"}</span>
      </button>
      {err && <p className="small red">{err}</p>}
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </>
  );
}
