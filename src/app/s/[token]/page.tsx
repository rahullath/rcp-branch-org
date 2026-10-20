import type { Metadata } from "next";
import { headers } from "next/headers";
import { getActor } from "@/lib/auth";
import { getEvent, listRsvps } from "@/lib/data";
import { getPublicShare } from "@/lib/shares";
import { inviteBrief } from "@/lib/invite-brief";
import { linkKind } from "@/lib/preread";
import { DEFAULT_GRAPHIC_FIELDS, DEFAULT_GRAPHIC_OPTIONS, RcsGraphic, type GraphicFields, type GraphicOptions } from "@/components/rcs-graphic";
import { MemberRsvp, ShareRsvpForm } from "./rsvp-form";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };
type PageProps = Params & { searchParams: Promise<{ c?: string }> };

const TZ = "Europe/London";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** Six hours after the start, replies close. */
function hasPassed(iso: string) {
  return Date.parse(iso) < Date.now() - 6 * 3600_000;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const share = await getPublicShare(token);
  if (!share) return { title: "Link expired", robots: { index: false } };
  const e = share.event;
  // WhatsApp shows this under the title: what it's about first, then when and where.
  const about = share.brief?.about || (share.brief?.section ? `This session: ${share.brief.section}` : "") || e.description || "";
  const description = `${about ? clip(about, 110) + " · " : ""}${day(e.start_time)}, ${time(e.start_time)} · ${e.location || "Place TBC"}`;
  // The preview image must be on the host the link was opened on (WhatsApp fetches it from there).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";
  return {
    title: e.title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: e.title,
      description,
      ...(share.has_image ? { images: [{ url: `${origin}/api/share/${token}/image` }] } : {}),
    },
    twitter: { card: share.has_image ? "summary_large_image" : "summary", title: e.title, description },
  };
}

/**
 * The page a share link opens — no account, no menu. Written for a contact
 * who's never been: what this kind of event is, what this one's about, how it
 * runs, optional reading, then "I'm coming". The graphic sits below, so the
 * first screen is words. Nothing here leads anywhere else in the app, and no
 * attendee or speaker names are shown.
 *
 * Three readers, one page. Signed in to this branch: a strip saying so, and
 * "I'm going" on your own account. Opened from the branch chat (the link
 * carries `?c=<join code>`): a button for comrades to sign in and join, which
 * lands them back on this event. Anyone else (contacts): one quiet line at
 * the bottom, nothing asking them to install anything.
 */
export default async function SharePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { c } = await searchParams;
  const share = await getPublicShare(token);

  if (!share) {
    return (
      <main className="v2 pg" style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
        <h1>Link expired</h1>
        <p className="sub">Ask whoever sent it for a new one.</p>
      </main>
    );
  }

  const e = share.event;
  const off = e.status === "off";
  const past = hasPassed(e.start_time);
  const fields: GraphicFields["event"] = {
    ...DEFAULT_GRAPHIC_FIELDS.event,
    title: e.title.split(" — ")[0],
    date: day(e.start_time).split(" ").slice(0, 3).join(" "),
    time: time(e.start_time),
    where: (e.location || "").split(",")[0],
    ...((share.graphic?.f ?? {}) as Partial<GraphicFields["event"]>),
  };
  const options: GraphicOptions = { ...DEFAULT_GRAPHIC_OPTIONS, ...((share.graphic?.o ?? {}) as Partial<GraphicOptions>), size: "post" };

  // RLS: the event only comes back if they're in its branch.
  const actor = await getActor();
  const member = actor?.branch && (await getEvent(e.id)) ? actor : null;
  const going = member ? (await listRsvps()).some((r) => r.event_id === e.id && r.user_id === member.id && r.status === "going") : false;
  const fromChat = !member && !!c && /^[A-Za-z0-9]{4,12}$/.test(c);
  const goHref = `/s/${token}/go${fromChat ? `?c=${c!.toUpperCase()}` : ""}`;
  const open = !off && !past;
  const kind = inviteBrief(e.event_type);
  const b = share.brief;
  // One thing to read and one to listen to (main reading first); the rest stay in the app.
  const isAudio = (l: { url: string }) => linkKind(l.url) !== "article";
  const read = b?.reading.find((l) => !isAudio(l));
  const listen = b?.reading.find(isAudio);
  const same = (x?: string | null) => !x || x.trim().toLowerCase() === e.title.trim().toLowerCase();
  // An auto-written "Read before: …" repeats the section; the organiser's own words don't.
  const note = e.description && !(b?.section && e.description.startsWith("Read before")) ? e.description : null;
  const specifics = [
    !same(b?.topic) ? <p key="t" className="t" style={{ margin: 0 }}>{b!.topic}</p> : null,
    b?.about ? <p key="a" style={para}>{b.about}</p> : null,
    !same(b?.book) ? <p key="b" style={para}>Reading <b>{b!.book}</b></p> : null,
    b?.section ? <p key="s" style={para}>This time: <b>{b.section}</b></p> : null,
    note ? <p key="n" style={{ ...para, whiteSpace: "pre-wrap" }}>{note}</p> : null,
  ].filter(Boolean);

  return (
    <main className="v2 pg" style={{ maxWidth: 520, margin: "0 auto", padding: "16px 16px 48px" }}>
      {member && (
        <p className="small" style={{ margin: 0, padding: "8px 12px", background: "var(--soft, #f4f4f4)" }}>
          Signed in as {member.name.replace(/^Comrade\s+/i, "").split(" ")[0]}. This is the page contacts see.{" "}
          <a className="link" href={`/events/${e.id}`}>
            Open in the app
          </a>
        </p>
      )}
      <div>
        <span className="kicker">{kind.label} · Revolutionary Communist Party</span>
        <h1 style={{ fontSize: 28, marginTop: 4, textDecoration: off ? "line-through" : undefined }}>{e.title}</h1>
      </div>

      {off && (
        <div className="ask" style={{ borderColor: "var(--red)" }}>
          <span className="ask-k red">Called off</span>
          <p className="small" style={{ margin: 0 }}>This one isn&apos;t happening. Ask whoever sent you the link what&apos;s next.</p>
        </div>
      )}

      <div className="kv">
        <span>When</span>
        <b>
          {day(e.start_time)}, {time(e.start_time)}
          {e.meetup_time ? ` (meet ${time(e.meetup_time)})` : ""}
        </b>
        <span>Where</span>
        <b>{e.location || "Place to be confirmed"}</b>
        {e.status === "tentative" && e.target ? (
          <>
            <span>Happening?</span>
            <b>
              If {e.target} come — {share.going} so far
            </b>
          </>
        ) : null}
      </div>

      {kind.what && <p style={para}>{kind.what}</p>}

      {specifics.length > 0 && (
        <section className="stack6">
          <h4 className="dayh">{kind.thisOne}</h4>
          {specifics}
        </section>
      )}

      {kind.steps.length > 0 && (
        <section className="stack6">
          <h4 className="dayh">How it runs</h4>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.5, listStyle: "decimal" }}>
            {kind.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      )}

      {(read || listen) && (
        <section className="stack6">
          <h4 className="dayh">Before you come</h4>
          {read && (
            <a className="li" href={read.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              <span className="grow min0">
                <span className="kicker">Read</span>
                <span className="t" style={{ display: "block" }}>{read.label}</span>
              </span>
              <span aria-hidden>↗</span>
            </a>
          )}
          {listen && (
            <a className="li" href={listen.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              <span className="grow min0">
                <span className="kicker">{linkKind(listen.url) === "youtube" ? "Watch" : "Listen"}</span>
                <span className="t" style={{ display: "block" }}>{listen.label}</span>
              </span>
              <span aria-hidden>↗</span>
            </a>
          )}
          <p className="small" style={{ margin: 0 }}>{read && listen ? "Do one of these before the meeting. It makes the discussion much better." : "Do this before the meeting. It makes the discussion much better."}</p>
        </section>
      )}

      {open && fromChat && (
        <div className="ask stack6" style={{ borderColor: "var(--red)" }}>
          <span className="ask-k red">Comrades</span>
          <p className="t" style={{ margin: 0 }}>Say you&apos;re coming in the branch app</p>
          <p className="small" style={{ margin: 0 }}>Sign in with your email, no password. You&apos;ll see who&apos;s going, the reading, and everything else that&apos;s on, and you&apos;ll land back on this.</p>
          <a className="btn btn-p" href={goHref}>
            Open in the app
          </a>
        </div>
      )}

      {open && member ? <MemberRsvp eventId={e.id} going={going} /> : open ? <ShareRsvpForm token={token} label={fromChat ? "Or just your name" : undefined} /> : past && !off ? <p className="small">This has already happened.</p> : null}

      {share.has_image ? (
        // eslint-disable-next-line @next/next/no-img-element -- stored data image served by our own route
        <img src={`/api/share/${token}/image`} alt={e.title} style={{ width: "100%", height: "auto", display: "block" }} />
      ) : (
        <RcsGraphic tpl="event" f={fields} o={options} />
      )}

      <p className="small" style={{ marginTop: 8 }}>
        Want to know more about the communists?{" "}
        <a className="link" href="https://communist.red/join-the-revolutionary-communist-party/" target="_blank" rel="noopener noreferrer">
          communist.red
        </a>
      </p>
      {!member && !fromChat && (
        <p className="small" style={{ margin: 0 }}>
          In the branch?{" "}
          <a className="link" href={goHref}>
            Sign in
          </a>
        </p>
      )}
    </main>
  );
}

const para = { fontSize: 15, lineHeight: 1.5, margin: 0 } as const;
