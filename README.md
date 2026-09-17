# Kitchen Designer

Kitchen layout planning demo with catalogue-based cabinet placement, rule checks,
detailed and overview plans, zoom and fullscreen viewing, 3D models, pricing,
and saved layout versions.

## Run locally

Use Node.js 22.13 or newer with built-in `node:sqlite` support.

```sh
npm start
```

Open <http://localhost:5055/builder.html>.

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
- `engine.mjs`, `planner.mjs`, `fitting.mjs`: placement and layout planning.
- `server.mjs`: local HTTP server and engine adapter.
- `rules.json`, `cabinets.csv`, `data/`: rules, catalogue and pricing data.
- `vendor/`: supporting application modules and design storage.
- `db/migrations/`: database schema migrations.
- `test/`, `verification/`: regression tests, fixtures and verification scripts.
- `AI-PLANNER.md`: optional AI configuration and behavior.

Saved projects and layout versions live in the local `db/design.sqlite` database,
which is created automatically. Set `DESIGN_DB` to use a different database path.
Local databases, credentials, dependencies, logs and backup folders are excluded
from Git. Back up the design database separately to preserve existing projects.
