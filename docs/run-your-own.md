# Run your own copy

About 15 minutes, on free plans. You need a GitHub account, a [Supabase](https://supabase.com) account and a [Vercel](https://vercel.com) account.

## 1. Database

1. In Supabase, create a project (pick the region nearest you).
2. Open **SQL Editor**, paste the whole of `supabase/setup.sql` from the repository, and run it.
3. **Authentication → URL Configuration**: set Site URL to the address your app will have (e.g. `https://branch.example.org`) and add `https://branch.example.org/auth/callback` under Redirect URLs.
4. **Project Settings → API**: keep the project URL, the `anon` key and the `service_role` key for step 3.

Supabase's own email sender only manages a few sign-in emails an hour. For more than a handful of people, add an SMTP sender under **Authentication → Emails → SMTP**. [Resend](https://resend.com)'s free plan (100 a day) is enough for a branch.

## 2. Push keys

On any computer with Node installed:

```
npx web-push generate-vapid-keys
```

Keep both keys. Make up a long random string for `CRON_SECRET`.

## 3. The app

1. Fork the repository on GitHub.
2. In Vercel, **Add New → Project**, pick your fork.
3. Add these environment variables:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (server only) |
| `NEXT_PUBLIC_SITE_URL` | The app's address, e.g. `https://branch.example.org` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public push key |
| `VAPID_PRIVATE_KEY` | Private push key |
| `VAPID_SUBJECT` | `mailto:` and an address people can reach |
| `CRON_SECRET` | The random string |

4. Deploy. Add your domain under **Settings → Domains** if you have one.

## 4. First sign-in

Open the app, sign in, and start your branch. The first branch on a new copy is approved straight away, and whoever starts it becomes the copy's **admin**: they approve any further branches (Settings → Admin) and can work in any of them.

## Keeping it up to date

Pull changes from the main repository into your fork; Vercel redeploys on its own. If a change adds a file under `supabase/migrations/`, run that file in the SQL Editor once. `setup.sql` always holds the full current database, so new copies only ever need that.

## Optional

- **Landing page and codes**: the front page offers "Try the demo", a box for the code someone sent you (a branch's join code or its view-only code; the general secretary makes these in Settings), and sign-in. A demo-only copy (no Supabase variables) sets `NEXT_PUBLIC_LIVE_URL` to the real copy's address so the code box sends people there; a real copy can set `NEXT_PUBLIC_DEMO_URL` to show a demo button.

- **Party portal** (read only): `PORTAL_API_URL`, `PORTAL_API_KEY`, `PORTAL_BRANCH_ID`, `PORTAL_APP_BRANCH`. Shows members on the portal who aren't on the app yet. The app never writes to the portal.
- **Reminders twice a day**: Vercel's free plan runs the reminder job once a day. Any outside scheduler (a GitHub Action, for example) can call `GET /api/cron/reminders` with the header `Authorization: Bearer <CRON_SECRET>` as often as you like; each reminder still goes out only once.

## What it costs

Nothing on free plans for one branch or a handful. Measured on a real branch after ten weeks (11 members, 32 events): 4.6 MB of data. Supabase's free plan holds 500 MB. Past about 20 branches on one copy, either pay for that copy or split by district so each runs its own.
