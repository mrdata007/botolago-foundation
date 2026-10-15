# Curva for three audiences (BotolaGO+ lane 4)

Owner request (2026-10-14): the Curva section changes for subscribers; for signed-in non-subscribers
it shows the BotolaGO+ parts blurred; for guests it is locked until they create an account.
Builds on #485, #486 and #487 (merge order #485, #486, #487, then this).

## What must be preserved
- Fantasy rules, scoring, the Manager Card, the gameweek lifecycle, brand identity. No database,
  migration or Lovable change.
- Every route's SEO meta (title, description, `noindex`) and the Curva layout's own guard
  (flag/status redirect to Fantasy, `no-store`).
- The signed-in, no-team proposition (`GuestHero` with `audience="no_team"`) and the owner home's
  blocks (people, club, seasons, round, stats, ranking link, share).
- Everything behind the switches: with BotolaGO+ off for the reader (`plusAccess` "off") Curva shows no
  lock, no blur, no mark, and nothing is requested.
- Vocabulary of PLAN.md (abonnement, Découvrir, never the typed name, « vous », no « débloquer »),
  Western digits, bold in the night look, 4px grid.

## Changes
1. **Guests (signed out): Curva is locked.** `/curva` and every `/curva/*` route render one lock
   screen from the layout, before any page component or data read: a blurred, dimmed, inert example of
   Curva (example card, example league table, example season chart; no reads), one headline that names
   what they wanted (home, card, friends, ranking, seasons, offer), primary « Créer mon compte »
   (`/auth/register?next=<wanted URL>`), secondary « Se connecter » (`/auth/login?next=<wanted URL>`),
   `next` sanitised by the existing `sanitizeAuthCallbackNext`. Applies with BotolaGO+ on or off. While
   the session is still loading nothing of Curva is drawn (skeleton). The old guest proposition on the
   home is replaced by this screen.
2. **Signed-in non-subscribers (BotolaGO+ on):** the bottom-of-page blurred chart is replaced by two
   locked blocks in the night-stadium style, in place: « Votre saison » at the top of the home column
   (right under the card on a phone, beside it on desktop) with the reader's real points and rank clear,
   and « Votre duel » right under the friends/league block with the real score against the closest
   rival clear; each with « Découvrir » to the paywall (`via=season` / `via=duel`).
3. **Subscribers:** same two places show real content, compact: season (points, rank, points above the
   league when known, small points chart, « Voir toute ma saison » to the card page section) and duel
   (closest rival, who leads and by how much, the wins split, link to the full duel); a « Style de la
   carte » shortcut opening the picker; a member band with the logo and « Mon abonnement » at the top;
   the renewal/grace banners stay at the top. No lock or blur anywhere for members. A comparison without
   data is hidden, never a dash.

## Acceptance criteria
- Guest, any Curva URL, FR and AR, 390 and 1280: only the lock screen; no card, league, name or number
  of the real Curva; buttons carry the wanted URL; RTL mirrored; no horizontal overflow.
- Non-member with BotolaGO+ on: both locked blocks present in the right places, the free numbers clear,
  Découvrir leads to `/curva/plus?step=3&via=season|duel`. With `plusAccess` "off": none of it.
- Member (yearly): both compact blocks, style shortcut, member band, no `plus-locked`/blur markup; grace
  member sees the grace banner on top.
- Tests: new render/source tests for the three audiences; existing suites, typecheck, lint and the
  plus CSS lint pass.
