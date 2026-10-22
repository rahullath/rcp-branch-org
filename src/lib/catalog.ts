import SLUGS from "@/data/wellred-slugs.json";
import { titleKey } from "./wellred";

/*
 * What a comrade might look for in Materials that the branch may not hold:
 * everything Wellred sells (from its sitemap) and the usual stall gear.
 * Search matches "IDOM 48" to "In Defence of Marxism #48" and the like.
 */

const GEAR = [
  "Flags",
  "Collection tin",
  "Megaphone",
  "Banner",
  "Card reader",
  "Table",
  "Gazebo",
  "Clipboards",
  "Pens",
  "Contact sheets",
  "Posters",
  "RCS stickers",
  "Tape",
  "Leaflets",
  "Wallpaper paste & brushes",
  "Speaker",
  "Extension lead",
];

const SMALL = new Set(["a", "an", "and", "the", "of", "on", "in", "to", "for", "vs", "with", "from", "at", "by", "or"]);

/** "a-marxist-introduction-to-history" → "A Marxist Introduction to History"; "idom-52" → "In Defence of Marxism #52". */
function humanise(slug: string): string {
  const idom = slug.match(/^idom-(\d+)(?:-(.*))?$/);
  if (idom) return `In Defence of Marxism #${idom[1]}${idom[2] ? ` – ${humanise(idom[2])}` : ""}`;
  return slug
    .split("-")
    .map((w, i) => (w === "idom" ? "IDOM" : i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Wellred titles, minus pre-orders and internal listings. */
const WELLRED_TITLES: string[] = (SLUGS as string[])
  .filter((s) => !s.startsWith("pre-order") && !/internal|test|gift-card/.test(s))
  .map(humanise);

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/#/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Everything a name can be searched by: its words, plus "idom" / "in defence of marxism" either way round. */
function searchWords(name: string) {
  const w = words(name);
  const key = titleKey(name);
  const issue = key.match(/^idom-(\d+)$/)?.[1];
  if (issue || /in defence of marxism/i.test(name)) w.push("idom", "in", "defence", "of", "marxism");
  if (issue) w.push(issue);
  if (/\bidom\b/i.test(name)) w.push("in", "defence", "of", "marxism");
  return w;
}

/** Every word typed starts some word of the name (so "manif" finds the Manifesto, "idom 48" finds IDOM #48). */
export function matches(query: string, name: string) {
  const q = words(query);
  if (!q.length) return true;
  const have = searchWords(name);
  return q.every((t) => have.some((h) => h.startsWith(t)));
}

/** Catalogue entries matching a search that the branch doesn't already list. */
export function catalogueHits(query: string, existing: string[], limit = 6) {
  if (words(query).join("").length < 3) return [];
  const known = new Set(existing.map((n) => titleKey(n)));
  const out: { name: string; kind: "gear" | "book" }[] = [];
  for (const g of GEAR) if (matches(query, g) && !known.has(titleKey(g))) out.push({ name: g, kind: "gear" });
  for (const t of WELLRED_TITLES) {
    if (out.length >= limit) break;
    if (matches(query, t) && !known.has(titleKey(t))) out.push({ name: t, kind: "book" });
  }
  return out.slice(0, limit);
}
