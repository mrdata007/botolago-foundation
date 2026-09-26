# Pépites: handoff for finishing Compare, Follow, Stats and desktop layouts

Written for whoever (human or agent, "codex" from here on) picks this up next.
The owner asked, after the v1 launch review: **"do not leave those out,
implement them as well"**, meaning: Compare, player Follow, the "+Fantasy"
button, the Stats tab, the Percée card, and the desktop layouts (D1
ranking, D2 player) — all previously deferred to v1.1. This doc is the
complete state of that work as of this handoff, so it can continue without
re-deriving anything already decided.

**Standing constraints, still in force, unchanged from the original brief:**

- Do not merge any PR, apply migrations to production, deploy publicly,
  send real emails, or change paid plans without separate authorization
  from the owner.
- Keep Pépites unavailable publicly (mode stays `off`/`staff` in
  production; the local/preview stack runs `public` for testing only).
- Test each component and the full user journeys; fix failures as part of
  implementation; do not claim a test passed that was not run.
- Work in focused, reviewable PRs, stacked as the rest of this feature is.
- Give milestone summaries, not a running narration of every command.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
  and `Claude-Session: https://claude.ai/code/session_01MEvcTPY9g2Mq8n53NPbT9x`
  (adjust the model name in the trailer if a different agent is doing the
  finishing work — do not carry over a name that isn't accurate).
- PR bodies end with the Claude Code footer only if a Claude agent opens
  them; adapt attribution to whichever agent actually does the work.
- No model identifiers in code, comments, or commit *subjects* — trailers
  only.

## 1. Branch stack (as pushed)

```
main
 └─ claude/morocco-national-team-tmd7sy
     └─ claude/awesome-hypatia-01s0ok        PR #226 (migration 2: photo releases)
         └─ claude/pepites-data-desk         PR #227 (migration 3: data desk)
             └─ claude/pepites-engine        PR #228 (migration 4: ranking engine)
                 └─ claude/pepites-editions      PR #230 (migration 5)
                     └─ claude/pepites-weekly-email  PR #231 (migrations 6-7)
                         └─ claude/pepites-api           PR #232 (migration 8, API)
                             └─ claude/pepites-photo-job     PR #233 (photo job)
                                 └─ claude/pepites-frontend      PR #236 (public pages FR/AR)
                                     └─ claude/pepites-admin         PR #237 (staff screens)
                                         └─ claude/pepites-follows-stats   (NEW, migration 9 — NOT YET A PR)
                                             └─ claude/pepites-player-features (NEW, WIP — NOT YET A PR)
```

All of #226–#237 are green, unmerged, per the owner's "never merge" rule.
`claude/pepites-follows-stats` and `claude/pepites-player-features` are the
two new branches for this v1.1 work, both pushed to origin, **no PR opened
yet** — open PRs for them once the work in §4 below is done and tested
(base each on the branch it stacks on, same pattern as the rest of the
stack; #237 → `claude/pepites-follows-stats` → `claude/pepites-player-features`
→ (compare) → (desktop)).

Current HEAD when this was written: branch `claude/pepites-player-features`,
commit `46ea5fa3` ("wip(pepites): follow button, fantasy transfer deep-link,
i18n keys (incomplete)"), stacked on `claude/pepites-follows-stats` commit
`009b8539` ("feat(db): follow a player, season figures and the minutes
split (Pépites)"), which is stacked on `claude/pepites-admin` (#237).

## 2. What's fully done (migration 9, `claude/pepites-follows-stats`)

**Committed, pushed, tested — this branch is essentially ready for its own
PR** (open one once the rest of the stack gives it something to point at,
or open it now against `claude/pepites-admin` if that's cleaner).

- `supabase/migrations/20260926150000_pepites_follows_and_stats.sql`:
  - `app.pepites_follows` (private table, RLS forced, goes with the
    profile on delete, statement-level MFA step-up trigger).
  - `api.pepites_follow_state(p_player_id)` / `api.pepites_set_follow(p_player_id, p_follow)`:
    signed-in accounts only (not guests/anonymous), 100 follows max,
    idempotent, `following` is `null` for anyone who can't follow.
  - `api.pepites_player_stats(p_version, p_player_id)`: season stats
    (apps/starts/minutes/goals/assists/saves/cleanSheets/goalsConceded/
    penaltiesSaved/penaltiesMissed/yellowCards/redCards/ownGoals, read
    from `app_private.pepites_run_appearances` joined to
    `app.player_fixture_performances` for the provider's card/GK/penalty
    counts), the minutes split (`app_private.pepites_minutes_split`: the
    run's rounds cut in half, `firstMinutes`/`secondMinutes` +
    `firstMatches`/`secondMatches` per club), and `fantasyPlayerId` (the
    same player in the currently open Fantasy game, or null).
  - `api.pepites_ranking` gained `p_min_minutes`, `p_followed` filters,
    `secondHalfMinutes` per row, and a `teams` array on the first page
    only (for the desktop club filter, D1).
  - Follow filter respects the MFA step-up gate (an account owing its
    factor reads/filters as if signed out, not as itself — see
    `v_viewer` in the SQL and the two step-up tests below).
- `supabase/tests/database/pepites_follows_and_stats.test.sql`: 36
  assertions, all pass. Verified a broken halves calculation fails 3 of
  them (real regression coverage, not just happy-path).
- `supabase/tests/database/ordinary_account_mfa_step_up_reads.test.sql`:
  updated the "75 functions run the step-up" count → still needs the
  count bumped for whatever `api.pepites_ranking` overload exists after
  your final signature — **re-run this test after any further signature
  change to `pepites_ranking`** (it fails loudly and tells you the exact
  count if not).
- `supabase/tests/database/ordinary_account_mfa_step_up.test.sql`:
  `app.pepites_follows` added to the 26-table trigger list (was 25).
- `supabase/tests/database/pepites_api.test.sql`: the `pepites_ranking`
  grant-shape assertion updated to the new 9-argument signature.
- `src/backend/generated/database.types.ts`: regenerated
  (`bun run backend:types:generate`), checked clean
  (`bun run backend:types:check`).
- `src/backend/pepites/contracts.ts`: new schemas —
  `minutesSplitSchema`, `seasonStatsSchema`, `playerStatsResponseSchema`,
  `followStateSchema`; `rankingRowSchema` gained `secondHalfMinutes`;
  `rankingResponseSchema` gained `teams`; `RankingQuery` gained
  `minMinutes`/`followed`; `PepitesRepository` gained `playerStats`,
  `followState`, `setFollow`. Exported `PEPITES_FOLLOW_LIMIT = 100`.
- `src/backend/pepites/errors.ts`: new `PepitesErrorCode`s
  `account_required`, `follow_limit`, `not_found`, mapped from
  `PEPITES_ACCOUNT_REQUIRED` / `PEPITES_FOLLOW_LIMIT` /
  `PEPITES_PLAYER_NOT_FOUND`.
- `src/backend/pepites/supabase-repository.ts` +
  `src/backend/pepites/supabase-repository.test.ts`: real RPC wiring and
  unit tests (9 pass) for the three new calls and the ranking's new
  optional args.
- `src/backend/pepites/mock-repository.ts`: sample-data version — a
  `follows` Map keyed by account id (in-memory, page-lifetime only,
  mirrors the pattern the weekly-email mock already used),
  `firstHalfMinutes()`/`SPLIT` constants for a believable split per
  player, `playerStats`/`followState`/`setFollow` implemented, ranking
  filters (`minMinutes`, `followed`) applied, `teams` returned on the
  first page.
- `src/services/pepites.ts`: `playerStats`, `followState`, `setFollow`
  added to the `pepitesService` facade.
- `docs/engineering/PEPITES_ARCHITECTURE.md`: §1 scope section and §6.2
  function table updated to record the owner's 2026-09-26 decision and
  the new functions' signatures.

**Full verification run on this branch** (from the handoff session, on a
freshly reset local database): `bun run backend:migrations:check`,
`npx supabase db lint --local --schema app,api,app_private --level error`,
`bun run backend:secrets:check`, `bun run lint` (14 pre-existing warnings,
0 errors, none from this diff), `npx prettier --check` on all touched
files, and the **whole** `supabase/tests/database` suite: **104 files,
3290 assertions, all pass**. `bun test src/backend/pepites/` also passes
(9 tests, includes the new repository tests).

**Not yet done on this branch:**
- No frontend UI reads any of this yet (that starts in §4/§5 below).
- No PR opened.
- The architecture doc's §6.2 table wording could use one more pass for
  clarity, but is not blocking.

## 3. What's in progress, uncommitted state (`claude/pepites-player-features`)

Committed as WIP (`46ea5fa3`) so nothing is lost, but genuinely
incomplete — none of this has been typechecked, linted, or tested yet.
**Do not trust any of it until it's been run.**

### 3a. Done in this WIP commit

- `src/components/pepites/use-pepites.ts`: added
  `pepitesKeys.playerStats` / `pepitesKeys.follow` query keys, and
  `playerStatsQueryOptions(viewer, version, playerId)` /
  `followStateQueryOptions(viewer, playerId)` query-option builders
  (5 min staleTime for stats, 30s for follow state — the follower count
  moves on its own, unlike versioned data).
- `src/components/pepites/PepitesFollowButton.tsx` (new file): the
  follow/unfollow pill button plus its guest sheet
  (`FollowGuestSheet`), matching Figma S4. Logic:
  - `authenticated` → mutate directly.
  - owes a second factor (`requireAuthStep(status) === "challenge"`) →
    `requireAuth()` routes to the MFA challenge, same as the rest of the
    app.
  - anything else (signed out, guest/anonymous session) → opens the
    custom sheet (not the generic `AuthPromptDialog`) with
    "Suivez {name}" / "Créez un compte gratuit pour suivre ses matchs,
    recevoir le Top 10 du lundi et l'ajouter à votre équipe Fantasy." and
    two buttons to `/auth/register` / `/auth/login` with `?next=`.
  - Error mapping: `follow_limit` → toast; `account_required` → toast
    (belt-and-suspenders for the race where an anonymous session slips
    past the client-side branch); `mfa_required` →
    `showStepUpNotice(t)`; anything else → generic failure toast.
  - **NOT YET WIRED IN**: this component is not imported or rendered
    anywhere yet. It needs to go into `PepitesPlayerPage.tsx`'s
    `PlayerHero`, near `PepitesPlayerShareButton` (see §4 for exact
    placement guidance and the layout decision that's still open).
- `src/routes/fantasy.transfers.tsx`: added `validateSearch` reading
  `?player=<fantasyPlayerId>` (mirrors the existing `?compare=` pattern
  on `/fantasy/players`), and a `useEffect` (guarded by
  `incomingFromRef`, waits for `screen.phase === "ready"`) that finds
  that player in `screen.players` and calls the existing
  `onPickIncoming(player)` — the same function "Add Player" already
  uses — then clears the search param via `navigate(..., replace: true)`.
  This is the target for the Pépites player page's "＋ Fantasy" button:
  link to `/fantasy/transfers?player={fantasyPlayerId}` (the id
  `api.pepites_player_stats` returns, **not** the football player id —
  see contracts.ts `fantasyPlayerId` — already the `fantasy_players.id`
  the transfers screen expects).
  - **NOT YET VERIFIED**: this hasn't been typechecked or run. Sanity
    check in particular: `players` defaults to `[]` before
    `screen.phase === "ready"`, and the effect's dependency array
    intentionally omits `onPickIncoming` (new identity every render) —
    confirm the `eslint-disable-next-line react-hooks/exhaustive-deps`
    is still necessary after `bun run lint`, and that the one-shot
    `incomingFromRef` guard behaves correctly under React 18 strict-mode
    double-invocation in dev (it should — the ref persists across the
    double-render — but verify with the browser tests in §5).
- `src/i18n/dictionary-fr.ts`: ~36 new French keys added (follow button
  states, the guest sheet's four strings, follow toasts, the Stats tab
  label, 15 `pepites.stats.*` labels for the season-stats grid, and 6
  `pepites.player.breakthrough_*` keys for the Percée card). Full list
  is in the diff — search for `pepites.player.tab_stats` onward in
  `dictionary-fr.ts` to see exactly what was added.

### 3b. NOT done yet — pick up here

1. **Arabic dictionary** (`src/i18n/dictionary-ar.ts`): the FR keys above
   have **no AR counterpart yet**. This was the very next step when the
   session was interrupted — the insertion point was located
   (`"pepites.player.tab_overview"` / `"pepites.player.tab_matches"` /
   `"pepites.player.photo_credit"` are at lines 1971-1973 in
   `dictionary-ar.ts` as of this writing) but no text was written. Every
   FR key added needs a real Arabic translation (not machine-identical
   text — the i18n gate's W1 check flags fr===ar). Mirror the tone of
   the existing AR Pépites strings nearby (e.g. `"pepites.player.tab_overview": "نظرة عامة"`).
   Some translation guidance from the Figma AR spec notes
   (`docs/engineering/PEPITES_ARCHITECTURE.md` doesn't have these, but
   the earlier session's scratchpad — likely gone — had them; reconstruct
   from context): "Percée" → "الانطلاقة" (used in the Figma AR share-card
   spec already), "Temps de jeu" → "وقت اللعب", "1re moitié" / "2de
   moitié" → "النصف الأول" / "النصف الثاني" (already used in the Figma AR
   match-log spec: "النصف الأول · 155 د" / "النصف الثاني · 1004 د" — note
   the AR digit format there was "1004 د" not "1 004′", i.e. no thousands
   space and a "د" (day/min abbreviation) suffix rather than the Latin
   apostrophe; decide which convention to follow for the new UI and stay
   consistent with the existing match-log AR formatting already shipped
   in `PepitesPlayerPage.tsx`'s `PlayerMatches`).
   "＋ Suivre" pattern for AR is **"متابعة ＋"** per the existing Figma
   spec note (`figma-spec.md` §9: "the thousands space is dropped" and
   the plus sign moves after the word). Use that exact ordering for
   `pepites.follow.button` / `pepites.follow.button_active`.

2. **After the AR keys exist**, run
   `bun scripts/qa/i18n-gate.ts` and fix whatever it reports (W1
   identical fr/ar, W2 no Arabic script, W3 unused keys — expected to be
   zero once wired in, W4 non-literal `t()` calls — should be zero since
   every call site should use a literal key). If any baseline in
   `scripts/qa/i18n-gate.ts`'s `BASELINES` needs bumping, bump it in the
   same commit and say so in the commit message (see the CLAUDE.md-style
   convention this repo uses — the count must go up by exactly the
   number of genuinely new W1/W2/W3/W4 findings, never absorbed
   silently).

3. **Wire `PepitesFollowButton` into `PepitesPlayerPage.tsx`.** Read
   `src/components/pepites/PepitesPlayerPage.tsx`'s `PlayerHero`
   function first (~line 255-339 as of the last read). The top row
   currently renders `<BackToRanking />` and
   `<PepitesPlayerShareButton data={data} />` side by side
   (`justify-between`). Add `<PepitesFollowButton playerId={playerId}
   playerName={player.name} />` there too — decide the exact layout (a
   third item in that flex row is cramped on a 390px screen; consider a
   two-row header: back link alone on row 1, follow+share grouped
   `justify-end` on row 2, or shrink the share button to icon-only and
   put follow first since Figma 03 puts follow top-right and no share
   button appears in that exact screenshot at all — the share button was
   an addition from the original build, not strictly from Figma 03,
   so there's room to reflow). Verify visually against
   `figma/7-166.png` (mobile FR) and `figma/18-709.png` (mobile AR,
   mirrored) in the scratchpad if it still exists, or re-fetch via the
   Figma MCP tools (`mcp__Figma__get_screenshot`, file key
   `DEQTspI8A04pjmLcAYTYw4`, node `7:166` FR / `18:709` AR) if not.

4. **Add the "＋ Fantasy" button.** Needs `data.stats` (or a separate
   `playerStats` query) to know `fantasyPlayerId`. Fetch
   `playerStatsQueryOptions(viewer, version, playerId)` in
   `PepitesPlayerPage` alongside the existing `player` query (same
   `enabled` condition: `pointer?.available === true && version !==
   null`). Render the Fantasy button **only when `fantasyPlayerId` is
   non-null** (don't show it for a player the Fantasy game doesn't
   list) — a plain `<Link to="/fantasy/transfers" search={{ player:
   stats.fantasyPlayerId }}>` styled as the Figma primary gradient pill,
   label `t("pepites.player.fantasy_button")`. Figma places it near the
   tabs row (`figma-spec.md` §1: Button at (262,400,120,38)) — so most
   likely a `justify-between` wrapper around `<PlayerTabs .../>` with
   the Fantasy button as the second child, shown only on the
   `overview`/`stats` tabs (not `matches`, per the Figma 04 screen which
   has no such button).

5. **Add the Stats tab.** `PlayerTab` type
   (`PepitesPlayerPage.tsx:51`) needs a third value `"stats"`. The route
   (`src/routes/pepites.joueur.$playerId.tsx` and
   `src/components/pepites/pepites-route.ts`'s `PlayerSearch`/
   `validatePlayerSearch`) needs to accept and round-trip a third
   `onglet` value — pick a URL token (`"stats"` is the obvious choice,
   consistent with `"matchs"`). `PlayerTabs` already renders a generic
   list from an `options` array — extend it with the third tab, label
   `t("pepites.player.tab_stats")`. Build a `PlayerStats` component
   (new, or added to `PepitesPlayerPage.tsx`) that renders the 13
   `seasonStats` fields as a card of label/value pairs (reuse the
   existing `PepitesCard`/`ProfileItem`-style grid already in
   `PlayerOverview`, or the `FactsStrip` component from
   `PepitesVisuals.tsx` for a subset of 4 headline stats + a detail
   table for the rest). Null fields (`saves`, `cleanSheets`,
   `goalsConceded`, `penaltiesSaved` are `int | null`, meaningful only
   for GK/DEF positions per the SQL comment) should show
   `t("pepites.stats.not_applicable")` rather than "0" — check
   `player.positionGroup` to decide which fields to even show (a FWD/MID
   shouldn't see "Clean sheets: N/A" cluttering the page — consider
   filtering the field list by position group entirely, GK gets
   saves+cleanSheets+goalsConceded+penaltiesSaved, DEF gets
   cleanSheets+goalsConceded, MID/FWD get neither).

6. **Add the Percée card.** Figma 03 `figma-spec.md` §1 already
   specifies this exactly (card at (16,612,358,112), "PERCÉE" /
   "minutes par demi-saison" header, two bars: 1st half (grey,
   height ∝ minutes) and 2nd half (energy gradient, height ∝ minutes,
   `height = 40 × minutes / max(minutes)`), then "×N,N" (the
   multiplier, `secondMinutes / firstMinutes` to one decimal, comma
   not dot) and "TEMPS DE JEU" label. Render it in `PlayerOverview`
   (`PepitesPlayerPage.tsx`), sourced from the `playerStats` query's
   `split` field. **Handle `split === null` or `firstMinutes === 0`**
   (the SQL returns `null` for a run under 2 rounds; `firstMinutes`
   could legitimately be 0 for someone who played nothing before the
   half) — show `t("pepites.player.breakthrough_unavailable")` instead
   of a division by zero / `Infinity` multiplier. The desktop D2 version
   of this card ("L'ÉCLOSION") is visually different (side-by-side bars,
   not stacked) — that's task §18, not this one; don't over-build the
   mobile card to also serve desktop, they can be separate render paths
   sharing the same data.

7. **Run the checks** listed in §5 before pushing.

## 4. What §17/§18 (Compare page, desktop layouts) still need — not started

These were queued as separate tasks (#17, #18 in the session's own task
list) and **no code exists for them yet**, but all the design research is
done and saved. Read `docs/engineering/pepites-v1.1-figma-notes/figma-spec-2.md`
(copied into the repo from the session's scratchpad so it survives —
the full text is also reproduced below since it's short) before writing
any of this. `docs/engineering/pepites-v1.1-figma-notes/figma-spec.md`
and `figma-home-ranking.md` are the original v1 Figma notes (05 Comparer
and S4 are documented at the end of `figma-spec.md`'s "Also in the file"
list, and in full in `figma-spec-2.md`).

### Compare page (05 Comparer FR `11:370`, AR `25:504`)

Route: new file `src/routes/pepites.comparer.tsx` (or similar — check
existing route naming, e.g. `pepites.joueur.$playerId.tsx`), path
`/pepites/comparer`, search params for the two player ids (e.g.
`?a=<id>&b=<id>`), likely reached from a "⇄ Comparer" button/link on the
ranking or player page. Needs a new backend read too: comparing two
players' season figures side by side. Options: (a) call
`api.pepites_player(version, id)` twice from the client (simplest, no new
SQL), reading `score.score`, `score.minutes`, `score.apps` (as
"TITULAIRE"/starts — check the Figma row is "TITULAIRE" showing starts,
not apps), `score.ratingAvg`, `score.formAvg`,
`score.per90.goalsAssists*minutes/90`-ish for "B+PD" (or just
`goals+assists`), a cards count (not currently in `PlayerResponse` —
would need `playerStats` for that), and `components.progression` (0-100
percentile) for "PROGR.". Given cards data now exists via
`api.pepites_player_stats`, probably call **both** `pepites_player` and
`pepites_player_stats` for each of the two players (4 calls total) rather
than adding a new combined RPC — simpler, and the existing per-player
caching in `use-pepites.ts` already handles it. **Only add new SQL if a
genuinely new field is needed that neither existing function returns** —
re-read `contracts.ts` before assuming something is missing.

Full Figma spec (from `figma-spec-2.md`, "## 05 Comparer" section):

```
## 05 Comparer (390, bg page)
- Night band polygon h326 (same family). Two glows 190 circles at (-30,70) and (230,70): each player's club colour.
- "‹ Retour" (18,56) Manrope XB 13 white. "FACE À FACE" centred at y60: Mono SB 9 #9aa4c7 tracking 1.26.
- Portraits: left photo 130 at (24,92) / right ShirtFallback 112×105 at (248,104). "VS" Changa XB 30 energy text, slanted, centre (~190,150).
- Names centred under each (w160, centres x89 and x302) at y228: Changa XB 15 white. Meta y250: Mono Medium 9 #9aa4c7 "IRT · 22 ANS · #5".
- Card (16,300,358): white r14 p14 gap10 shadow 0 6 16 rgba(11,19,48,.08).
  Head: "SAISON 2025-26" Manrope XB 11 tracking .66 #0b1330 · right "défenseurs U23" Mono Medium 9 #5d6789.
  Row (gap 6, centred): value w38 right (Mono SB 10) · bar box (max 88, h8, r2, right-aligned) · label w70 centred Manrope XB 9 #0b1330 · bar (left-aligned) · value w38 left.
  Winner: value #1b8f55, bar = energy gradient. Other: value #5d6789, bar #d5dae6. Bar width = 88 × v / max(v1,v2).
  CARTONS: fewer wins (1 vs 5: winner bar 17.6 gradient, loser 88 grey).
  Rows: RISING (score) · MINUTES · TITULAIRE (starts) · NOTE (avg rating) · FORME (form rating) · B + PD · CARTONS · PROGR. (progression percentile).
- Primary button full width h40 "Partager le face à face" at y541.
- AR: fully mirrored (our player on the right), labels المؤشر · الدقائق · أساسي · التنقيط · المستوى · أ + تم · البطاقات · التطور;
  header "وجها لوجه", back "رجوع", title "موسم ⁦2025-26⁩", subtitle "مدافعون أقل من 23", button "شارك المقارنة".
```

Note "CARTONS" (cards) uses "fewer wins" logic (opposite of every other
row) — implement that as a per-row `higherIsBetter: boolean` flag.

The desktop D2 player page (`27:181`) also has a compact "FACE À FACE"
card in its right column (see §5 of this doc, "desktop D2" section) —
that's the same comparison data, different chrome, likely reusable
between the mobile Compare page and the desktop sidebar card. Consider
extracting a shared `<PepitesFaceAFace player1 player2 />` component
that both render, sized differently via a prop or className.

**Player picker**: Figma doesn't show how the two players are chosen —
likely the second player defaults to nothing and the page prompts a
picker sheet (reuse `UiSheet` + a searchable list, similar to
`AddPlayerScreen` in Fantasy) or the entry is always from a specific
context (e.g. tapping a row on the ranking page, or a "Comparer" button
on a player page that opens a picker for the second player). This is a
genuine open design decision the owner should weigh in on if it's not
obvious from further Figma exploration — consider asking rather than
guessing, per the standing instruction to flag ambiguous decisions.

### Desktop layouts (D1 `19:2`, D2 `27:181`)

Breakpoint: this codebase's desktop breakpoint is `md:` (768px) for
layout switches; `lg:` exists only in admin screens. `AppShell`
(`src/components/shell/AppShell.tsx`) has a `contentWidth` prop
(`compact`/`wide`); Pépites pages currently all use the default compact
(672px) width. The Figma desktop frames are 1440px wide with their own
top bar (`BotolaGO` wordmark + centered nav + avatar) — this does NOT
match the existing `TopBar`/`PrimaryNavLinks` component width exactly,
so check `src/components/shell/TopBar.tsx`'s `PrimaryNavLinks` (already
extracted, used by `PepitesTopBar` with `tone="night"`) — the desktop
Figma nav bar is white/light, not the night `PepitesTopBar`, so D1/D2
likely need `contentWidth="wide"` on `PepitesShell`/`AppShell` plus new
`md:` variants throughout `PepitesRanking.tsx` / `PepitesPlayerPage.tsx`
rather than wholly separate components — check how `FantasyFrame`
(`src/components/fpl/FantasyFrame.tsx`) does its `md:` desktop-vs-mobile
split for the closest existing precedent (it shows the top bar on
desktop only and lifts the column with rounded corners at `md:`).

Full Figma spec for D1/D2 (from `figma-spec-2.md`):

```
## D1 desktop ranking (1440)
- App top bar white h64 (BotolaGO wordmark, nav centred, active underline energy 48×3, avatar).
- Night band h390, violet glow 420 at (-120,-40). Ghost "27" Changa 300 outline slanted at ~(393,60).
- GoMark (120,100). Title "Classement U23" Changa XB 56 white slanted (120,134).
- Meta (120,214) Mono Medium 11 #9aa4c7 tracking .88: "BOTOLA PRO · SAISON 2025-26 · 27 JOUEURS · 600+ MIN · MAJ LUN. 20:00".
- Lede (120,244) Manrope SB 15 #c9d2ea, 2 lines. "Comment on calcule →" (120,300) Manrope XB 14 #5de39b.
- Podium (706,100) gap16: 3 cards 190×250 r16, border 1 white/.14, bg linear 180° club@55% → #0d1738.
  Ghost rank Changa 64 outline top-left; shirt 110×103 at (39,39); name Changa XB 17 white (13,151); meta Mono Medium 9 #c9d2ea tracking .54 (13,177);
  score Changa XB 40 energy slanted (13,~200) + "RISING" Mono SB 8 #9aa4c7 tracking 1.12 at (69,221).
- Filters (120,470) gap 8: light chips Tous ATT MIL DEF GB ≤ 20 ans, "Club ▾", "Minutes min. ▾". Right (1161,476): "Trier par : Rising score ▾" Manrope Bold 13 #1b2a6b.
- Table card (120,516) w1200 white r16 px20 py8 shadow 0 8 24 rgba(11,19,48,.07).
  Header py12 border-b #eef1f6, Mono SB 10 tracking .8 #5d6789, gap 6: # w30 · JOUEUR w240 · POSTE w60 · ÂGE 50r · MJ 50r · TIT. 50r · MIN 62r · BUTS 50r · PD 40r · B+PD/90 70r · NOTE 62r · FORME 62r · 2DE MOITIÉ 80r · "RISING SCORE ▼" 164r (#1b2a6b).
  Row py9 border-b: rank Changa XB 16 #1b2a6b; headshot 36 + name Manrope XB 14 #0b1330 / club Manrope SB 12 #5d6789 (gap 12);
  poste pill bg #e8ecfb r4 px7 py3 Mono SB 10 #1b2a6b; numbers Manrope Bold 13 #0b1330; NOTE RatingChip; 2DE MOITIÉ "71 %"; score: Seg10 w100 + Changa XB 20 #1b2a6b (gap 10).
- Footer (120,~1273) Manrope SB 12 #5d6789: "Données : matchs Botola Pro 2025-26 … Pastille orange : photo manquante."

## D2 desktop player (1440)
- Night band h412 (from 64). Ghost "05" Changa 440 outline slanted at (607,-10).
- Breadcrumb (120,88) Manrope Bold 12 #9aa4c7 "Pépites  ›  Classement  ›  Mohamed El Arouch".
- Photo 290 at (112,112); energy stripe 250×6 slanted under it (131,404).
- GoMark (450,128). (450,166) Mono SB 11 #5de39b tracking .88 "N°5  ·  RISING SCORE  ·  U23".
- Name Changa XB 66 white slanted (450,180). Meta (450,274) Manrope Bold 15 #c9d2ea "Ittihad Tanger · Défenseur · 22 ans · #5 · Pied : " + "non renseigné" #ffb020.
- Actions (450,312) gap 10, 120×38: primary "＋ Suivre", ghost "⇄ Comparer", ghost "＋ Fantasy", ghost "Partager".
- ScoreRing 150 at (1170,112). Rank block centred under (1156,272): "N°5 sur 27" Manrope XB 16 white; "MAJ LUN. 20:00 · ÉDITION S1" Mono Medium 10 #9aa4c7 tracking .6.
- KPI strip (450,366) gap 12: tiles w150 px16 py12 r14 bg white/.06 border white/.14; value Changa XB 28 white; label Mono Medium 9 #9aa4c7 tracking .72.
  NOTE MOYENNE · MINUTES · MATCHS · TITULARISATIONS · BUTS + PD ("1 + 1").
- Tabs (120,496) gap 32 Manrope XB 15: active #1b2a6b + energy underline 56×3 (gap 6); idle #5d6789. Aperçu · Matchs · Stats · Comparer. Rule (120,526,1200) #dfe3ee.
- Left column (120,554) w776 gap 20; right column (920,554) w400 gap 20. Cards white r18 px24 py22 gap14 shadow 0 8 24 rgba(11,19,48,.07).
  Head: Mono SB 12 #0b1330 tracking .72 · right Mono Medium 11 #5d6789.
  * PERCENTILES · SAISON 2025-26 / "comparé aux 26 autres joueurs U23 classés". Rows gap 20: label col w230 (Manrope XB 14 #0b1330 + Manrope Bold 11 #5d6789 sub-line),
    Seg10 of 38×12 r3 blocks gap 4 (share colours), value Changa XB 26 #1b2a6b w44 right.
    Sub-lines: "6,60 sur la saison" · "6,72 sur les 6 derniers matchs" · "défenseur : clean sheets et note" · "155′ → 1 004′ entre les deux moitiés" · "1 159 minutes, 15 titularisations".
  * NOTE · 10 DERNIERS MATCHS / "moy. saison 6,60": chart 728×200, grid lines 6,0/7,0/8,0 #eef0f6, avg dashed, line + 14px dots, value labels above dots, dates below.
  * MATCHS · SAISON 2025-26 / "10 derniers sur 17": columns DATE · ADVERSAIRE · LIEU (Domicile/Extérieur) · SCORE · MIN ("24′ (entré)") · B / PD ("1 PD" #27b36b) · NOTE chip.
  * L'ÉCLOSION / "minutes par moitié": "×6,5" Changa XB 46 energy + "de temps de jeu en / seconde moitié de saison" Manrope Bold 12 #5d6789;
    two rows: label Manrope Bold 12 #5d6789 + value Mono SB 13 #0b1330, bar h12 r4 (1st #dfe3ee, 2nd energy), width ∝ minutes (max 352).
  * PROFIL / "source · date par champ": kv rows py6 border-t #eef0f6 13px; N.R. pill bg rgba(255,176,32,.16) r6 px8 py3 Mono SB 11 #a86400 "N.R. · non renseigné";
    link "Une donnée manquante ou fausse ? Signaler au data desk →" Manrope Bold 12 #1b2a6b.
  * FACE À FACE / "défenseurs U23": two scores Changa XB 34 #1b2a6b, names Manrope XB 13, meta Mono 10; VS energy 22; three rows MINUTES/NOTE/FORME (winner #27b36b);
    ink button full width h38 "Ouvrir le face à face →".
- Footer (120,1814) Manrope Bold 12 #5d6789 + "Comment on calcule →" #1b2a6b.
```

Raw Figma-generated React+Tailwind reference code for both frames is
saved in the repo at `docs/engineering/pepites-v1.1-figma-notes/d1.min.tsx`
and `d2.min.tsx` — **treat these purely as a high-fidelity visual reference
for exact positions/colors, never copy them into the codebase verbatim**
(per the standard Figma-to-code rule: translate absolute positioning into
this project's actual layout system, reuse this project's existing
components — `PepitesCard`, `Seg10Bar`, `RatingChip`, `FactsStrip`,
`ScoreRing`, etc. from `PepitesVisuals.tsx` — rather than recreating them
from the raw Figma markup). Reference screenshots for D1, D2, Compare and
S4 are at `docs/engineering/pepites-v1.1-figma-notes/screenshots/`
(`19-2.png`, `27-181.png`, `11-370.png`, `21-561.png`). If more detail is
needed than these give, re-fetch via `mcp__Figma__get_design_context`
with file key `DEQTspI8A04pjmLcAYTYw4`, node `19:2` (D1) or `27:181`
(D2) — note both are large (~90-110K tokens raw); read them in chunks
(e.g. `jq`/`sed`) rather than one call, since the tool errors above
~100K characters. AR frames for D1/D2 were **not found
in the Figma file** — only FR desktop frames exist (`19:2`, `27:181`);
mirror the RTL rules already established for the mobile pages (§9 of
`figma-spec.md`: night band polygon flips, ghost numbers move, text
alignment flips, energy gradient inside bars/text stays L→R, ScoreRing
arc stays unmirrored) when building the AR desktop variant, since no
literal Figma AR desktop reference exists to check against.

The ShirtFallback and RatingChip and Seg10Bar assets/components referenced
in D1's podium and table already exist in `PepitesVisuals.tsx` — reuse
them, just at different sizes (Seg10 in the D1 table header spec is
38×12 blocks vs the existing 6px-tall bars — check whether `Seg10Bar`
takes a size prop or needs one added, rather than forking it).

## 5. Verification checklist — run all of this before opening any PR

In dependency order, from the repo root, local Supabase stack running
(`npx supabase status` to check; if down,
`npx supabase start --exclude edge-runtime,imgproxy,logflare,vector,studio,supavisor`
— `edge-runtime` fails on this container's rlimit, keep excluding it).
**If Docker itself is down** (this happened once already in the earlier
session — `Cannot connect to the Docker daemon`), start it with
`dockerd &` (background) and poll `docker info` until it responds before
retrying `supabase start`/`db reset`.

1. `bun scripts/qa/i18n-gate.ts` — must be clean after the AR keys land.
2. `bun run typecheck`
3. `bun run lint`
4. `npx prettier --check <every touched file>`
5. `bun run backend:types:check` (only if any SQL signature changed
   again — regenerate first with `backend:types:generate` if so)
6. `bun run backend:migrations:check`
7. `npx supabase db reset --local` then
   `psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -f scripts/backend/pepites-local-preview-seed.sql`
   to reload the fictional preview data (128 players, 6 rounds — this
   was already needed once when Docker restarted mid-session; the exact
   reseed steps are in `scripts/backend/pepites-local-preview-seed.sql`
   and `docs/engineering/PEPITES_LOCAL_PREVIEW.md`).
8. `npx supabase test db --local supabase/tests/database` — must show
   **all files pass** (currently 104 files / 3290 assertions on the
   `claude/pepites-follows-stats` branch; expect that to still hold
   unless new SQL is added for Compare — in which case add its own
   `.test.sql` file following the existing naming and structure
   conventions, e.g. `pepites_compare.test.sql`).
9. `bun run backend:secrets:check`
10. `npx supabase db lint --local --schema app,api,app_private --level error`
11. `bun test src/backend/pepites/` and `bun run test` (whole suite) —
    fix any Pépites unit-test regressions; the whole-suite count was
    **3,813 pass, 12 skipped** as of the last full run before this
    handoff (from `docs/engineering/PEPITES_V1_TEST_REPORT.md`) — a new
    total should be at or above that once new tests for Follow/Stats/
    Compare/desktop are added.
12. `LEGAL_GATE_ALLOW_PLACEHOLDERS=1 bun run build`
13. Browser tests — start two servers:
    - Mock preview: `VITE_PEPITES_PREVIEW=1 bun run dev -- --host 127.0.0.1 --port 4173`
    - Real-DB preview: normal `bun run dev` pointed at the reseeded local
      Supabase, port 4174 (check `.env`/`vite.config` for how the earlier
      session had this wired — likely `VITE_PEPITES_DATA_MODE=supabase`)
    - `E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome VITE_PEPITES_PREVIEW=1 npx playwright test tests/e2e/pepites.e2e.ts` —
      **add new test cases** for: follow/unfollow (signed-in), the guest
      sheet appearing for a signed-out attempt, the Stats tab rendering,
      the Percée card, the "＋ Fantasy" link landing on transfers with
      the player pre-picked, and (once built) Compare and the desktop
      layouts at a wider viewport.
    - `E2E_PEPITES_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:4174 npx playwright test tests/e2e/pepites.local-stack.e2e.ts` —
      reseed before this run (step 7).
14. Existing general suites must still pass unaffected: anonymous
    acceptance, SEO rendering, dark-mode flag, legal brackets, news-hero
    fallback, pronostics, built-output smoke.

## 6. Reporting back to the owner

When this is done, the milestone summary owed to the owner (in the
plain, no-jargon style already used in this conversation) should cover:
what Compare/Follow/Fantasy/Stats/Percée/desktop now do, that they were
tested (with real pass/fail counts, never asserted without running
them), and reiterate that nothing is merged, deployed, or emailed for
real — same as every prior milestone update in this feature. If the
Compare page's "how do I pick the second player" question (§4) wasn't
resolved by further Figma digging, surface it as an explicit decision
point rather than guessing and shipping a guess.
