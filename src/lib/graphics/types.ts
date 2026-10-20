export type GraphicSizeId = "post" | "story" | "banner";

export const GRAPHIC_SIZES: Record<GraphicSizeId, { label: string; w: number; h: number }> = {
  post: { label: "Post (1080×1080)", w: 1080, h: 1080 },
  story: { label: "Story (1080×1920)", w: 1080, h: 1920 },
  banner: { label: "Banner (1200×600)", w: 1200, h: 600 },
};

export type TemplateId = "event_flyer" | "paper_promo" | "reading_group" | "lead_quote";

export const TEMPLATE_META: Record<TemplateId, { label: string; icon: string }> = {
  event_flyer: { label: "Event flyer", icon: "campaign" },
  paper_promo: { label: "Paper promo", icon: "newspaper" },
  reading_group: { label: "Reading-group card", icon: "menu_book" },
  lead_quote: { label: "Lead / quote card", icon: "sparkles" },
};

export interface EventFlyerFields {
  title: string;
  dateLine: string;
  location: string;
}

export interface PaperPromoFields {
  headline: string;
  bullets: string[];
}

export interface ReadingGroupFields {
  seriesName: string;
  sessionLabel: string;
  topic: string;
  readingLink?: string;
}

export interface LeadQuoteFields {
  quote: string;
  attribution?: string;
}

export type TemplateFields =
  | { templateId: "event_flyer"; fields: EventFlyerFields }
  | { templateId: "paper_promo"; fields: PaperPromoFields }
  | { templateId: "reading_group"; fields: ReadingGroupFields }
  | { templateId: "lead_quote"; fields: LeadQuoteFields };

export function emptyFieldsFor(templateId: TemplateId): TemplateFields {
  switch (templateId) {
    case "event_flyer":
      return { templateId, fields: { title: "", dateLine: "", location: "" } };
    case "paper_promo":
      return { templateId, fields: { headline: "", bullets: [] } };
    case "reading_group":
      return { templateId, fields: { seriesName: "", sessionLabel: "", topic: "", readingLink: "" } };
    case "lead_quote":
      return { templateId, fields: { quote: "", attribution: "" } };
  }
}
