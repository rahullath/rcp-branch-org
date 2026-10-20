import SLUGS from "@/data/wellred-slugs.json";

/*
 * Every book, pamphlet and IDOM we hold or want, linked to its page on
 * Wellred (the party's publisher). Product slugs come from Wellred's sitemap
 * (saved in src/data/wellred-slugs.json), so a new title in
 * stock links itself without anyone pasting URLs.
 */

const BASE = "https://wellredbooks.co.uk/product/";
const STOP = new Set(["the", "a", "an", "and", "of", "on", "to", "in", "vol", "volume", "new", "edition", "penguin", "pre", "order", "with", "its", "what", "how"]);
export const titleWords = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    // "Lenin's" / "lenins", "Revolutions" / "revolution" — compare stems.
    .map((w) => (w.length > 3 ? w.replace(/s$/, "") : w));

const INDEX = (SLUGS as string[]).map((slug) => ({ slug, words: new Set(titleWords(slug.replace(/-/g, " "))) }));
const cache = new Map<string, string | null>();

/** Wellred page for a title, or null when they don't sell it. */
export function wellredUrl(name: string): string | null {
  if (cache.has(name)) return cache.get(name)!;
  let found: string | null = null;
  // IDOM issues: "In Defence of Marxism #48", "IDOM 41", "IDOM 53 – Rojava".
  const issue = name.match(/(?:in defence of marxism|idom)\s*(?:issue\s*)?#?\s*(\d{1,3})\b/i);
  if (issue) {
    const n = issue[1];
    const re = new RegExp(`(?:^|-)(?:issue-${n}|idom-${n}|in-defence-of-marxism-${n})(?:-|$)`);
    found = INDEX.find((x) => re.test(x.slug) && !x.slug.startsWith("pre-order"))?.slug ?? INDEX.find((x) => re.test(x.slug))?.slug ?? null;
  } else {
    const want = titleWords(name.replace(/\(.*?\)/g, ""));
    if (want.length) {
      const hits = INDEX.filter((x) => want.every((w) => x.words.has(w)));
      const plainIdom = (s: string) => /^(idom|in-defence-of-marxism-(issue|\d))/.test(s) || s.includes("bundle");
      hits.sort((a, b) => Number(plainIdom(a.slug)) - Number(plainIdom(b.slug)) || a.words.size - b.words.size);
      const best = hits[0];
      // Close enough: the product isn't a much longer, different title.
      if (best && best.words.size - want.length <= 4) found = best.slug;
    }
  }
  const url = found ? BASE + found + "/" : null;
  cache.set(name, url);
  return url;
}

/**
 * One key per title, however it's written: "IDOM 48", "In Defence of Marxism
 * #48 – Science" and the Wellred title all match. Used to count what we
 * already have against what we want to order.
 */
export function titleKey(name: string): string {
  const issue = name.match(/(?:in defence of marxism|idom)\s*(?:issue\s*)?#?\s*(\d{1,3})\b/i);
  if (issue) return `idom-${issue[1]}`;
  return wellredUrl(name) ?? titleWords(name.replace(/\(.*?\)/g, "")).join(" ");
}
