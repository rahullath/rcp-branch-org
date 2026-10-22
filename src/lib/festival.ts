/** The party's national school weekend. Dates and link come from the festival's own site. */
export const FESTIVAL = {
  name: "Revolution Festival",
  start: "2026-11-13",
  end: "2026-11-15",
  where: "London",
  url: "https://revolutionfestival.co.uk/",
  /** How far ahead the home card starts showing. */
  showDays: 60,
};

/** Days until it starts (0 = today or it has begun), or null when it isn't time to show it (too early, or over). */
export function festivalCountdown(now: number): number | null {
  const start = Date.parse(`${FESTIVAL.start}T00:00:00Z`);
  const end = Date.parse(`${FESTIVAL.end}T23:59:59Z`);
  if (now > end) return null;
  const days = Math.ceil((start - now) / 86400_000);
  if (days > FESTIVAL.showDays) return null;
  return Math.max(0, days);
}
