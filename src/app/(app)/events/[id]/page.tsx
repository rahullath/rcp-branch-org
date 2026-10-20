import { redirect } from "next/navigation";
import Link from "next/link";
import { canSeeCommittee, getActor } from "@/lib/auth";
import { getEventFor, listAgenda, listAgendaContributions, listProfiles } from "@/lib/data";
import { sanitizeProfilesFor } from "@/lib/profile-visibility";
import { Button, Card, EmptyState, Icon } from "@/components/ui";
import { EventDetailClient } from "./event-detail-client";

type Params = { params: Promise<{ id: string }> };

/**
 * An event inside the app, for members only (attendee lists and the
 * agenda are not public; the public version is /s/[token]). `src/proxy.ts` already redirects any
 * signed-out request to `/login` before this ever runs — the `getActor()`
 * call here is for the actor object itself (needed for
 * `sanitizeProfilesFor`), and the redirect is just a cheap belt-and-braces
 * fallback rather than the actual enforcement.
 */
export default async function EventDetailPage({ params }: Params) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const { id } = await params;
  const event = await getEventFor(id, actor.id, canSeeCommittee(actor));

  if (!event || event.archived) {
    return (
      <div className="space-y-6">
        <Card>
          <EmptyState
            icon="event"
            title="Event not found"
            hint="It may have been removed or archived."
            action={
              <Link href="/events">
                <Button variant="outline"><Icon name="chevron_right" /> Back to events</Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const [rawProfiles, allAgendaItems, allContributions] = await Promise.all([
    listProfiles(),
    listAgenda(),
    listAgendaContributions(),
  ]);
  const profiles = sanitizeProfilesFor(rawProfiles, actor);
  const agendaItems = allAgendaItems.filter((i) => i.event_id === event.id);
  const agendaItemIds = new Set(agendaItems.map((i) => i.id));
  const contributions = allContributions.filter((c) => agendaItemIds.has(c.agenda_item_id));

  return (
    <EventDetailClient
      event={event}
      profiles={profiles}
      agendaItems={agendaItems}
      contributions={contributions}
    />
  );
}
