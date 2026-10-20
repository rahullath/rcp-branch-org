# How it works

## Three parts

- **The phone.** An installable web app (no app store). Each screen asks the server for what it needs and keeps it until something changes.
- **The server.** Next.js on Vercel: pages, about 150 small API routes, and one scheduled job a day.
- **The database.** Supabase (Postgres with sign-in). Every branch's rows carry its `branch_id`, and the database's own rules decide who can read or change each row.

Without a database configured, the app runs in **demo mode** with a made-up branch kept in a local JSON file. That's how the public demo runs.

## What's stored, what's worked out, what's fixed

| Kind | Examples | Where |
| --- | --- | --- |
| Stored | Events, RSVPs, contacts, agenda items, tasks, materials, readings, reading groups, availability | Supabase tables |
| Worked out on each request | Inbox cards, best times for a sale, set-up checks, candidate records, "4 of 9 have done a reading" | `src/lib/inbox.ts`, `best-times.ts`, `setup.ts`, `candidates.ts` |
| Fixed in the code | Book and In Defence of Marxism titles, the curriculum, starter spots, invite wording, the import fields | `src/data/`, `src/lib/invite-brief.ts`, `src/lib/import-fields.json` |
| Read from outside | communist.red and marxist.com feeds, YouTube and Spotify titles, the party portal (optional, read only) | `src/lib/feeds.ts`, `link-title.ts`, `portal.ts` |

Nothing about an inbox card is saved except "dismissed". When the thing it asks about is done, the card is gone the next time anyone looks.

## The daily run

Once a day at 09:00 UTC, `/api/cron/reminders` works out who needs a push and sends each one at most once:

- events 36–60 hours away: people who haven't answered;
- the day before: bring-list gaps to people going; "you're bringing X" to whoever said so; one reading nudge to anyone who hasn't done one;
- the set-up card's push to each event's lead;
- 2–3 days before an open meeting, branch meeting or social: anyone with contacts nobody has invited;
- tentative events past their deadline and short of people: the lead;
- tasks due today;
- on Sundays, a summary for people who turned it on.

## How the parts link

- **Availability → Best times → Plan a sale.** Usual-week slots and away dates give the top three slots in the next fortnight; tapping one opens the event form filled in.
- **Spots ↔ every "where" field.** The event form, reading groups and paper sales share one list. A place typed into any of them can be saved as a spot there and then.
- **Agenda ↔ event ↔ readings.** A branch meeting's main discussion item is what its public link describes; its prep links and the event's readings are one list.
- **Event → public link → contact.** Each link is an unguessable token. The page reads that one event through a database function that returns its public fields and nothing else.
- **Minutes → tasks → inbox.** Pasted action points get an owner (on the app or not), a due date and a push on the day.
- **RSVPs, roles and tasks → candidate record.** Nothing extra to fill in.
- **Materials ↔ bring lists ↔ paper sales.** Papers taken to a sale show as out until the report says how many sold.

## Code map

```
src/app/(app)/        signed-in screens
src/app/api/          API routes, one folder per resource
src/app/s/[token]/    the public event page
src/app/guide/        this guide (renders docs/*.md)
src/lib/              data layer, inbox, push, imports, permissions
src/components/       shell, screens' shared pieces
src/data/             fixed lists: books, IDOM, curriculum, spots, resources
supabase/setup.sql    the whole database: tables, rules, functions
supabase/migrations/  changes for copies set up before them
```
