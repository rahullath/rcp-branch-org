/** The party portal: monthly subs and paper/IDOM subscriptions live there, not in this app. */
export const PORTAL_URL = "https://portal.communist.red";

/** "pat.smith2517" — a name nobody chose (it came from the sign-up email). */
export function looksLikeEmail(name: string) {
  return !/\s/.test(name.trim()) && /[\d._@]/.test(name);
}

/** Still the name sign-up made from their email ("caitlinwatsonwork"), not one they gave. */
export function isPlaceholderName(name: string, email?: string | null) {
  const n = name.trim().toLowerCase();
  return !n || looksLikeEmail(n) || (!!email && n === email.split("@")[0].toLowerCase());
}

/** Best guess at a readable name from an email: "pat.smith2517@…" → "Pat Smith". */
export function nameFromEmail(email: string) {
  const words = email.split("@")[0].split(/[._\-+\d]+/).filter(Boolean);
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || "New comrade";
}

/** What lists show for someone who hasn't said their name yet: never the raw email. */
export function tidyName<T extends { name: string; email?: string | null }>(p: T): T {
  return isPlaceholderName(p.name, p.email) ? { ...p, name: nameFromEmail(p.email || p.name) } : p;
}
