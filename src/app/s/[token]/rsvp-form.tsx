"use client";

import { useState } from "react";

/**
 * "I'm coming" — a name, plus (all optional) who sent them, how many more, and a note.
 * A first name alone doesn't tell the branch who a stranger is, but no email or phone is
 * asked for: who sent the link places them, and the branch follows up through that person.
 */
export function ShareRsvpForm({ token, label = "Coming?" }: { token: string; label?: string }) {
  const [name, setName] = useState("");
  const [whoSent, setWhoSent] = useState("");
  const [extra, setExtra] = useState(0);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState("");

  if (state === "done") {
    return (
      <div className="ask">
        <span className="ask-k">See you there</span>
        <p className="t" style={{ margin: 0 }}>Thanks, {name.trim().split(/\s+/)[0]} — they know you&apos;re coming{extra ? ` with ${extra} more` : ""}.</p>
      </div>
    );
  }

  return (
    <form
      className="ask stack6"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("saving");
        setError("");
        try {
          const res = await fetch(`/api/share/${token}/rsvp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, note, who_sent: whoSent, extra }) });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error ?? "Couldn't save that");
          setState("done");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't save that");
          setState("idle");
        }
      }}
    >
      <span className="ask-k">{label}</span>
      <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" required maxLength={60} />
      <input className="inp" value={whoSent} onChange={(e) => setWhoSent(e.target.value)} placeholder="Who sent you this? (optional)" aria-label="Who sent you this link" maxLength={60} />
      <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span className="small">Bringing anyone?</span>
        {[0, 1, 2, 3].map((n) => (
          <button key={n} type="button" className={`btn btn-sm ${extra === n ? "btn-p" : "btn-o"}`} aria-pressed={extra === n} onClick={() => setExtra(n)}>
            {n === 0 ? "Just me" : `+${n}`}
          </button>
        ))}
      </div>
      <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to say? (optional)" aria-label="Note" maxLength={300} />
      {error && <p className="small red" style={{ margin: 0 }}>{error}</p>}
      <button type="submit" className="btn btn-p" disabled={state === "saving" || !name.trim()}>
        I&apos;m coming
      </button>
    </form>
  );
}

/** Signed in and in the branch: one tap on your own account, not a name form. */
export function MemberRsvp({ eventId, going }: { eventId: string; going: boolean }) {
  const [state, setState] = useState<"idle" | "saving" | "done">(going ? "done" : "idle");
  const [error, setError] = useState("");
  return (
    <div className="ask stack6">
      <span className="ask-k">{state === "done" ? "You're going" : "Coming?"}</span>
      {state !== "done" && (
        <button
          type="button"
          className="btn btn-p"
          disabled={state === "saving"}
          onClick={async () => {
            setState("saving");
            setError("");
            const res = await fetch(`/api/events/${eventId}/rsvp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "going" }) }).catch(() => null);
            if (res?.ok) setState("done");
            else {
              setError("Couldn't save that. Try it in the app.");
              setState("idle");
            }
          }}
        >
          I&apos;m going
        </button>
      )}
      {error && <p className="small red" style={{ margin: 0 }}>{error}</p>}
      <a className="btn btn-o" href={`/events/${eventId}`}>
        Open in the app
      </a>
    </div>
  );
}
