# Branch Organizer

A phone app for running a communist branch's week: events, readings, invites to contacts, paper sales, materials, tasks and follow-ups. Everything that needs doing lands in one inbox and goes away once it's done.

- **See it:** the demo runs with a made-up branch, no sign-in needed.
- **Use it:** start a branch on a copy someone already runs, or run your own on free plans in about 15 minutes.

The guide is in [`docs/`](docs/) and is served by the app itself at `/guide`:

- [Overview](docs/index.md)
- [Start your branch](docs/start-a-branch.md)
- [For officers](docs/officers.md)
- [Privacy and data](docs/privacy.md)
- [How it works](docs/how-it-works.md)
- [Run your own copy](docs/run-your-own.md)
- [Changing the code](docs/contributing.md)

## Quick start

```
npm install
npm run dev
```

Open http://localhost:3000. With no database configured the app runs in demo mode; pick someone on the sign-in screen.

## Stack

Next.js (App Router) and React on Vercel, Supabase (Postgres, sign-in, row-level security), web push. No other services.

## Principle

The app should take logistics off people, not add logging. If a field exists only to monitor comrades rather than help them, it goes.
