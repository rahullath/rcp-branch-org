import type { Role } from "./types";

/** Shared navigation manifest, imported by both the server shell and client nav. */
const navItems = [
  { href: "/home", label: "This Week", icon: "home" },
  { href: "/events", label: "Events", icon: "event" },
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/contacts", label: "Contacts", icon: "groups", private: true },
  { href: "/tasks", label: "Tasks", icon: "task_alt" },
  { href: "/follow-ups", label: "Follow-ups", icon: "person_search", private: true },
  { href: "/agenda", label: "Agenda", icon: "event_note" },
  { href: "/availability", label: "Availability", icon: "calendar_today", private: true },
  { href: "/paper-sales", label: "Paper Sales", icon: "newspaper" },
  { href: "/education", label: "Education", icon: "school" },
  { href: "/reading-groups", label: "Reading Groups", icon: "diversity_3" },
  { href: "/programme", label: "Branch Programme", icon: "menu_book" },
  { href: "/resources", label: "Resources", icon: "auto_stories" },
  { href: "/social-media", label: "Social", icon: "campaign" },
  { href: "/materials", label: "Materials", icon: "inventory_2" },
  { href: "/locations", label: "Locations", icon: "location_on" },
  { href: "/finance", label: "Finance", icon: "account_balance", private: true },
  { href: "/import", label: "Import", icon: "upload", private: true },
  { href: "/feedback", label: "Feedback", icon: "feedback", private: true },
  // Officer tools — hidden from plain members so the menu stays short.
  { href: "/people", label: "People", icon: "badge", roles: ["general_secretary", "organizer", "finance_officer", "education_officer", "social_media_officer"] },
  { href: "/imports", label: "Import reviews", icon: "download", adminOnly: true },
  { href: "/admin/members", label: "Members", icon: "badge", roles: ["general_secretary"] },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const satisfies readonly NavItem[];

/** `private`: hidden from view-only accounts (the database hides the rows too). */
type NavItem = { href: string; label: string; icon: string; roles?: readonly Role[]; adminOnly?: boolean; private?: boolean };

/** Items this person should see — role-gated ones only if they hold one of the roles. */
export function visibleNavItems(roles: readonly Role[] | undefined, isAdmin = false, viewOnly = false): NavItem[] {
  return (navItems as readonly NavItem[]).filter((i) => !(viewOnly && i.private) && (i.adminOnly ? isAdmin : !i.roles || i.roles.some((r) => roles?.includes(r))));
}
