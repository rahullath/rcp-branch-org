"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { revalidate, useData } from "@/lib/hooks";
import { post } from "@/lib/client";
import { useActor } from "@/lib/actor-context";
import { hasAnyRole } from "@/lib/permissions";
import type { AgendaItem, Event } from "@/lib/types";
import { programme } from "@/lib/programme";
import { CURRICULUM } from "@/data/curriculum";
import { Spinner } from "@/components/ui";
import { ProgrammeRow } from "@/components/v2/programme-row";
import { ReadingGroupsSection } from "@/components/v2/reading-groups";
import { useToast } from "@/components/v2/toast";

/**
 * Education is two different things, kept apart:
 * - the branch programme — the weekly political discussion (topic, lead-off,
 *   one text + one audio), read off the branch meetings' agendas;
 * - reading groups — small, led groups on one book each, for comrades and
 *   the strong contacts they're working with.
 * Plus a private self-study checklist.
 */
export default function EducationPage() {
  const [now] = useState(() => Date.now());
  const actor = useActor();
  const toast = useToast();
  const { data: events, loading } = useData<Event[]>("/api/events");
  const { data: agenda, setData: setAgenda } = useData<AgendaItem[]>("/api/agenda");
  const canPlan = hasAnyRole(actor, "general_secretary", "organizer", "education_officer");

  const prog = useMemo(() => programme(events ?? [], agenda ?? [], now), [events, agenda, now]);

  async function lead(itemId: string) {
    setAgenda((p) => (p ?? []).map((i) => (i.id === itemId ? { ...i, leadoff_name: actor?.name ?? "You" } : i)));
    try {
      await post(`/api/agenda/${itemId}/lead`, {});
      toast("You're leading off · it's on the agenda");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
      revalidate("/api/agenda");
    }
  }
  async function help(itemId: string) {
    setAgenda((p) => (p ?? []).map((i) => (i.id === itemId ? { ...i, prep_with_id: actor?.id ?? null } : i)));
    try {
      await post(`/api/agenda/${itemId}/prep`, { with_id: actor?.id });
      toast("You're helping them prep · it's in your inbox");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
      revalidate("/api/agenda");
    }
  }


  if (loading && !events) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="v2 pg">
      <div className="ph">
        <div>
          <h1>Education</h1>
          <p className="sub">The branch programme and reading groups.</p>
        </div>
      </div>

      <section>
        <div className="sh">
          <h2>Branch programme</h2>
          <Link className="link" href="/programme">
            Full programme
          </Link>
        </div>
        <p className="small" style={{ margin: "0 0 8px" }}>
          One topic each meeting, led off by a comrade, with one text and one audio to prepare.
        </p>
        <div className="stack8">
          {prog.upcoming.slice(0, 4).map((e) => (
            <ProgrammeRow key={e.event.id} entry={e} onLead={lead} onHelp={help} />
          ))}
          {prog.upcoming.length === 0 && <p className="nothing">No branch meetings scheduled.</p>}
        </div>
        {canPlan && (
          <p className="small mt8">
            Plan ahead by <Link className="link" href="/import">importing the agenda doc</Link> — its Branch Programme table fills this in.
          </p>
        )}
      </section>

      <ReadingGroupsSection />

      <SelfStudy />
    </div>
  );
}

/** The curriculum as a private checklist — your own pace, nobody else sees it. */
function SelfStudy() {
  const [show, setShow] = useState(false);
  const { data: ticks, setData } = useData<string[]>(show ? "/api/reading-ticks" : null);
  const key = (track: string, i: number) => `cur:${track}:${i}`;
  return (
    <section>
      <button type="button" className="dayh" onClick={() => setShow((v) => !v)} aria-expanded={show} style={{ flexWrap: "wrap", textAlign: "left" }}>
        Self-study <span>{show ? "· hide" : "· the curriculum at your own pace"}</span>
      </button>
      {show &&
        CURRICULUM.map((t) => {
          const done = t.items.filter((_, i) => ticks?.includes(key(t.id, i))).length;
          return (
            <div key={t.id} className="mt12">
              <p className="t">
                {t.name} <span className="muted">· {done} of {t.items.length}</span>
              </p>
              <div className="matlist mt6">
                {t.items.map((item, i) => {
                  const k = key(t.id, i);
                  const on = !!ticks?.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      className="mat-r"
                      aria-pressed={on}
                      onClick={() => {
                        setData((p) => (on ? (p ?? []).filter((x) => x !== k) : [...(p ?? []), k]));
                        void post("/api/reading-ticks", { session_id: k, on: !on }).catch(() => revalidate("/api/reading-ticks"));
                      }}
                    >
                      <span className={"tick" + (on ? " on" : "")}>{on && <Check size={13} strokeWidth={2.5} />}</span>
                      <span className="grow min0">
                        <span className={"t" + (on ? " struck" : "")}>{item.title}</span>
                        <span className="small" style={{ display: "block" }}>
                          {item.author}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
    </section>
  );
}
