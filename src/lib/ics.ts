/** Minimal RFC 5545 .ics generation — no line-folding, fine for the short
 * titles/descriptions this app produces. */

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildIcs(event: {
  uid: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  description?: string;
}): string {
  const dtEnd = event.end ?? new Date(new Date(event.start).getTime() + 60 * 60 * 1000).toISOString();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Communist Branch Organizer//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.uid}@branch-app`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(dtEnd)}`,
    `SUMMARY:${icsEscape(event.title)}`,
  ];
  if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** RFC 5545 lines are at most 75 octets; longer ones continue on a line starting with a space. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

/**
 * The subscribed calendar: every branch event, kept up to date by the
 * phone's calendar app (it re-fetches the link). Your reply shows in the
 * title — "✓" going, "?" maybe — and called-off events show as cancelled.
 */
export function buildFeed(
  calName: string,
  origin: string,
  events: { id: string; title: string; start_time: string; meetup_time?: string | null; location?: string | null; description?: string | null; status?: string | null; target?: number | null; mine?: string | null }[],
): string {
  const stamp = icsDate(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RCP Branch App//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(calName)}`,
    "X-WR-TIMEZONE:Europe/London",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    if (e.mine === "no") continue;
    const mark = e.mine === "going" ? "✓ " : e.mine === "maybe" ? "? " : "";
    const end = new Date(new Date(e.start_time).getTime() + 2 * 3600_000).toISOString();
    const notes = [
      e.status === "tentative" && e.target ? `Only happens if ${e.target} are going — check the app.` : null,
      e.meetup_time ? `Meet ${new Date(e.meetup_time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}` : null,
      e.description ?? null,
      `${origin}/events/${e.id}`,
    ].filter(Boolean);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@branch-app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(e.start_time)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(mark + e.title)}`,
      `STATUS:${e.status === "off" ? "CANCELLED" : e.status === "tentative" ? "TENTATIVE" : "CONFIRMED"}`,
      `URL:${origin}/events/${e.id}`,
    );
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    lines.push(`DESCRIPTION:${icsEscape(notes.join("\n"))}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
