// Contact labels are logistics tags (how to follow up), not inferred
// political/personal interests — the latter needs its own consent record
// per the branch's GDPR lawful-basis decision, and a free-text field makes
// that unenforceable. Keep this list to actionability, not demographics.
export const CONTACT_LABELS = [
  { value: "priority", label: "Priority follow-up" },
  { value: "repeat_contact", label: "Repeat contact" },
  { value: "wants_callback", label: "Wants a callback" },
  { value: "brought_someone", label: "Brought someone along" },
] as const;

export type ContactLabelValue = (typeof CONTACT_LABELS)[number]["value"];

export const CONTACT_LABEL_VALUES: string[] = CONTACT_LABELS.map((l) => l.value);

export function contactLabelText(value: string): string {
  return CONTACT_LABELS.find((l) => l.value === value)?.label ?? value;
}
