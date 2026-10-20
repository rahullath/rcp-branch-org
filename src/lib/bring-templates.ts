import type { EventType } from "./types";

/**
 * The usual things for each kind of event, so a lead adds them in one tap
 * instead of remembering on the day. Each one then needs someone to say
 * "I'll bring it" — and they get a reminder the day before.
 */
export const BRING_TEMPLATES: Partial<Record<EventType, string[]>> = {
  paper_sale: ["Papers", "Collection tin", "Card reader", "Contact sheet & pens", "Pamphlets"],
  uni_stall: ["Table", "Banner", "Papers", "Books & pamphlets", "Collection tin", "Card reader", "Contact sheet & pens", "Posters & tape"],
  mobilization: ["Banner", "Flags", "Megaphone", "Papers", "Collection tin", "Card reader", "Contact sheet & pens"],
  postering: ["Posters", "Wallpaper paste", "Brushes & bucket", "Tape"],
  phonebank: ["Call list", "Script / what to say", "Phone chargers"],
  open_meeting: ["Papers", "Books & pamphlets", "Collection tin", "Card reader", "Contact sheet & pens", "Banner"],
  reading_group: ["Copies of the text"],
  branch: ["Papers to sell", "Copies of the reading"],
};
