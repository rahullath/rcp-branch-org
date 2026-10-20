import type { AgendaItem, Event, Profile, Rsvp, Session } from "./types";
import { formatDate, formatTime } from "./utils";

const EVENT_TYPE_LABELS: Record<string, string> = {
  paper_sale: "Paper sale",
  social: "Social",
  branch: "Branch meeting",
  open_meeting: "Open meeting",
  reading_group: "Reading group",
  uni_stall: "Uni stall",
  phonebank: "Phone banking",
  postering: "Postering",
  mobilization: "Mobilization",
  one_on_one: "1-on-1",
  committee: "Branch committee meeting",
};

function profileName(id: string | null | undefined, profiles: Profile[]): string | null {
  if (!id) return null;
  return profiles.find((p) => p.id === id)?.name ?? null;
}

/** WhatsApp uses single asterisks for bold, not markdown's double asterisks —
 * these formatters target "paste straight into WhatsApp and it renders", not
 * a markdown viewer. See https://faq.whatsapp.com/539178204879377 (bold/
 * italic/strikethrough syntax). */
function bold(text: string): string {
  return `*${text}*`;
}

/** Plain-text summary for the "Copy summary" button on an event card. */
export function formatEventSummary(event: Event, rsvps: Rsvp[], profiles: Profile[]): string {
  const goingNames = rsvps
    .filter((r) => r.event_id === event.id && r.status === "going")
    .map((r) => profileName(r.user_id, profiles))
    .filter((n): n is string => !!n);

  const lines = [
    bold(event.title),
    `${EVENT_TYPE_LABELS[event.event_type] ?? event.event_type} — ${event.location || "TBC"}`,
    `${formatDate(event.start_time)} · ${formatTime(event.start_time)}`,
  ];
  if (event.meetup_time) lines.push(`Meet ${formatTime(event.meetup_time)}`);
  lines.push(`${bold(`Going (${goingNames.length})`)}: ${goingNames.length ? goingNames.join(", ") : "nobody yet"}`);
  if (event.description) lines.push("", event.description);
  return lines.join("\n");
}

/** Plain-text agenda for the "Copy agenda" button, matching the branch's own doc format. */
export function formatMeetingAgenda(event: Event, items: AgendaItem[], profiles: Profile[]): string {
  const chair = profileName(event.chair_id, profiles);
  const minutes = profileName(event.minutes_id, profiles);

  const lines = [
    bold(event.title),
    `${formatDate(event.start_time)} ${formatTime(event.start_time)}${
      event.meetup_time ? ` (meet ${formatTime(event.meetup_time)})` : ""
    }`,
    `Location: ${event.location || "TBC"}`,
    "",
    `${bold("Chair")}: ${chair ?? "—"}   ${bold("Minutes")}: ${minutes ?? "—"}`,
  ];

  const bySection = (section: AgendaItem["section"]) =>
    items.filter((i) => i.section === section).sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));

  for (const item of bySection("political")) {
    lines.push("", bold(`Political Discussion${item.duration ? ` (${item.duration})` : ""}: ${item.title}`));
    if (item.leadoff_name) lines.push(`Leadoff: ${item.leadoff_name}`);
    if (item.prep_links?.length) {
      lines.push(bold("Preparation:"));
      for (const l of item.prep_links) {
        const tag = l.kind ? ` [${l.kind}]` : "";
        lines.push(`${l.label}${tag}: ${l.url}`);
      }
    }
  }

  const organizational = bySection("organizational");
  if (organizational.length) {
    lines.push("", bold("Organisational Discussion"));
    for (const item of organizational) {
      const owner = item.leadoff_name ? ` - ${item.leadoff_name}` : "";
      const duration = item.duration ? ` (${item.duration})` : "";
      lines.push(`${item.title}${owner}${duration}`);
    }
  }

  return lines.join("\n");
}

/** Plain-text leadoff schedule for the "Copy programme" button — a numbered
 * list rather than a tab table, since tabs don't survive a WhatsApp paste. */
export function formatProgrammeSchedule(sessions: Session[]): string {
  const lines = [bold("Branch Programme")];
  for (const s of [...sessions].sort((a, b) => a.position - b.position)) {
    const date = formatDate(s.session_date);
    lines.push(`${s.position}. ${s.topic} — ${s.leadoff_name ?? "TBC"}${date ? ` (${date})` : ""}`);
  }
  return lines.join("\n");
}
