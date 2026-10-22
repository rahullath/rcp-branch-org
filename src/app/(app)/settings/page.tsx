"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { useActor } from "@/lib/actor-context";
import { useProfiles } from "@/lib/profiles-context";
import { clearDataCache, revalidate, useData } from "@/lib/hooks";
import { patch, post } from "@/lib/client";
import { publicOrigin } from "@/lib/share-url";
import { type Availability, type Branch, type Comrade, type Profile, SUB_KINDS } from "@/lib/types";
import { initials as initialsOf } from "@/lib/utils";
import { APP_NAME, APP_VERSION, isSupabaseConfigured } from "@/lib/config";
import { PORTAL_URL } from "@/lib/identity";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { SectionHead } from "@/components/features/primitives";
import { useToast } from "@/components/features/toast";
import { CalendarLinks } from "@/components/features/calendar-links";

/**
 * Your profile: who you are as the branch writes you (name, initials, the
 * short forms people use), your subs (on the party portal, not here),
 * paper-sale availability, and app bits.
 */
export default function SettingsPage() {
  const actor = useActor();
  const toast = useToast();
  const { profiles, setProfiles } = useProfiles();
  const { data: comrades } = useData<Comrade[]>("/api/comrades");
  const me = useMemo(() => profiles.find((p) => p.id === actor?.id), [profiles, actor]);
  const mine = (comrades ?? []).find((c) => c.profile_id === actor?.id);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [ini, setIni] = useState("");
  const [aliases, setAliases] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const shownName = me?.name ?? actor?.name ?? "Comrade";
  const shownIni = me?.initials || initialsOf(shownName);
  const shortForms = (mine?.aliases ?? []).filter((a) => a.toUpperCase() !== shownIni);

  function start() {
    setName(me?.name ?? actor?.name ?? "");
    setIni(me?.initials ?? "");
    setAliases(shortForms.join(", "));
    setPronouns(me?.pronouns ?? "");
    setPhone(me?.phone ? formatPhone(me.phone) : "+44 ");
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await patch<{ profile: Profile; moved: number }>("/api/me/identity", {
        name: name.trim(),
        initials: ini.trim(),
        aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
        pronouns,
        phone: phone.replace(/^\+44\s*$/, ""),
      });
      setProfiles(profiles.map((p) => (p.id === res.profile.id ? res.profile : p)));
      revalidate("/api/comrades", "/api/agenda-actions", "/api/inbox");
      setEditing(false);
      toast(res.moved ? `Saved · ${res.moved} thing${res.moved === 1 ? "" : "s"} waiting on “${name.trim()}” moved to your inbox` : "Saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen pg">
      <div className="ph">
        <div>
          <h1>Profile</h1>
          <p className="sub">How the branch knows you, and your subs.</p>
        </div>
      </div>

      <section>
        <SectionHead title="Who you are" />
        {editing ? (
          <form className="ask stack6" onSubmit={save}>
            <label className="small">Your name, as the branch knows you</label>
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jo Bloggs" aria-label="Name" required autoFocus />
            <div className="row gap8">
              <input className="inp" style={{ width: 90 }} value={ini} onChange={(e) => setIni(e.target.value.toUpperCase())} placeholder={initialsOf(name || "A B")} aria-label="Initials" maxLength={4} />
              <input className="inp grow" value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="Pronouns (optional)" aria-label="Pronouns" />
            </div>
            <input className="inp" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Other names people write — e.g. Jo, Kit" aria-label="Other names" />
            <input
              className="inp"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => normalizePhone(phone) && setPhone(formatPhone(normalizePhone(phone)))}
              placeholder="+44 WhatsApp number (optional)"
              aria-label="WhatsApp number"
            />
            <p className="small" style={{ margin: 0 }}>Only your branch can see it.</p>
            <p className="small" style={{ margin: 0 }}>
              Agenda docs and minutes that say {ini || initialsOf(name || "A B")} or any of these will land with you.
            </p>
            <div className="row gap8">
              <button type="submit" className="btn btn-p btn-sm" disabled={saving || !name.trim()}>
                Save
              </button>
              <button type="button" className="btn btn-o btn-sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="li">
            <span className="av" style={{ width: 44, height: 44, fontSize: 15 }}>
              {shownIni}
            </span>
            <div className="grow min0">
              <p className="t">
                {shownName}
                {me?.pronouns ? <span className="muted"> ({me.pronouns})</span> : null}
              </p>
              <p className="small">
                {[shownIni, ...shortForms].join(" · ")}
                {me?.phone ? ` · ${formatPhone(me.phone)}` : ""}
                {" · "}
                {(actor?.role ?? []).join(", ").replace(/_/g, " ")}
              </p>
            </div>
            <button type="button" className="btn btn-o btn-sm" onClick={start}>
              Edit
            </button>
          </div>
        )}
        {!editing && actor?.namePending && (
          <p className="small red mt8">Your name came from your email. Tap Edit so people (and imported agendas) know it&apos;s you.</p>
        )}
      </section>

      <section>
        <SectionHead title="Subs & subscription" />
        <p className="small" style={{ marginTop: 0 }}>
          What you get, so print copies of the paper and the new IDOM come to you without anyone having to ask.
        </p>
        {(["paper_sub_kind", "idom_sub_kind"] as const).map((k) => (
          <div key={k} className="fld mt8">
            <span>{k === "paper_sub_kind" ? "The Communist (paper)" : "In Defence of Marxism"}</span>
            <div className="tabs3">
              {SUB_KINDS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={(me?.[k] ?? "none") === o.value ? "on" : ""}
                  aria-pressed={(me?.[k] ?? "none") === o.value}
                  onClick={async () => {
                    if (!me) return;
                    setProfiles(profiles.map((p) => (p.id === me.id ? { ...p, [k]: o.value } : p)));
                    try {
                      await patch(`/api/profiles/${me.id}`, { [k]: o.value });
                    } catch {
                      toast("Couldn't save");
                    }
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <a className="li li-link mt8" href={PORTAL_URL} target="_blank" rel="noopener noreferrer">
          <div className="grow min0">
            <p className="t">Check on the party portal</p>
            <p className="small">Your monthly subs and subscriptions, and changing them.</p>
          </div>
          <ExternalLink size={16} />
        </a>
        <p className="small mt8">
          Not subscribed yet?{" "}
          <a className="link" href="https://communist.red/subscribe" target="_blank" rel="noopener noreferrer">
            Subscribe to The Communist and IDOM
          </a>
          .
        </p>
      </section>

      <Availability />

      <section>
        <SectionHead title="Branch events in your calendar" />
        <CalendarLinks />
      </section>

      {actor?.isAdmin && <AdminTools />}

      <section>
        <SectionHead title="Branch" />
        <BranchCard />
        <Link className="li li-link mt8" href="/admin/members">
          <span className="grow t">Members and roles</span>
        </Link>
        <Link className="li li-link mt8" href="/settings/notifications">
          <span className="grow t">Notifications</span>
        </Link>
      </section>

      <section>
        <SectionHead title={`About ${APP_NAME}`} />
        <p className="small">
          v{APP_VERSION} · {isSupabaseConfigured ? "synced" : "local demo data"}
        </p>
        <Link className="link" href="/onboarding">
          Go through the intro again
        </Link>
      </section>
    </div>
  );
}

/** Your branch, and the code to bring comrades onto the app. The GS can rename it or make a fresh code. */
function BranchCard() {
  const actor = useActor();
  const toast = useToast();
  const { data: branch, setData } = useData<Branch | null>("/api/branches");
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const isGs = !!actor?.role.includes("general_secretary");
  if (!branch) return null;
  const invite = `Join ${branch.name} on the branch app: ${publicOrigin()}/join/${branch.join_code}`;

  return (
    <div className="ask stack6">
      {actor?.isAdmin && <AdminSwitch current={branch.id} />}
      {renaming ? (
        <form
          className="row gap8"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const updated = await patch<Branch>("/api/branches", { name });
              setData(updated);
              setRenaming(false);
              toast("Renamed · reload to see it in the header");
            } catch (err) {
              toast(err instanceof Error ? err.message : "Couldn't rename");
            }
          }}
        >
          <input className="inp grow" value={name} onChange={(e) => setName(e.target.value)} aria-label="Branch name" autoFocus />
          <button type="submit" className="btn btn-p btn-sm" disabled={!name.trim()}>
            Save
          </button>
        </form>
      ) : (
        <div className="row gap8" style={{ alignItems: "baseline" }}>
          <p className="t grow" style={{ margin: 0 }}>
            {branch.name} <span className="muted">· {branch.district}</span>
          </p>
          {isGs && (
            <button type="button" className="link" onClick={() => (setName(branch.name), setRenaming(true))}>
              Rename
            </button>
          )}
        </div>
      )}
      <p className="small" style={{ margin: 0 }}>
        Join code <b style={{ letterSpacing: "0.12em" }}>{branch.join_code}</b> — anyone with it can join this branch, so share it with comrades only.
      </p>
      <div className="row gap8">
        <button type="button" className="btn btn-o btn-sm grow" onClick={() => navigator.clipboard.writeText(invite).then(() => toast("Invite copied — send it to the comrade"))}>
          Copy invite
        </button>
        {isGs && (
          <button
            type="button"
            className="btn btn-o btn-sm"
            onClick={async () => {
              if (!window.confirm("Make a new code? The old one stops working.")) return;
              try {
                const res = await post<{ join_code: string }>("/api/branches", { action: "new-code" });
                setData({ ...branch, join_code: res.join_code });
                toast("New code made");
              } catch (err) {
                toast(err instanceof Error ? err.message : "Couldn't make a new code");
              }
            }}
          >
            New code
          </button>
        )}
      </div>
      {isGs && <ViewerLink branch={branch} onChange={(viewer_code) => setData({ ...branch, viewer_code })} />}
    </div>
  );
}

/**
 * Secretary: a link that lets someone outside the branch see how it
 * runs without being able to change anything or see contacts, money or
 * follow-ups.
 */
function ViewerLink({ branch, onChange }: { branch: Branch; onChange: (code: string | null) => void }) {
  const toast = useToast();
  const link = branch.viewer_code ? `${publicOrigin()}/join/${branch.viewer_code}` : null;
  async function set(on: boolean) {
    try {
      const res = await post<{ viewer_code: string | null }>("/api/branches", { action: "viewer-link", on });
      onChange(res.viewer_code);
      toast(on ? "Viewer link made" : "Viewer link off · anyone who joined with it stays until you remove them");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't change the viewer link");
    }
  }
  return (
    <div className="stack6 mt8">
      <p className="small" style={{ margin: 0 }}>
        <b>Viewer link.</b> For someone outside the branch who should see how it runs. They can&apos;t change anything and never see contacts, phone numbers, money or follow-ups.
      </p>
      {link ? (
        <div className="row gap8 wrap">
          <button type="button" className="btn btn-o btn-sm grow" onClick={() => navigator.clipboard.writeText(link).then(() => toast("Viewer link copied"))}>
            Copy viewer link
          </button>
          <button type="button" className="link small" onClick={() => set(false)}>
            Turn off
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-o btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => set(true)}>
          Make a viewer link
        </button>
      )}
    </div>
  );
}

/** Admin: hop between branches. Everything you then see and do is that branch's. */
function AdminSwitch({ current }: { current: string }) {
  const toast = useToast();
  const router = useRouter();
  const [list, setList] = useState<{ id: string; name: string; district: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="row gap8" style={{ alignItems: "center" }}>
      <span className="lc-k">Admin</span>
      {list ? (
        <select
          className="inp grow"
          value={current}
          disabled={busy}
          aria-label="Work in branch"
          onChange={async (e) => {
            setBusy(true);
            try {
              await post("/api/branches", { action: "switch", id: e.target.value });
              clearDataCache();
              router.replace("/home");
              router.refresh();
            } catch (err) {
              toast(err instanceof Error ? err.message : "Couldn't switch");
              setBusy(false);
            }
          }}
        >
          {list.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      ) : (
        <button type="button" className="link small" onClick={async () => setList(await post("/api/branches", { action: "list" }))}>
          Switch branch
        </button>
      )}
    </div>
  );
}

/** One place for when you're free: the weekly grid on Availability (paper sales, polls and planning all read it). */
function Availability() {
  return (
    <section>
      <SectionHead title="When you're usually free" />
      <WeekLink />
    </section>
  );
}

/** The fuller weekly grid lives on Availability — link it, and nudge if it's empty. */
function WeekLink() {
  const actor = useActor();
  const { data } = useData<Availability[]>("/api/availability?activity=general");
  const mine = (data ?? []).find((a) => a.user_id === actor?.id);
  const filled = !!mine && ((mine.slots?.length ?? 0) > 0 || (mine.days?.length ?? 0) > 0);
  return (
    <Link className={"li li-link mt8" + (filled ? "" : " ask")} href="/availability">
      <div className="grow min0">
        <p className="t">{filled ? "Your usual week" : "Fill in your usual week"}</p>
        <p className="small">{filled ? "Mornings, afternoons, evenings, and when you're away." : "Mornings, afternoons or evenings — so meetings and stalls get planned when people can make them."}</p>
      </div>
    </Link>
  );
}

/** Admin (the app's developer): the maintenance side, kept out of the branch secretary's way. */
function AdminTools() {
  const { data: feedback } = useData<{ status: string }[]>("/api/feedback");
  const open = (feedback ?? []).filter((f) => f.status === "open").length;
  return (
    <section>
      <SectionHead title="Admin" />
      <div className="stack6">
        <Link className="li li-link" href="/feedback">
          <div className="grow min0">
            <p className="t">Feedback · {open} open</p>
            <p className="small">Mark things fixed, reply. Only you can.</p>
          </div>
        </Link>
        <Link className="li li-link" href="/resources">
          <div className="grow min0">
            <p className="t">Resource feeds</p>
            <p className="small">Fix a feed or link (e.g. the podcast RSS) at the bottom of Resources.</p>
          </div>
        </Link>
        <WaitingBranches />
        <p className="small" style={{ margin: 0 }}>Switch branch from Branch below. You count as secretary in whichever branch you&apos;re in.</p>
      </div>
    </section>
  );
}

/** Admin: new branches on this copy that are waiting to start. */
function WaitingBranches() {
  const toast = useToast();
  const [list, setList] = useState<{ id: string; name: string; district: string; approved: boolean; created_at?: string }[] | null>(null);
  useEffect(() => {
    post<{ id: string; name: string; district: string; approved: boolean }[]>("/api/branches", { action: "list" })
      .then(setList)
      .catch(() => setList([]));
  }, []);
  const waiting = (list ?? []).filter((b) => !b.approved);
  if (!waiting.length) return null;
  return (
    <div className="ask stack6">
      <span className="ask-k">New branches waiting · {waiting.length}</span>
      {waiting.map((b) => (
        <div key={b.id} className="row gap8" style={{ alignItems: "center" }}>
          <span className="grow small">
            <b>{b.name}</b>
            {b.district ? ` · ${b.district}` : ""}
          </span>
          <button
            type="button"
            className="btn btn-p btn-sm"
            onClick={async () => {
              try {
                await post("/api/branches", { action: "approve", id: b.id });
                setList((p) => (p ?? []).map((x) => (x.id === b.id ? { ...x, approved: true } : x)));
                toast(`${b.name} can start now`);
              } catch (err) {
                toast(err instanceof Error ? err.message : "Couldn't approve");
              }
            }}
          >
            Approve
          </button>
        </div>
      ))}
    </div>
  );
}
