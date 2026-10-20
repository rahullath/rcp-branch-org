/**
 * A readable title for a link someone pasted. Server only: asks the page for
 * its title (YouTube through its oEmbed), and falls back to the address itself
 * ("marxist.com/lenins-imperialism-today" → "Lenins imperialism today"), never
 * a bare "Article" or "Video".
 */

import type { PrepLink } from "./types";
import { linkKind } from "./preread";

const GENERIC = /^(article|video|youtube|spotify|podcast|audio|link|read|listen|watch|reading)$/i;

/** Labels that say nothing about what the link is ("Article", or just the site's name). */
export const isGenericTitle = (s: string | null | undefined, url?: string) => {
  const t = (s ?? "").trim();
  if (!t || GENERIC.test(t)) return true;
  if (!url) return false;
  try {
    return t.toLowerCase() === new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return false;
  }
};

/** Last resort: the most specific part of the address, tidied. */
export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p).replace(/\.(html?|php|aspx?)$/i, ""));
    const slug = [...parts].reverse().find((p) => /[a-z]{3,}/i.test(p) && !/^\d+$/.test(p) && !/^(watch|index|en|article|articles|news|episode|show)$/i.test(p));
    if (slug) {
      const words = slug.replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim();
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 80);
  }
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;|&rsquo;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

/** Drops the site name: "Title | In Defence of Marxism", "Title - YouTube". */
const trimSite = (t: string) => t.replace(/\s+[|–—-]\s+(YouTube|In Defence of Marxism|marxist\.com|Communist\.red|The Communist|Spotify|Wellred Books?)$/i, "").trim();

/** The page's own title, or null if it can't be reached quickly. */
export async function fetchTitle(url: string): Promise<string | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    // YouTube and Spotify pages are built in the browser; their oEmbed gives the title.
    const oembed = /youtu\.?be/.test(url) ? "https://www.youtube.com/oembed?format=json&url=" : /open\.spotify\.com/.test(url) ? "https://open.spotify.com/oembed?url=" : null;
    if (oembed) {
      const r = await fetch(`${oembed}${encodeURIComponent(url)}`, { signal: ctl.signal });
      if (r.ok) {
        const j = (await r.json()) as { title?: string };
        if (j.title) return decode(j.title);
      }
    }
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (branch app link preview)", Accept: "text/html" }, redirect: "follow" });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await r.text()).slice(0, 300_000);
    const meta = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1] ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i"))?.[1];
    const t = meta("og:title") ?? meta("twitter:title") ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    return t ? trimSite(decode(t)).slice(0, 200) || null : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Keep a real label; replace a generic or missing one with the page title (or the address). */
export async function resolveTitle(label: string | null | undefined, url: string): Promise<string> {
  if (!isGenericTitle(label, url)) return label!.trim();
  return (await fetchTitle(url)) ?? titleFromUrl(url);
}

/** Prep links saved with a real title, not "Article". */
export function withTitles(links: PrepLink[]): Promise<PrepLink[]> {
  return Promise.all(
    links.map(async (l) => ({
      ...l,
      label: await resolveTitle(l.label, l.url),
      // A YouTube or Spotify link left on the default "Article".
      kind: !l.kind || l.kind === "article" ? linkKind(l.url) : l.kind,
    })),
  );
}

/**
 * The daily run: readings and prep links still called "Article", "Video" or
 * just the site name get their page's title. A few a day, so it stays quick.
 */
export async function retitleLinks(admin: { from: (t: string) => any }, limit = 25): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let fixed = 0;
  const { data: reads } = await admin.from("shared_reads").select("id,title,url").order("created_at", { ascending: false }).limit(300);
  for (const r of (reads ?? []) as { id: string; title: string; url: string }[]) {
    if (fixed >= limit) break;
    if (!isGenericTitle(r.title, r.url)) continue;
    const t = (await fetchTitle(r.url)) ?? titleFromUrl(r.url);
    if (t && t !== r.title) {
      await admin.from("shared_reads").update({ title: t }).eq("id", r.id);
      fixed++;
    }
  }
  const { data: items } = await admin.from("agenda_items").select("id,prep_links").not("prep_links", "is", null).limit(500);
  for (const it of (items ?? []) as { id: string; prep_links: PrepLink[] | null }[]) {
    if (fixed >= limit) break;
    const links = it.prep_links ?? [];
    if (!links.some((l) => isGenericTitle(l.label, l.url))) continue;
    const next = await Promise.all(links.map(async (l) => (isGenericTitle(l.label, l.url) ? { ...l, label: (await fetchTitle(l.url)) ?? titleFromUrl(l.url) } : l)));
    await admin.from("agenda_items").update({ prep_links: next }).eq("id", it.id);
    fixed++;
  }
  return fixed;
}
