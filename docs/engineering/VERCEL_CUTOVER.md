# Moving botolago.com from Lovable hosting to Vercel

> **Status: fallback, not the plan of record.** The owner chose to upgrade the
> Lovable plan instead, which drops the badge at source in minutes and changes
> nothing else. Keep this document: it is the escape route if the plan lapses,
> if Lovable hosting becomes unsuitable, or if a second host is ever wanted for
> resilience. Everything measured below was measured, and stays true.

Why: the "Made with Lovable" badge is injected by Lovable's hosting, not by this
repository — it is an `<aside id="lovable-badge">` appended before `</body>`,
with its own inline `<style>` and `<script>`. Nothing in `src/` produces it, so
any other host simply does not serve it. Removing it by changing host is using a
different service; hiding it with CSS while staying on the free plan is not, and
is why that option was refused.

Lovable keeps syncing from GitHub either way. You carry on editing in Lovable —
you only stop _serving_ from it.

## Current state, measured

`botolago-foundation.vercel.app` is already live from this repo and already
serves the current build (it had `MatchCard-CbpLzh5e.js`, today's fix, within
minutes of the merge). SSR works. There is no badge.

It is **not usable yet**, because the Vercel project has none of the `VITE_`
variables:

|                                | botolago.com (Lovable) | botolago-foundation.vercel.app |
| ------------------------------ | ---------------------- | ------------------------------ |
| Match links on `/matches`      | 8                      | **0**                          |
| Rendered body text             | 1091 chars             | 317                            |
| Supabase requests              | 19, all 2xx            | **0**                          |
| Supabase project ref in bundle | present                | **absent**                     |

Zero Supabase requests is not a network problem. `selectAuthMode` and
`selectFootballDataMode` **throw** in a production build unless the mode is
explicitly `supabase` (`src/services/auth.ts`, `src/services/football.ts`), so
with no configuration the data layer refuses to start and only the shell renders.
Cutting DNS over in this state would publish a site with no content.

## 1. Set the environment variables in Vercel

Project **botolago-foundation** → Settings → Environment Variables. Apply to
**Production, Preview and Development** — previews are useless without them.

| Variable                        | Value                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `VITE_AUTH_MODE`                | `supabase`                                                                                 |
| `VITE_FOOTBALL_DATA_MODE`       | `supabase`                                                                                 |
| `VITE_NEWS_DATA_MODE`           | `supabase`                                                                                 |
| `VITE_NOTIFICATIONS_DATA_MODE`  | `supabase`                                                                                 |
| `VITE_FANTASY_DATA_MODE`        | `supabase`                                                                                 |
| `VITE_SUPABASE_PROJECT_ID`      | `tkewgajrljbwgwedqsxn`                                                                     |
| `VITE_SUPABASE_URL`             | `https://tkewgajrljbwgwedqsxn.supabase.co`                                                 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | copy from `.env.production` or the Supabase dashboard (46 chars, starts `sb_publishable_`) |
| `VITE_APP_URL`                  | `https://botolago.com` — optional; nothing in `src/` reads it today, set it for parity     |

Two things that are deliberately **not** on this list:

- **No `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`.** The Admin gate reads the
  build-time values first and only falls back to `process.env`
  (`src/backend/admin/route-access.server.ts`), so the `VITE_` pair covers
  `/admin` as well.
- **No `SUPABASE_SERVICE_ROLE_KEY`.** The only service-role consumers are the
  news-ingestion and notification worker gateways, and no route or `src/start.ts`
  imports them — only tests do. The key bypasses RLS, so keep it off the web
  host.

These are build-time values baked into the client bundle, so **redeploy after
setting them**. Editing a variable does not rebuild anything on its own.

## 2. Allow the Vercel origin in Supabase Auth

Before testing sign-in on the `.vercel.app` domain, add it to
Authentication → URL Configuration → Redirect URLs:

```
https://botolago-foundation.vercel.app/**
```

Leave **Site URL** as `https://botolago.com`. After cutover the domain is
unchanged, so nothing else about auth configuration moves.

## 3. Verify on the Vercel URL, before touching DNS

Each of these failed or was empty in the unconfigured state, so each is a real
signal rather than a formality:

- [ ] `/matches` renders 8 match links and 19-ish Supabase requests, all 2xx
- [ ] `/fantasy/rankings` loads for a signed-out visitor (no 401, no 12s hang)
- [ ] An article page carries one real `<script type="application/ld+json">`
- [ ] Sign in with a real account, then `/admin` renders for the owner and is
      refused for a non-staff account
- [ ] Match cards at 390px measure `L12 R378 W366` with nothing clipped, FR and AR
- [ ] No `lovable-badge` element anywhere

## 4. Cut the domain over

`botolago.com` currently resolves through Cloudflare in front of Lovable.

1. Add `botolago.com` (and `www`) as a domain on the Vercel project.
2. Point DNS at Vercel as its dashboard instructs. If Cloudflare stays in front,
   set those records to **DNS only** (grey cloud) while validating, so you are
   debugging one proxy and not two.
3. Wait for the certificate to issue before announcing anything.
4. Re-run the whole of §3 against `https://botolago.com`.

## 5. Rollback

Point DNS back at Lovable. The Lovable deployment is untouched by any of this
and keeps building from `main`, so it stays a warm standby — the badge comes
back with it.

## Consequences worth knowing

- **Releases change shape.** Today publishing means merging and then calling
  Lovable's `deploy_project`. After cutover, Vercel deploys on push to `main`
  and `deploy_project` no longer affects the live site. Verify releases against
  the Vercel deployment from then on.
- **Two hosts will serve the same app** until you delete or unpublish the
  Lovable one. That is fine, and useful during rollback, but only one is the
  domain.
- **`botolagoapp` is a second Vercel project** in the same team and currently
  404s. Leave it alone or delete it; do not point the domain at it by mistake.
