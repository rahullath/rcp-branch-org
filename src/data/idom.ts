/**
 * In Defence of Marxism issues, for picking one issue as a reading group's
 * text. Titles only where we know them (from the branch's own stock and
 * orders); the rest read "In Defence of Marxism #N" and can be typed over.
 */
const TITLES: Record<number, string> = {
  41: "The Fall of Woman",
  46: "Art",
  47: "The Struggle for World Revolution",
  48: "Science",
  50: "Reform or Revolution",
  51: "The Permanent Revolution",
  52: "Socialism or Barbarism",
  54: "The Rojava Revolution",
};

const LATEST_IDOM = 55;

const idomTitle = (n: number) => `In Defence of Marxism #${n}${TITLES[n] ? `: ${TITLES[n]}` : ""}`;

/** Newest first: the ones people are most likely to read. */
export const IDOM_ISSUES = Array.from({ length: LATEST_IDOM }, (_, i) => idomTitle(LATEST_IDOM - i));
