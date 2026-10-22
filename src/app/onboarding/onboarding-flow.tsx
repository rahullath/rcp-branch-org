"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CalendarDays, Check, Download, Inbox, MessageCircle, Users } from "lucide-react";
import { api, patch, post } from "@/lib/client";
import { ROLE_LABEL, type Comrade, type Role } from "@/lib/types";
import { initials as initialsOf } from "@/lib/utils";
import { CalendarLinks } from "@/components/features/calendar-links";
import { formatPhone, normalizePhone } from "@/lib/phone";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const OFFICER_ROLES: Role[] = ["general_secretary", "organizer", "education_officer", "finance_officer", "paper_sales_officer", "social_media_officer", "leading_comrade"];
const STEPS = ["You", "Role", "How it works", "Your phone"] as const;

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function OnboardingFlow({ branch, startName, roles }: { branch: string; startName: string; roles: Role[] }) {
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // ---- 1. who you are
  const [people, setPeople] = useState<Comrade[] | null>(null);
  const [picked, setPicked] = useState<Comrade | null>(null);
  const [name, setName] = useState(startName);
  const [ini, setIni] = useState("");
  const [aliases, setAliases] = useState("");
  const [phone, setPhone] = useState("+44 ");
  const [q, setQ] = useState("");
  useEffect(() => {
    api<Comrade[]>("/api/comrades")
      .then((rows) => setPeople(rows.filter((c) => !c.profile_id)))
      .catch(() => setPeople([]));
  }, []);
  const suggestions = useMemo(() => {
    const list = people ?? [];
    const term = (q || name).trim().toLowerCase();
    const hits = term ? list.filter((c) => [c.name, ...c.aliases].some((n) => n.toLowerCase().includes(term) || term.includes(n.toLowerCase()))) : list;
    return [...hits, ...list.filter((c) => !hits.includes(c))].slice(0, 12);
  }, [people, q, name]);

  function pick(c: Comrade | null) {
    setPicked(c);
    if (!c) return;
    setName(c.name);
    const short = c.aliases.find((a) => /^[A-Z]{2,4}$/.test(a));
    setIni(short ?? "");
    setAliases(c.aliases.filter((a) => a !== short).join(", "));
  }

  async function saveIdentity() {
    setBusy(true);
    setMsg("");
    try {
      const res = await patch<{ moved: number }>("/api/me/identity", {
        name: name.trim(),
        initials: ini.trim(),
        aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
        comrade_id: picked?.id,
        ...(normalizePhone(phone) ? { phone } : {}),
      });
      setMsg(res.moved ? `${res.moved} thing${res.moved === 1 ? "" : "s"} the branch had down for you moved to your inbox.` : "");
      setStep(1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  // ---- 2. role
  const officer = roles.filter((r) => r !== "member");
  const [asked, setAsked] = useState<Role[]>([]);
  const [note, setNote] = useState("");
  async function sendRoles() {
    setBusy(true);
    setMsg("");
    try {
      for (const role of asked) await post("/api/role-requests", { role, note: note.trim() || null });
      setMsg(asked.length ? "Sent to the secretary — you'll have it as soon as they confirm." : "");
      setStep(2);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't send that");
    } finally {
      setBusy(false);
    }
  }

  // ---- 4. phone
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [pushState, setPushState] = useState<"off" | "on" | "blocked" | "unsupported" | "unconfigured">("off");
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setInstalled(window.matchMedia("(display-mode: standalone)").matches || !!(navigator as unknown as { standalone?: boolean }).standalone);
      setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) setPushState("unsupported");
    });
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  }

  async function turnOnPush() {
    try {
      const cfg = await api<{ configured: boolean; publicKey: string }>("/api/push");
      if (!cfg.configured) return setPushState("unconfigured");
      if ((await Notification.requestPermission()) !== "granted") return setPushState("blocked");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.publicKey) }));
      await post("/api/push/subscribe", sub.toJSON());
      setPushState("on");
    } catch {
      setPushState("blocked");
    }
  }

  async function finish() {
    setBusy(true);
    try {
      await post("/api/me/onboarded", {});
    } catch {
      /* the gate re-checks; worst case they see this once more */
    }
    // A full load, so the server sees you're done and lets you in. Came from
    // an event's share link? Back to that event.
    const back = document.cookie.match(/(?:^|;\s*)return_to=([^;]+)/)?.[1];
    document.cookie = "return_to=; max-age=0; path=/";
    const to = back ? decodeURIComponent(back) : "";
    window.location.replace(to.startsWith("/events/") ? to : "/home");
  }

  return (
    <>
      <div className="row gap6" aria-label={`Step ${step + 1} of ${STEPS.length}`} style={{ marginBottom: 4 }}>
        {STEPS.map((s, i) => (
          <span key={s} style={{ flex: 1, height: 4, background: i <= step ? "var(--red)" : "var(--line)" }} />
        ))}
      </div>
      <p className="kicker">
        {branch} · {STEPS[step]}
      </p>

      {step === 0 && (
        <section className="stack8">
          <div>
            <h1>Who are you?</h1>
            <p className="sub">So tasks with your name or initials reach you.</p>
          </div>
          {people && people.length > 0 && (
            <div className="stack6">
              <p className="small" style={{ margin: 0, fontWeight: 700 }}>
                Is one of these you? The branch already has these names.
              </p>
              {people.length > 12 && <input className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find your name" aria-label="Find your name" />}
              <div className="row gap6 wrap">
                {suggestions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={"chip" + (picked?.id === c.id ? " on" : "")}
                    style={{ height: "auto", padding: "8px 12px" }}
                    aria-pressed={picked?.id === c.id}
                    onClick={() => pick(picked?.id === c.id ? null : c)}
                  >
                    {picked?.id === c.id && <Check size={14} />} {c.name}
                    {c.aliases.length > 0 && <span className="muted"> · {c.aliases.slice(0, 2).join(", ")}</span>}
                  </button>
                ))}
              </div>
              {picked && <p className="small" style={{ margin: 0 }}>Anything the branch put down for {picked.name.split(/\s+/)[0]} becomes yours.</p>}
            </div>
          )}
          <label className="fld">
            <span>Your name, as the branch knows you</span>
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jo Bloggs" autoFocus={!people?.length} />
          </label>
          <div className="row gap8">
            <label className="fld" style={{ width: 110 }}>
              <span>Initials</span>
              <input className="inp" value={ini} onChange={(e) => setIni(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} placeholder={initialsOf(name || "A B")} maxLength={4} />
            </label>
            <label className="fld grow">
              <span>Other names people use</span>
              <input className="inp" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="e.g. Jo, Ru" />
            </label>
          </div>
          <label className="fld">
            <span>WhatsApp number (optional)</span>
            <input className="inp" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => normalizePhone(phone) && setPhone(formatPhone(normalizePhone(phone)))} />
          </label>
          <p className="small" style={{ margin: 0 }}>Only your branch can see it.</p>
          {msg && <p className="small red">{msg}</p>}
          <button type="button" className="btn btn-p" disabled={busy || !name.trim()} onClick={saveIdentity}>
            {busy ? "Saving…" : "That’s me"}
          </button>
        </section>
      )}

      {step === 1 && (
        <section className="stack8">
          <div>
            <h1>Do you hold a branch role?</h1>
            <p className="sub">If you hold a role, pick it and the secretary will confirm it.</p>
          </div>
          {officer.length > 0 && <p className="small">You already have: {officer.map((r) => ROLE_LABEL[r]).join(", ")}.</p>}
          <div className="stack6">
            <button type="button" className={"li li-link" + (asked.length === 0 ? " on" : "")} onClick={() => setAsked([])} aria-pressed={asked.length === 0}>
              <span className="grow t">{officer.length ? "Nothing else" : "Just a member"}</span>
              {asked.length === 0 && <Check size={16} />}
            </button>
            {OFFICER_ROLES.filter((r) => !roles.includes(r)).map((r) => (
              <button
                key={r}
                type="button"
                className="li li-link"
                aria-pressed={asked.includes(r)}
                onClick={() => setAsked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]))}
              >
                <span className="grow t">{ROLE_LABEL[r]}</span>
                {asked.includes(r) && <Check size={16} />}
              </button>
            ))}
          </div>
          {asked.length > 0 && <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the secretary should know (optional)" aria-label="Note" />}
          {msg && <p className="small">{msg}</p>}
          <button type="button" className="btn btn-p" disabled={busy} onClick={sendRoles}>
            {asked.length ? "Ask the secretary" : "Next"}
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="stack8">
          <div>
            <h1>How it works</h1>
            <p className="sub">It keeps track of the practical side: who&apos;s going, what to bring, who&apos;s following up whom.</p>
          </div>
          {msg && <p className="small">{msg}</p>}
          {[
            [CalendarDays, "This Week", "What's on and who's going. Tap to say if you're coming."],
            [Inbox, "Inbox", "Things waiting on you: a reply, something to bring, a task."],
            [Users, "Contacts & follow-ups", "People you've met and the comrades you're keeping in touch with."],
            [MessageCircle, "WhatsApp", "Invites and articles open in WhatsApp, ready to send."],
          ].map(([Icon, t, d]) => {
            const I = Icon as typeof Inbox;
            return (
              <div key={t as string} className="li" style={{ alignItems: "flex-start" }}>
                <I size={20} style={{ flexShrink: 0, marginTop: 2, color: "var(--red)" }} />
                <div className="grow min0">
                  <p className="t">{t as string}</p>
                  <p className="small">{d as string}</p>
                </div>
              </div>
            );
          })}
          <button type="button" className="btn btn-p" onClick={() => (setMsg(""), setStep(3))}>
            Next
          </button>
        </section>
      )}

      {step === 3 && (
        <section className="stack8">
          <div>
            <h1>Put it on your phone</h1>
            <p className="sub">Install it and get a reminder when something needs you.</p>
          </div>

          <div className="ask stack6">
            <span className="ask-k">
              <Download size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> Install the app
            </span>
            {installed ? (
              <p className="small" style={{ margin: 0 }}>
                <Check size={14} style={{ display: "inline" }} /> Installed.
              </p>
            ) : installPrompt ? (
              <button type="button" className="btn btn-p btn-sm" onClick={install}>
                Install
              </button>
            ) : isIOS ? (
              <p className="small" style={{ margin: 0 }}>
                In Safari, tap <b>Share</b> (the square with the arrow), then <b>Add to Home Screen</b>.
              </p>
            ) : (
              <p className="small" style={{ margin: 0 }}>
                In your browser menu, choose <b>Install app</b> or <b>Add to Home screen</b>.
              </p>
            )}
          </div>

          <div className="ask stack6">
            <span className="ask-k">
              <Bell size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> Notifications
            </span>
            <p className="small" style={{ margin: 0 }}>
              Only when something needs you — you can answer most from the notification. Quiet hours by default.
            </p>
            {pushState === "on" ? (
              <p className="small" style={{ margin: 0 }}>
                <Check size={14} style={{ display: "inline" }} /> On for this phone.
              </p>
            ) : pushState === "unsupported" ? (
              <p className="small" style={{ margin: 0 }}>{isIOS ? "Install the app first (above), then open it from your home screen to turn these on." : "This browser can't do notifications."}</p>
            ) : pushState === "blocked" ? (
              <p className="small red" style={{ margin: 0 }}>Blocked — allow notifications for this site in your phone&apos;s settings.</p>
            ) : pushState === "unconfigured" ? (
              <p className="small" style={{ margin: 0 }}>Not set up on this server yet.</p>
            ) : (
              <button type="button" className="btn btn-o btn-sm" onClick={turnOnPush}>
                Turn on
              </button>
            )}
          </div>

          <div className="ask stack6">
            <span className="ask-k">
              <CalendarDays size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> Your calendar
            </span>
            <CalendarLinks />
          </div>

          <button type="button" className="btn btn-p" disabled={busy} onClick={finish}>
            Done — show me this week
          </button>
        </section>
      )}
    </>
  );
}
