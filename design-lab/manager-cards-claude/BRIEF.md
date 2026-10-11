# Manager Card, exploration B (Claude): brief

Written on 2026-10-07, before any card was drawn, after inspecting the brand, the
product surfaces and the first exploration (Codex, branch
`design/manager-card-exploration`, draft PR #377). It follows the screen-work rule in
`AGENTS.md`: what must be preserved, the specific improvements, and the acceptance
criteria. There is no existing Manager Card screen, so there is no "before" screenshot of
one. The before state of the idea is the Codex exploration, captured in `review/codex/`.

## What must be preserved

- **Production stays untouched.** Nothing under `src/`, `public/`, `supabase/`,
  `scripts/`, `mobile/`, `infra/` or any route, navigation, API, schema, migration,
  scoring, points, XP, ranking or OVR logic changes. The lab is a separate folder with no
  imports into the app, no links from it and no network calls.
- **The Codex exploration stays as it is.** It lives on its own branch; this lab is a new
  folder, `design-lab/manager-cards-claude/`, so the two can be compared later.
- **Brand facts.** The logo files are used unchanged (read from `src/assets/brand/` by
  `tools/gen-brand.mjs`). Changa never goes above 800. The gallery chrome keeps the
  interface navy; Logo Blue appears only inside card artwork, which the owner allowed on
  2026-10-07 ("free materials").
- **Product truths.** Free to play: nothing looks like money, betting or a bank card.
  Independent: nothing implies official league status. No player photos; the club is a
  neutral placeholder crest. French/Latin and Arabic are equal: Arabic is right-to-left,
  never letter-spaced, with Western digits kept left-to-right.
- **The same fictional manager in every concept:** ALI, 84 OVR, PRO, Morocco, 2026/27,
  BOT #004821, FOUNDER 2026, CAP 91, SEL 82, TRF 86, CON 78, a neutral crest and one
  shared neutral avatar (the figure is the same; its treatment can change).

## The specific improvements this exploration is making

Inspecting the first exploration showed one skeleton under ten frames: the OVR at the top,
a centred portrait, a four-up stat row, a flag-and-crest line and a dotted-circle founder
stamp. Its leaderboard identities are a person icon inside a shape, so at 44px the 84 and
the tier disappear, which is exactly where friends compare. This exploration targets:

1. **A different skeleton for every concept.** Silhouette, hierarchy, the place of the 84,
   the avatar treatment, the stat treatment and the founder mark all change between
   concepts. No concept may be "the same layout in different colours".
2. **Status that survives small sizes.** Every token has to carry the 84 or the tier (or
   both) at 44px, and stay recognisable as its concept at 24px.
3. **A founder mark made with craft,** chosen per concept (woven label, hallmark, seal,
   stitch, engraving, numbered edition), never a UI chip.
4. **Tier progression drawn, not described.** Every concept renders all five tiers
   (HOMA, STADE, PRO, CHAMPION, LEGEND) through material, silhouette, light and depth,
   not only colour.
5. **Arabic as a first language of the card,** with the name in Arabic script (علي),
   Arabic labels and a mirrored composition where the concept allows, not only Latin data
   kept left-to-right.
6. **Silhouettes that hold on the dark app ground.** A navy card on the dark page is
   about 1.2:1; every dark card carries a rim or a lit edge.
7. **Real app contexts.** Every concept is tested inside BotolaGO's own ranking card, a
   comment line, a head-to-head strip, a size ladder from 80 to 24px and a 9:16 share
   image, in light and dark.

The ten directions are recorded in `DIRECTIONS.md` once the ideation round closes.

## Acceptance criteria

Visual:

- Ten concepts: at least three commercially safe, three bold, three youth/status and one
  wildcard; at least five outside the territory the Codex exploration claimed.
- Each concept: a full card, all five tiers, a token from 80 to 24px, its own leaderboard
  row, a mini identity in a comment and head-to-head line, and a share image, in Latin and
  Arabic.
- Every full card holds its silhouette on both the light and the dark app ground.
- No text clipped or colliding inside any card, at any tier, in either language.

Functional:

- A self-contained gallery (`index.html`, built to one offline file by `build.mjs`) with
  the collection, a detail sheet per concept (large card, tier switcher, compact versions,
  explanation, tier evolution, advantages, risks), a leaderboard test, the critique
  scores, the refined top three (first pass versus refined), the comparison with the
  Codex top three and the final top five.
- Keyboard: every card and control is reachable; the detail sheet closes with Escape,
  moves with the arrow keys (reversed in Arabic) and returns focus.
- 44px tap floor on gallery controls; reduced motion turns motion off.
- Desktop (1440px) and mobile (390px) screenshots, in English and Arabic, light and dark
  grounds, with measured overflow checks (element rectangles, not `scrollWidth`).
- The Impeccable detector runs on the finished lab, and a fresh finish reviewer checks it.

Process:

- Built code-led (`.impeccable/config.json` records `"buildPath": "code"`), with the
  Impeccable context loaded and a direction roll run before any card code
  (`concept-seed --scope direction --mode experience`, key `1eb4cb75`).
- Draft pull request only. No merge, no deployment, no production write.
