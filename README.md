# Kitchen Designer

Automatic kitchen design planner.

Kitchen layout planning demo with catalogue-based cabinet placement, rule checks,
detailed and overview plans, zoom and fullscreen viewing, 3D models, pricing,
and saved layout versions.

## Run locally

Use Node.js 22 or newer. Saved designs and logins live in Supabase, so put the project's
settings in a local `.env` (never committed):

```sh
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
```

```sh
npm start
```

Open [http://localhost:5055](http://localhost:5055) and sign in.

For automatic server restart during development:

```sh
npm run dev
```

The main application uses Node.js built-ins and the included vendor code and assets.
The optional verification rendering tools have their own dependencies.

## Tests

```sh
npm test
```

Keep the `verification/` fixtures: several automated tests read them.

## Project files

- `ui/`: designer interface, plan viewers, assets and cabinet models.
- `core/engine.mjs`, `core/planner.mjs`, `core/fitting.mjs`: placement and layout planning.
- `server.mjs`: local HTTP server and engine adapter.
- `rules.json`, `cabinets.csv`, `data/`: rules, catalogue and pricing data.
- `vendor/`: supporting application modules and design storage.
- `supabase/schema.sql`: database tables, row-level security and image storage (run once in the Supabase SQL Editor).
- `scripts/build-vercel.mjs`, `api/index.mjs`, `vercel.json`: Vercel deployment.
- `test/`, `verification/`: regression tests, fixtures and verification scripts.

## Accounts and data

Login is invite-only (Supabase Auth, public sign-up off). Invite people from the Supabase
dashboard: Authentication -> Users -> Add user -> Send invitation. Everyone invited is a
designer; `info@mymagppie.com` is the admin (set in `supabase/schema.sql`).

- A designer sees and edits only their own projects, rooms and revisions.
- The admin sees every designer's projects and revision counts, view-only.
- Client share links open without signing in.

Row-level security in the database enforces this, not only the app. Snapshot and AI-render
images are stored in the `design-images` Storage bucket; the saved design keeps their links.

## Deploy (Vercel)

`vercel.json` builds the static site into `public/` (UI, 3D models, accessory photos) and
routes `/api/*` to one function (`api/index.mjs`) running the same handler as `server.mjs`.
Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY`
in the Vercel project's environment variables.
