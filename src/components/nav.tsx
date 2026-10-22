"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/utils";
import { visibleNavItems } from "@/lib/nav-items";
import type { Role } from "@/lib/types";
import { useInbox } from "@/components/features/use-inbox";

/** The weekly loop gets the tab bar; everything else lives on the More page. */
const PRIMARY: { href: string; label: string; icon: string }[] = [
  { href: "/home", label: "Week", icon: "home" },
  { href: "/events", label: "Events", icon: "calendar_today" },
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/contacts", label: "Contacts", icon: "groups" },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Open asks for the signed-in comrade — the Inbox badge. */
function useInboxCount() {
  const { data } = useInbox();
  return data?.asks.length ?? 0;
}

export function SideNav({ badges, roles, isAdmin, viewOnly }: { badges?: Record<string, number>; roles?: Role[]; isAdmin?: boolean; viewOnly?: boolean }) {
  const isActive = useIsActive();
  const navItems = visibleNavItems(roles, isAdmin, viewOnly);
  const inbox = useInboxCount();
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
      {navItems.map((item) => {
        const active = isActive(item.href);
        const badge = item.href === "/inbox" ? inbox : badges?.[item.href];
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-none px-3 py-2.5 font-label-md text-sm font-semibold uppercase tracking-wide transition-colors",
              active
                ? "bg-primary text-on-primary"
                : "text-secondary hover:bg-surface-variant hover:text-on-surface",
            )}
          >
            <Icon name={item.icon} className="text-xl" />
            <span className="truncate flex-1">{item.label}</span>
            {!!badge && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-none bg-error px-1 text-[10px] font-bold text-on-error">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ badges, viewOnly }: { badges?: Record<string, number>; roles?: Role[]; viewOnly?: boolean }) {
  const isActive = useIsActive();
  const tabs = viewOnly ? PRIMARY.filter((i) => i.href !== "/contacts") : PRIMARY;
  const inbox = useInboxCount();
  const onMore = !tabs.some((i) => isActive(i.href));
  const moreHasBadge = Object.keys(badges ?? {}).length > 0;

  return (
    <nav className={cn("fixed inset-x-0 bottom-0 z-50 grid items-stretch border-t border-paper-shadow bg-surface-container-lowest pb-[env(safe-area-inset-bottom)] lg:hidden", viewOnly ? "grid-cols-4" : "grid-cols-5")}>
      {tabs.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-col items-center justify-center gap-[3px] pt-[9px] pb-[7px] transition-colors",
              active ? "bg-primary text-on-primary" : "text-secondary active:bg-surface-variant",
            )}
          >
            <Icon name={item.icon} className="text-xl" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em]">{item.label}</span>
            {item.href === "/inbox" && inbox > 0 && (
              <span
                className={cn(
                  "absolute right-[calc(50%-20px)] top-1 flex h-4 min-w-4 items-center justify-center px-[3px] text-[10px] font-bold",
                  active ? "bg-on-primary text-primary" : "bg-primary text-on-primary",
                )}
              >
                {inbox}
              </span>
            )}
          </Link>
        );
      })}
      <Link
        href="/more"
        aria-current={onMore ? "page" : undefined}
        className={cn(
          "relative flex flex-col items-center justify-center gap-[3px] pt-[9px] pb-[7px] transition-colors",
          onMore ? "bg-primary text-on-primary" : "text-secondary active:bg-surface-variant",
        )}
      >
        <Icon name="menu" className="text-xl" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em]">More</span>
        {!onMore && moreHasBadge && <span className="absolute right-[calc(50%-16px)] top-1.5 h-2 w-2 bg-primary" />}
      </Link>
    </nav>
  );
}
