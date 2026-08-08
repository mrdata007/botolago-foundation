# Mock-data demo release

## Scope

This profile publishes a reviewable product demo, not the live service. Football,
news, notifications, authentication, Fantasy points, leagues, and rankings are
deterministic simulations stored in the browser. Provider ingestion, Supabase
writes, workers, Admin, OAuth consent, and MCP tools remain disabled.

The live release gates are unchanged. A demo does not clear provider readiness,
capacity/soak, migration parity, RLS, global-ranking, or invite-code blockers.

## Reproducible build

```bash
bun install --frozen-lockfile
bun run build:demo
bun run preview
```

The committed `.env.demo` selects `VITE_APP_MODE=demo`, sets all five browser
domains to `mock`, and uses inert Supabase placeholders. The central resolver
rejects mixed data modes, unknown production profiles, real Supabase coordinates,
or a missing production profile.

## Vercel preview configuration

Use a dedicated Preview environment scoped only to
`agent/launch-readiness-milestones`. Never edit Production values.

- `VITE_APP_MODE=demo`
- `VITE_AUTH_MODE=mock`
- `VITE_FOOTBALL_DATA_MODE=mock`
- `VITE_NEWS_DATA_MODE=mock`
- `VITE_NOTIFICATIONS_DATA_MODE=mock`
- `VITE_FANTASY_DATA_MODE=mock`
- `VITE_SUPABASE_PROJECT_ID=demo`
- `VITE_SUPABASE_URL=https://demo.invalid`
- `VITE_SUPABASE_PUBLISHABLE_KEY=demo-public-placeholder`
- `VITE_APP_URL=<the canonical branch preview URL>`

Do not add provider tokens, Supabase service-role/secret keys, ingestion secrets,
worker credentials, or production domains. If both connected Vercel projects
remain active, configure both identically or designate one canonical demo and
disable the duplicate branch build.

## Acceptance

Require all of the following on the exact deployed commit:

1. normal live production build and the isolated demo build both pass;
2. unit, type, lint, database, anonymous, Atlas, and demo-containment checks pass;
3. the persistent bilingual demo notice is visible on every route;
4. synthetic match activity says “Simulation” / “محاكاة”, and rankings identify
   fictional managers;
5. `robots=noindex,nofollow,noarchive` is present;
6. no browser request reaches Supabase, SportsMonks, or the inert demo host;
7. `/admin`, OAuth consent, `/mcp`, MCP metadata, list, and invoke endpoints
   cannot execute in demo mode;
8. the Vercel deployment Git SHA equals the reviewed PR head.

Never promote this artifact, alias it to the production domain, enable schedules,
or describe it as a live-data launch.
