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
domains to exact canonical `mock` values, and supplies required inert Supabase
placeholders. The central resolver rejects mixed or non-canonical data modes,
unknown production profiles, real or missing Supabase coordinates, a missing
publishable placeholder, a browser-bundled secret key, or a missing production
profile. The four MCP HTTP routes are intentionally source-owned so their demo
guards cannot be regenerated away. The demo head omits third-party font requests.

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
worker credentials, or production domains. Remove any inherited server-only
Supabase/provider variables from this Preview scope. If both connected Vercel
projects remain active, configure both identically or designate one canonical
demo and disable the duplicate branch build.

## Acceptance

Require all of the following on the exact deployed commit:

1. normal live production build and the isolated demo build both pass;
2. Playwright serves the compiled demo with `vite preview`, not the development server;
3. unit, type, lint, database, anonymous, Atlas, and demo-containment checks pass;
4. the persistent bilingual demo notice is visible on every route and root error state;
5. synthetic match activity says “Simulation” / “محاكاة”, and rankings identify
   fictional managers;
6. `robots=noindex,nofollow,noarchive` is present;
7. no browser request reaches Supabase, SportsMonks, or the inert demo host;
8. Admin routes and server functions, OAuth consent, `/mcp`, MCP metadata, list,
   and invoke endpoints cannot execute in demo mode;
9. the Vercel deployment Git SHA equals the reviewed PR head.

Never promote this artifact, alias it to the production domain, enable schedules,
or describe it as a live-data launch.
