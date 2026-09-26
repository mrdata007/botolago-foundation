# Pépites — local preview

Pépites is off in every build (`PEPITES_ENABLED`, `src/lib/feature-flags.ts`)
and its database mode ships `off`. The pages open only on a development
server started with the preview switch. Two ways to look at it:

## 1. Sample data (no database)

```sh
VITE_PEPITES_PREVIEW=1 bun run dev -- --host 127.0.0.1 --port 4173
```

Then open `http://127.0.0.1:4173/pepites`. The data is the sample set in
`src/backend/pepites/mock-repository.ts`: fictional players ("Joueur
exemple"), real club names, weeks 14 to 16. The browser tests use it
(`tests/e2e/pepites.e2e.ts`, also in CI) and drive the reveal from the
browser console:

```js
window.__pepitesMock = {
  state: "countdown",
  nextRevealAt: new Date(Date.now() + 60_000).toISOString(),
};
window.__pepitesMock = { state: "delayed" }; // the time passed, nothing published
window.__pepitesMock = { publishNext: true }; // week 16 is published
```

(Development builds only; production ignores both globals.)

## 2. The real engine on a local database

Needs the local Supabase stack (`supabase start`). Everything below writes
to that **local** database only; the one-writer rule applies (AGENTS.md).

```sh
supabase db reset --local
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres \
  -v ON_ERROR_STOP=1 -f scripts/backend/pepites-local-preview-seed.sql
SUPABASE_URL=http://127.0.0.1:55321 SUPABASE_SERVICE_ROLE_KEY=<local service key> \
DATABASE_URL=<local database URL from supabase status> \
  bun scripts/backend/pepites-local-preview-photos.ts
```

- The seed refuses any database whose football catalog is not empty. It
  makes the 16 clubs (with their Arabic names), 18 **fictional** players
  each, six finished rounds, then runs the ranking engine as of rounds 3 to 6. Weeks 4 to 6 are published through the editions functions; week 7 is a
  draft. Mode `public`, automatic publication off.
- The photos script puts two synthetic pictures (no real person) through the
  real pipeline: private intake, release, approval, the photo job's 512 px
  WebP. The leader's release allows share images; the fourth player's is
  in-app only. Everyone else keeps the silhouette.
- Two local accounts, password `pepites-preview`: `fan@pepites.local`, and
  `staff@pepites.local` (platform administrator, TOTP secret
  `JBSWY3DPEHPK3PXP`).

Start the server on that database (the values come from `supabase status`;
keep them out of the repository, for example in an untracked `.env.local`):

```sh
VITE_PEPITES_PREVIEW=1 VITE_PEPITES_DATA_MODE=supabase VITE_AUTH_MODE=supabase \
VITE_SUPABASE_URL=http://127.0.0.1:55321 VITE_SUPABASE_PUBLISHABLE_KEY=<local publishable key> \
SUPABASE_URL=http://127.0.0.1:55321 SUPABASE_PUBLISHABLE_KEY=<local publishable key> \
  bun run dev -- --host 127.0.0.1 --port 4174
```

Two local limits, neither of them in production:

- **Image resizing.** The local stack is usually started without Supabase's
  image service, so the resized photo URLs fail and the page falls back to
  the silhouette. The screenshots and the local-stack browser test serve the
  original file in their place.
- **The second factor.** `supabase/config.toml` has TOTP verification off
  locally. To sign in as the staff account, turn `[auth.mfa.totp]` on in
  your working copy, restart the stack, and put the file back.
