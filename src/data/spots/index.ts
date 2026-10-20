import type { Location } from "@/lib/types";
import { birmingham } from "./birmingham";

/*
 * Spots a branch can add in one go, by district. A branch whose district has
 * a pack gets "Add N spots" on the Locations page and the pack's areas as
 * suggestions; everyone else builds their list as they go (any "where" field
 * can save a new spot). To add a city, copy birmingham.ts and list it below.
 */

export const LOCATION_TAGS = [
  "good footfall",
  "outdoor",
  "indoor",
  "students",
  "commuters",
  "needs booking",
  "free",
  "step-free",
  "door-knocking",
  "weekends",
  "weekdays",
  "evenings",
  "drinks",
] as const;

export type SuggestedLocation = Pick<Location, "name" | "category" | "area" | "description"> & { tags: string[] };

export interface StarterPack {
  district: string;
  /** Areas in the order a branch there would think of them. */
  areas: string[];
  /** Added to map searches for spots in the "Campus" area. */
  campus?: string;
  spots: SuggestedLocation[];
}

const PACKS: StarterPack[] = [birmingham];

export function packFor(district: string | null | undefined): StarterPack | null {
  const d = (district ?? "").trim().toLowerCase();
  return (d && PACKS.find((p) => d.includes(p.district.toLowerCase()))) || null;
}

/** Area suggestions: the district's pack, else the areas the branch already uses. */
export function areasFor(district: string | null | undefined, locations: Pick<Location, "area">[]): string[] {
  const pack = packFor(district);
  const used = [...new Set(locations.map((l) => l.area).filter((a): a is string => !!a))];
  return pack ? [...pack.areas, ...used.filter((a) => !pack.areas.includes(a))] : used.sort();
}

export function mapsUrl(l: Pick<Location, "name" | "area" | "lat" | "lng">, district: string | null | undefined): string {
  if (l.lat != null && l.lng != null) return `https://www.google.com/maps?q=${l.lat},${l.lng}`;
  const pack = packFor(district);
  const place = l.area === "Campus" && pack?.campus ? pack.campus : [l.area, district].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([l.name, place].filter(Boolean).join(", "))}`;
}
