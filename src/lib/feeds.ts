import type { ResourceSource } from "@/data/resource-sources";

/*
 * Reading the outlets' own feeds, server-side, cached for an hour — so
 * "Latest" shows what was actually just published, without anyone pasting
 * links in. Every fetch is time-boxed and failures are skipped quietly: a
 * site being down just means fewer items.
 */

export interface FeedItem {
  title: string;
  url: string;
  source: string;
  date: string | null;
  kind: "article" | "video" | "podcast";
}

const HOUR = 3600;

async function get(url: string, revalidate = HOUR): Promise<string | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate },
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "BranchApp/1.0 (+resources)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html" },
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#8217;|&rsquo;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#822[01];|&[lr]dquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, "")
    .trim();

const tag = (block: string, name: string) => block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? null;

function iso(d: string | null) {
  if (!d) return null;
  const t = Date.parse(d.trim());
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** RSS 2.0 or Atom → items. */
function parseFeed(xml: string, source: string, kind: FeedItem["kind"]): FeedItem[] {
  const out: FeedItem[] = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const title = decode(tag(b, "title") ?? "");
    const url = decode(tag(b, "link") ?? "") || (b.match(/<enclosure[^>]+url="([^"]+)"/i)?.[1] ?? "");
    if (title && url) out.push({ title, url, source, date: iso(tag(b, "pubDate") ?? tag(b, "dc:date")), kind });
  }
  for (const m of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const b = m[0];
    const title = decode(tag(b, "title") ?? "");
    const url = b.match(/<link[^>]+href="([^"]+)"/i)?.[1] ?? "";
    if (title && url) out.push({ title, url, source, date: iso(tag(b, "published") ?? tag(b, "updated")), kind });
  }
  return out;
}

/** A news sitemap has urls and dates but no titles — the slug is readable enough. */
function parseSitemap(xml: string, source: string): FeedItem[] {
  const out: FeedItem[] = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const loc = decode(tag(m[1], "loc") ?? "");
    const title = decode(tag(m[1], "news:title") ?? "") || slugTitle(loc);
    if (loc && title && !/\/(africa|americas|asia|europe|middle-east|oceania)\.htm$/.test(loc)) {
      out.push({ title, url: loc, source, date: iso(tag(m[1], "lastmod") ?? tag(m[1], "news:publication_date")), kind: "article" });
    }
  }
  return out;
}

function slugTitle(url: string) {
  const slug = url.replace(/[?#].*$/, "").replace(/\/$/, "").split("/").pop() ?? "";
  const words = slug.replace(/\.html?$/, "").replace(/[-_]+/g, " ").trim();
  return words.length > 5 && !/^\d+$/.test(words) ? words[0].toUpperCase() + words.slice(1) : "";
}

/** YouTube: find the channel id on its page once (cached a day), then read its feed. */
async function youtubeFeed(channelUrl: string): Promise<string | null> {
  const page = await get(channelUrl, 24 * HOUR);
  const id = page?.match(/"(?:channelId|externalId)":"(UC[\w-]{20,})"/)?.[1] ?? page?.match(/channel_id=(UC[\w-]{20,})/)?.[1];
  return id ? `https://www.youtube.com/feeds/videos.xml?channel_id=${id}` : null;
}

/** Podcasts: Apple's directory gives any show's RSS by name (cached a day). */
async function podcastFeed(name: string): Promise<string | null> {
  const body = await get(`https://itunes.apple.com/search?media=podcast&entity=podcast&country=gb&limit=10&term=${encodeURIComponent(name)}`, 24 * HOUR);
  if (!body) return null;
  try {
    const rows = (JSON.parse(body) as { results?: { collectionName?: string; feedUrl?: string }[] }).results ?? [];
    const exact = rows.find((r) => r.collectionName?.trim().toLowerCase() === name.toLowerCase() && r.feedUrl);
    return exact?.feedUrl ?? null;
  } catch {
    return null;
  }
}

export async function latestFrom(source: ResourceSource): Promise<FeedItem[]> {
  const kind: FeedItem["kind"] = source.key === "youtube" ? "video" : source.key === "podcasts" ? "podcast" : "article";
  // Several podcasts: newest episodes across all their feeds.
  if (!source.feed && source.podcasts?.length) {
    const urls = (await Promise.all(source.podcasts.map(podcastFeed))).filter((u): u is string => !!u);
    const lists = await Promise.all(
      urls.map(async (u) => {
        const xml = await get(u);
        return xml ? parseFeed(xml, source.label, kind) : [];
      }),
    );
    return lists.flat().sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }
  const feedUrl = source.youtube ? await youtubeFeed(source.youtube) : source.feed;
  if (feedUrl) {
    const xml = await get(feedUrl);
    const items = xml ? parseFeed(xml, source.label, kind) : [];
    if (items.length) return items;
  }
  if (source.sitemap) {
    const xml = await get(source.sitemap);
    if (xml) return parseSitemap(xml, source.label);
  }
  return [];
}

/** WordPress REST search (communist.red): live titles for anything ever published. */
export async function searchSource(source: ResourceSource, q: string): Promise<FeedItem[]> {
  if (!source.search) return [];
  const body = await get(source.search.replace("{q}", encodeURIComponent(q)), HOUR);
  if (!body) return [];
  try {
    const rows = JSON.parse(body) as { title?: string; url?: string }[];
    return rows.filter((r) => r.title && r.url).map((r) => ({ title: decode(r.title!), url: r.url!, source: source.label, date: null, kind: "article" as const }));
  } catch {
    return [];
  }
}
