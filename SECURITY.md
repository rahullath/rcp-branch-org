# Security

## Reporting a problem

Please do not open a public issue for a security problem. Use GitHub's private
reporting: the **Security** tab of this repository, then **Report a vulnerability**.
Say what you found, how to reproduce it, and which copy of the app it affects.

You will get a reply within a few days. Fixes go out as soon as they are ready and
you will be told when they have.

## What the app protects

Each branch's data is separated in the database by row-level security rules, not
only in the application. Contacts are private to the person who added them. View-only
accounts are refused writes by the database itself. See `docs/privacy.md` for what is
stored and who can see it.

## For people running a copy

- Keep `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY` and `CRON_SECRET` out of the
  repository and out of any client-side variable. Only `NEXT_PUBLIC_*` values are sent
  to the browser.
- A copy with no database configured runs as an open demo. In production this is
  refused unless `ALLOW_DEMO=1` is set, so a missing variable cannot expose a demo
  where a real branch was meant to be.
- Apply every file in `supabase/migrations/` that your database has not had.
- Keep dependencies current; the repository's CI and Dependabot are set up for this.
