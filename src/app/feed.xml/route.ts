import { ALL_RESOURCES } from "@/data/resources";
import { APP_NAME } from "@/lib/config";

export const dynamic = "force-static";

function xmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/**
 * Public, unauthenticated (see the PUBLIC_PATHS allowlist in src/proxy.ts)
 * — everything here is a link to already-public political education
 * content (communist.red, marxist.com, YouTube), nothing member-specific.
 * No per-resource "date added" is tracked anywhere in the source data, so
 * this can't produce real per-item pubDates — it reflects "what's
 * currently in the library," and a subscriber sees genuinely new entries
 * whenever the underlying resources.ts changes and redeploys.
 */
export async function GET() {
  const buildDate = new Date().toUTCString();
  const items = ALL_RESOURCES.map(
    (r) => `
    <item>
      <title>${xmlEscape(r.title)}</title>
      <link>${xmlEscape(r.url)}</link>
      <guid isPermaLink="true">${xmlEscape(r.url)}</guid>
      ${r.source ? `<source>${xmlEscape(r.source)}</source>` : ""}
      <category>${xmlEscape(r.kind)}</category>
    </item>`,
  ).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(APP_NAME)} — Resource Library</title>
    <link>https://communist.red</link>
    <description>Reading, listening, and prep links the branch keeps on file.</description>
    <lastBuildDate>${buildDate}</lastBuildDate>${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
