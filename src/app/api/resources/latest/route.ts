import { json, serverError, withActor } from "@/lib/api";
import { latestFrom, type FeedItem } from "@/lib/feeds";
import { resourceSources } from "@/lib/resource-sources";

export const dynamic = "force-dynamic";

/** What the party just published — articles, videos, podcasts — newest first. */
export async function GET() {
  const { error } = await withActor();
  if (error) return error;
  try {
    const sources = await resourceSources();
    const lists = await Promise.all(sources.map(async (s) => ({ key: s.key, items: (await latestFrom(s)).slice(0, 12) })));
    const all: FeedItem[] = lists.flatMap((l) => l.items);
    all.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return json({ items: all.slice(0, 40), sources: lists.map((l) => ({ key: l.key, count: l.items.length })) });
  } catch (e) {
    return serverError(e);
  }
}
