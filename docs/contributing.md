# Changing the code

## Run it on your computer

```
npm install
npm run dev
```

Open http://localhost:3000 and pick someone on the sign-in screen. With no Supabase variables set, the app uses a made-up branch stored in `.next/cache/branch-app-dev-store/db.json`. Delete that file to start again.

To work against a real database, put the variables from [Run your own copy](/guide/run-your-own) in `.env.local`.

## Checks

```
npx tsc --noEmit   # types
npm run lint       # eslint, including the React Compiler rules
npm run build      # also fails if the import prompt lists a field the importer ignores
```

## How the code is laid out

- Every data function in `src/lib/data.ts` and `src/lib/data-v2.ts` works in both modes: Supabase when configured, the JSON file otherwise. Routes don't need to know which.
- Inbox cards are worked out in `src/lib/inbox.ts` from rows already loaded. To add one: a new `kind` in the `Ask` type (`src/lib/types.ts`), the rule in `deriveAsks`, and its card in `src/components/v2/ask-card.tsx`.
- Anything the AI import understands is listed once, in `src/lib/import-fields.json`. The prompt is written from it and `scripts/check-import.mjs` checks the importer reads every field.
- Database changes go in a new file under `supabase/migrations/`, and in `supabase/setup.sql` so new copies get them too.

## Writing for the app

Plain words, the way you'd say it to a comrade. No emoji. Placeholders use made-up names and the `07700 900xxx` numbers set aside for examples, never anyone real.
