/*
 * The party's main outlets — the Resources hero. `feed` is read for "Latest"
 * (RSS/Atom, or a news sitemap); `search` is queried live (WordPress search
 * API). An officer can override any of these in the app (resource_sources
 * table) — e.g. paste the podcast's RSS once it's known.
 */

export interface ResourceSource {
  key: string;
  label: string;
  blurb: string;
  url: string;
  feed?: string | null;
  /** A news sitemap (urls + dates, no titles) — used when there's no RSS. */
  sitemap?: string | null;
  /** WordPress REST search, {q} replaced. */
  search?: string | null;
  /** YouTube channel page — its feed is found from the channel id. */
  youtube?: string | null;
  /** Podcast names — each one's RSS is found in Apple's podcast directory. */
  podcasts?: string[] | null;
}

export const RESOURCE_SOURCES: ResourceSource[] = [
  {
    key: "communist-red",
    label: "communist.red",
    blurb: "The Communist — RCP news, analysis, the paper",
    url: "https://communist.red",
    feed: "https://communist.red/feed/",
    search: "https://communist.red/wp-json/wp/v2/search?search={q}&per_page=10&subtype=post",
  },
  {
    key: "marxist-com",
    label: "marxist.com",
    blurb: "In Defence of Marxism — the RCI internationally",
    url: "https://marxist.com",
    feed: "https://marxist.com/index.php?format=feed&type=rss",
    sitemap: "https://marxist.com/sitemap-news.htm?view=xml&id=1&format=xml",
  },
  {
    key: "youtube",
    label: "YouTube",
    blurb: "Talks, Against the Stream, World School",
    url: "https://www.youtube.com/@revolutionarycommunists",
    youtube: "https://www.youtube.com/@revolutionarycommunists",
  },
  {
    key: "podcasts",
    label: "Podcasts",
    blurb: "Marxist Voice, Against the Stream, Spectre of Communism",
    url: "https://marxist.com/against-the-stream.htm?types[0]=1",
    // Found automatically; an officer can paste a feed in Resources to override.
    feed: null,
    podcasts: ["Marxist Voice", "Against the Stream", "Spectre of Communism"],
  },
];

/** Prep, podcasts and writing for the paper — shown as a list under the hero. */
export const PREP_LINKS: { label: string; blurb: string; url: string }[] = [
  {
    label: "Lead-off prep seminars",
    blurb: "Leading comrades on philosophy, economics and the state, history, racism — 5 topics, more coming",
    url: "https://drive.google.com/drive/folders/1nmBjHKY0k_McLqR-eiJOEifbSBFcOgqH",
  },
  { label: "Against the Stream", blurb: "The RCI's podcast on marxist.com", url: "https://marxist.com/against-the-stream.htm?types[0]=1" },
  { label: "Spectre of Communism", blurb: "Podcast on marxist.com", url: "https://marxist.com/spectre-of-communism-podcast.htm" },
  { label: "Read The Communist", blurb: "The paper online", url: "https://communist.red/read/" },
  { label: "Write for The Communist", blurb: "Send a report or an article", url: "https://communist.red/write/" },
  {
    label: "How writing for the paper works",
    blurb: "Submissions, commissions and editorial decisions",
    url: "https://communist.red/writing-for-the-communist-submissions-commissions-and-editorial-decisions/",
  },
];

/** Smaller links under the hero. */
export const MORE_LINKS: { label: string; url: string }[] = [
  { label: "World School of Communism", url: "https://schoolofcommunism.com" },
  { label: "Wellred Books", url: "https://wellredbooks.co.uk" },
  { label: "Subscribe to the paper / IDOM", url: "https://communist.red/subscribe/" },
  { label: "Join the RCP", url: "https://communist.red/join-the-revolutionary-communist-party/" },
];
