import { json, serverError, withActor } from "@/lib/api";
import { searchSource, type FeedItem } from "@/lib/feeds";
import { resourceSources } from "@/lib/resource-sources";
import INDEX from "@/data/library-index.json";

export const dynamic = "force-dynamic";

type Row = [title: string, url: string, source: string, date: string];

/**
 * Search everything the party has published: the archive index (every
 * article in the communist.red, marxist.com and Wellred sitemaps) plus
 * communist.red's live search for anything newer.
 */
export async function GET(request: Request) {
  const { error } = await withActor();
  if (error) return error;
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) return json({ items: [] });
  try {
    const words = q.split(/\s+/).filter(Boolean);
    const local: FeedItem[] = (INDEX as Row[])
      .filter(([title, url]) => {
        const hay = `${title} ${url}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 40)
      .map(([title, url, source, date]) => ({ title, url, source, date: date || null, kind: "article" }));
    const live = (await Promise.all((await resourceSources()).map((s) => searchSource(s, q)))).flat();
    const seen = new Set<string>();
    const items = [...live, ...local].filter((i) => {
      const k = i.url.replace(/\/$/, "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return json({ items: items.slice(0, 50) });
  } catch (e) {
    return serverError(e);
  }
}
