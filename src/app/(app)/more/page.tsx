"use client";

import Link from "next/link";
import { useActor } from "@/lib/actor-context";
import { visibleNavItems } from "@/lib/nav-items";
import { Icon } from "@/components/ui";
import { useNavBadges } from "@/components/features/nav-badges";

/**
 * Eight places, the same for everyone. Smaller areas live inside one of
 * these: reading groups and the programme in Education,
 * availability and notifications in Settings, spots in Paper sales, feedback
 * in the header.
 */
const TILES = ["/agenda", "/education", "/tasks", "/follow-ups", "/materials", "/paper-sales", "/finance", "/resources"];
/** Officers' tools, as a plain list under the tiles. */
const OFFICER = ["/social-media", "/people", "/admin/members", "/import", "/imports", "/locations"];

/** Everything outside the weekly loop, grouped by job. Officer tools only show to officers. */
export default function MorePage() {
  const actor = useActor();
  const badges = useNavBadges();
  const items = new Map<string, { label: string; icon: string }>(visibleNavItems(actor?.role, actor?.isAdmin, actor?.viewOnly).map((i) => [i.href, i]));
  const tiles = TILES.filter((h) => items.has(h));
  const officer = !!actor?.role.some((r) => r !== "member");
  const tools = officer ? OFFICER.filter((h) => items.has(h)) : [];

  return (
    <div className="screen pg">
      <div className="ph">
        <div>
          <h1>More</h1>
          <p className="sub">Everything else.</p>
        </div>
      </div>
      <div className="grid2">
        {tiles.map((href) => {
          const item = items.get(href)!;
          const badge = badges[href];
          return (
            <Link key={href} className="tile" href={href}>
              <Icon name={item.icon} className="text-[22px]" />
              <span>{item.label}</span>
              {!!badge && <span className="badge">{badge}</span>}
            </Link>
          );
        })}
      </div>
      <div className="list">
        <Link className="li li-link" href="/settings">
          <Icon name="settings" className="text-[20px]" />
          <span className="grow t">Profile &amp; settings</span>
          {!!badges["/settings"] && <span className="badge">{badges["/settings"]}</span>}
        </Link>
      </div>
      {tools.length > 0 && (
        <section>
          <h4 className="dayh">Officer tools</h4>
          <div className="list">
            {tools.map((href) => (
              <Link key={href} className="li li-link" href={href}>
                <span className="grow t">{items.get(href)!.label}</span>
                {!!badges[href] && <span className="badge">{badges[href]}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
