"use client";

/* eslint-disable @next/next/no-img-element -- checklist photos and poster thumbs are user/static images shown as-is */
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Download, Image as ImageIcon, Plus, X } from "lucide-react";
import { del, patch, post } from "@/lib/client";
import { revalidate, useData } from "@/lib/hooks";
import { useActor } from "@/lib/actor-context";
import { hasAnyRole } from "@/lib/permissions";
import type { Event, EventChecklist, SocialPost, SocialPostStatus } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { firstPart, SectionHead, usePeople } from "@/components/v2/primitives";
import { useToast } from "@/components/v2/toast";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PLATFORMS = ["IG", "IG Story", "TikTok", "X", "FB"];
const STEPS: [SocialPostStatus, string][] = [
  ["draft", "Draft"],
  ["needs_review", "Review"],
  ["ready", "Ready"],
];
const POSTERS = ["poster-red", "poster-yellow-black", "poster-green-black"];
const BRAND_PACK = [
  "/brand/rcs/rcs-logo-white.png",
  "/brand/rcs/marks/emblem-black-transparent.png",
  "/brand/rcs/marks/emblem-rough-pink.png",
  ...POSTERS.map((p) => `/brand/rcs/posters/${p}.jpg`),
  "/brand/rcs/fonts/Brunson.ttf",
  "/brand/rcs/fonts/Brunson-Rough.ttf",
];

/** Platforms are stored as one string ("IG · TikTok"); older rows used "+" or commas. */
function splitPlatforms(s: string) {
  return s
    .split(/\s*[·,+]\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** The planner shows the week ahead from Saturday on, otherwise the current week. */
function weekDays(now: number) {
  const d = new Date(now);
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow + (dow >= 5 ? 7 : 0));
  return DAYS.map((name, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    const iso = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    return { name, num: x.getDate(), month: x.toLocaleDateString("en-GB", { month: "short" }), iso };
  });
}

/** Which day of this week a post is on. Older posts have only a weekday, so they count only if made in the last week. */
function postDay(p: SocialPost, week: ReturnType<typeof weekDays>, now: number) {
  if (p.post_date) return week.find((d) => d.iso === p.post_date)?.name ?? null;
  return now - Date.parse(p.created_at) < 7 * 86400_000 ? p.day : null;
}

const PROMOTE_TYPES: Event["event_type"][] = ["open_meeting", "branch", "social", "reading_group", "mobilization", "uni_stall", "paper_sale"];

/**
 * The week's posts: a coverage strip (gaps visible), Draft → Review → Ready,
 * checklist photos that become a draft post, and RCS graphics.
 */
export default function SocialMediaPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center"><Spinner /></div>}>
      <Social />
    </Suspense>
  );
}

function Social() {
  const actor = useActor();
  // From an event's "Promote it": that event is highlighted (or its post opened).
  const focusEvent = useSearchParams().get("event");
  const toast = useToast();
  const { name } = usePeople();
  const [now] = useState(() => Date.now());
  const { data: posts, loading, setData } = useData<SocialPost[]>("/api/social-posts");
  const { data: checklists, setData: setChecklists } = useData<EventChecklist[]>("/api/event-checklists");
  const { data: events } = useData<Event[]>("/api/events");
  const canEdit = hasAnyRole(actor, "social_media_officer", "general_secretary");
  const [open, setOpen] = useState<string | null>(null);
  const [planning, setPlanning] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const week = useMemo(() => weekDays(now), [now]);
  const all = posts ?? [];
  const list = all.filter((p) => postDay(p, week, now));
  const dayOf = (p: SocialPost) => postDay(p, week, now);
  // Events in the next fortnight that nothing on the planner promotes yet.
  const unpromoted = (events ?? [])
    .filter((e) => PROMOTE_TYPES.includes(e.event_type) && !e.archived && e.status !== "off" && Date.parse(e.start_time) > now && Date.parse(e.start_time) - now < 14 * 86400_000)
    .filter((e) => !all.some((p) => p.event_id === e.id))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const ready = list.filter((p) => p.status === "ready").length;
  const photos = (checklists ?? []).filter((c) => c.completed_at && c.photo_url && !c.acknowledged);

  function upsert(p: SocialPost) {
    setData((prev) => {
      const rows = prev ?? [];
      return rows.some((x) => x.id === p.id) ? rows.map((x) => (x.id === p.id ? p : x)) : [...rows, p];
    });
  }

  async function edit(p: SocialPost, data: Partial<SocialPost>) {
    upsert({ ...p, ...data });
    try {
      await patch(`/api/social-posts/${p.id}`, data);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
      revalidate("/api/social-posts");
    }
  }

  async function create(day: string, title: string, extra: Partial<SocialPost> = {}) {
    const created = await post<SocialPost>("/api/social-posts", {
      day,
      day_num: week.find((w) => w.name === day)?.num ?? 1,
      post_date: week.find((w) => w.name === day)?.iso ?? null,
      title,
      platforms: "IG",
      status: "draft",
      ...extra,
    });
    upsert(created);
    setOpen(created.id);
    return created;
  }

  async function postFromPhoto(c: EventChecklist) {
    const ev = (events ?? []).find((e) => e.id === c.event_id);
    const day = DAYS[(new Date(c.completed_at ?? now).getDay() + 6) % 7];
    try {
      await create(day, `${ev ? firstPart(ev.title, " — ") : "Stall"} — photos`, { platforms: "IG · TikTok", status: "needs_review", event_id: c.event_id, image: c.photo_url ?? null });
      setChecklists((p) => (p ?? []).map((x) => (x.id === c.id ? { ...x, acknowledged: true } : x)));
      await post("/api/event-checklists/acknowledge", { id: c.id });
      toast(`Post drafted for ${day} with the photo`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't make the post");
    }
  }

  /** A draft to promote an event, two days before it (or today, if that's sooner), with the event linked for the graphic. */
  async function promote(e: Event) {
    const before = new Date(Math.max(now, Date.parse(e.start_time) - 2 * 86400_000));
    const iso = `${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, "0")}-${String(before.getDate()).padStart(2, "0")}`;
    const inWeek = week.find((w) => w.iso === iso);
    try {
      const created = await post<SocialPost>("/api/social-posts", {
        day: inWeek?.name ?? DAYS[(before.getDay() + 6) % 7],
        day_num: before.getDate(),
        post_date: iso,
        title: firstPart(e.title, " — "),
        platforms: "IG · IG Story",
        status: "draft",
        event_id: e.id,
      });
      upsert(created);
      if (inWeek) setOpen(created.id);
      toast(inWeek ? `Draft on ${inWeek.name} · make the graphic from it` : `Planned for ${before.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't plan it");
    }
  }

  async function remove(p: SocialPost) {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    setData((prev) => (prev ?? []).filter((x) => x.id !== p.id));
    await del(`/api/social-posts/${p.id}`).catch(() => revalidate("/api/social-posts"));
  }

  function downloadPack() {
    BRAND_PACK.forEach((href, i) =>
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = href;
        a.download = href.split("/").pop() ?? "";
        a.click();
      }, i * 250),
    );
    toast("Brand pack downloading");
  }

  if (loading && !posts) {
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
          <h1>Social</h1>
          <p className="sub">
            Week of {week[0].num} {week[0].month} · {ready} of {list.length} ready
          </p>
        </div>
        <div className="row gap8">
          <Link className="btn btn-o btn-sm" href="/termcard">
            Term card
          </Link>
          <Link className="btn btn-p btn-sm" href="/graphic">
            <ImageIcon size={16} strokeWidth={2.25} />
            Graphic
          </Link>
        </div>
      </div>

      <div className="cover" aria-label="Posts planned this week">
        {week.map((d) => {
          const ps = list.filter((p) => dayOf(p) === d.name);
          const st = ps.some((p) => p.status === "ready") ? "cv-ready" : ps.length ? "cv-draft" : "cv-none";
          return (
            <div key={d.name} className={"cv " + st} title={ps.length ? `${ps.length} planned` : "Nothing planned"}>
              <b>{d.name[0]}</b>
              <span>{d.num}</span>
            </div>
          );
        })}
      </div>

      {canEdit && photos.length > 0 && (
        <section>
          <SectionHead title="Photos in" />
          <div className="list">
            {photos.map((c) => {
              const ev = (events ?? []).find((e) => e.id === c.event_id);
              return (
                <div key={c.id} className="li">
                  <a href={c.photo_url ?? undefined} target="_blank" rel="noopener noreferrer">
                    <img src={c.photo_url ?? ""} alt="" className="thumb" />
                  </a>
                  <div className="grow min0">
                    <p className="t trunc">{ev ? firstPart(ev.title, " — ") : "Event"}</p>
                    <p className="small">From {name(c.completed_by)}&apos;s checklist</p>
                  </div>
                  <button type="button" className="btn btn-p btn-sm" onClick={() => postFromPhoto(c)}>
                    Make post
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {canEdit && unpromoted.length > 0 && (
        <section>
          <SectionHead title="Coming up, not promoted yet" />
          <div className="list">
            {unpromoted.slice(0, 6).map((e) => (
              <div key={e.id} className={"li" + (focusEvent === e.id ? " on" : "")}>
                <div className="grow min0">
                  <p className="t trunc">{firstPart(e.title, " — ")}</p>
                  <p className="small">{new Date(e.start_time).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</p>
                </div>
                <button type="button" className="btn btn-o btn-sm" onClick={() => promote(e)}>
                  Plan a post
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead title="This week" />
        <div className="week">
          {week.map((d) => {
            const ps = list.filter((p) => dayOf(p) === d.name);
            return (
              <div key={d.name} className="wk-day">
                <div className="wk-d">
                  <b>{d.name}</b>
                  <span>{d.num}</span>
                </div>
                <div className="wk-posts">
                  {ps.map((p) => {
                    const plats = splitPlatforms(p.platforms);
                    const isOpen = open === p.id;
                    const idx = STEPS.findIndex(([v]) => v === p.status);
                    return (
                      <div key={p.id} className={"wk-post" + (isOpen ? " open" : "")}>
                        <button type="button" className="wk-row" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}>
                          <span className="grow min0">
                            <span className="t trunc">{p.title}</span>
                            <span className="small trunc">
                              {plats.join(" · ") || "No platform yet"}
                              {p.image ? " · picture ✓" : ""}
                            </span>
                          </span>
                          <span className={"st st-" + p.status}>{STEPS[idx]?.[1] ?? p.status}</span>
                        </button>
                        {isOpen && (
                          <div className="wk-more">
                            {canEdit ? (
                              <>
                                <input
                                  className="inp"
                                  defaultValue={p.title}
                                  aria-label="Post title"
                                  onBlur={(e) => e.target.value.trim() && e.target.value !== p.title && edit(p, { title: e.target.value.trim() })}
                                />
                                <div className="pipe">
                                  {STEPS.map(([v, label], i) => (
                                    <button
                                      key={v}
                                      type="button"
                                      className={(i <= idx ? "f" : "") + (i === idx ? " cur" : "") + (v === "ready" && i <= idx ? " ok" : "")}
                                      onClick={() => edit(p, { status: v })}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                                <div className="row gap6 wrap">
                                  {PLATFORMS.map((x) => {
                                    const on = plats.includes(x);
                                    return (
                                      <button
                                        key={x}
                                        type="button"
                                        className={"plat" + (on ? " on" : "")}
                                        aria-pressed={on}
                                        onClick={() => edit(p, { platforms: (on ? plats.filter((y) => y !== x) : [...plats, x]).join(" · ") })}
                                      >
                                        {x}
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            ) : (
                              <p className="small" style={{ margin: 0 }}>
                                The social media officer moves posts through Draft, Review and Ready.
                              </p>
                            )}
                            {p.image && (
                              <div className="row gap8">
                                <img src={p.image} alt="" className="thumb" />
                                <a className="btn btn-o btn-sm" href={p.image} download={`${p.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.jpg`} target="_blank" rel="noopener noreferrer">
                                  <Download size={15} strokeWidth={2.25} />
                                  Picture
                                </a>
                              </div>
                            )}
                            {p.event_id && (
                              <Link className="link small" href={`/events/${p.event_id}`}>
                                For the event →
                              </Link>
                            )}
                            <div className="row gap8">
                              <Link className="btn btn-o btn-sm grow" href={`/graphic?post=${p.id}`}>
                                <ImageIcon size={15} strokeWidth={2.25} />
                                {p.image ? "Redo graphic" : "Make graphic"}
                              </Link>
                              {canEdit && (
                                <button type="button" className="btn-ic" aria-label={`Delete ${p.title}`} onClick={() => remove(p)}>
                                  <X size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {planning === d.name ? (
                    <form
                      className="row gap8"
                      style={{ padding: "8px 12px" }}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!draftTitle.trim()) return;
                        try {
                          await create(d.name, draftTitle.trim());
                          toast("Draft added to " + d.name);
                        } catch (err) {
                          toast(err instanceof Error ? err.message : "Couldn't add");
                        }
                        setPlanning(null);
                        setDraftTitle("");
                      }}
                    >
                      <input className="inp grow" autoFocus value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="What's the post?" aria-label="Post title" />
                      <button type="submit" className="btn btn-p btn-sm" disabled={!draftTitle.trim()}>
                        Add
                      </button>
                    </form>
                  ) : (
                    ps.length === 0 && (
                      <button type="button" className="wk-add" onClick={() => setPlanning(d.name)}>
                        <Plus size={14} />
                        Plan a post
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <SectionHead title="Brand kit" />
        <div className="kit">
          {POSTERS.map((p) => (
            <a key={p} href={`/brand/rcs/posters/${p}.jpg`} target="_blank" rel="noopener noreferrer">
              <img src={`/brand/rcs/posters/${p}-thumb.jpg`} alt={`RCS poster, ${p.replace("poster-", "").replace("-", " and ")}`} />
            </a>
          ))}
        </div>
        <button type="button" className="btn btn-o btn-sm w100 mt8" onClick={downloadPack}>
          <Download size={15} strokeWidth={2.25} />
          Logos, posters &amp; fonts
        </button>
      </section>
    </div>
  );
}
