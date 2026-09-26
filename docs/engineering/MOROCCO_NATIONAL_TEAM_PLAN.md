# Équipe du Maroc: plan

Status: **plan, not built.** Written 2026-09-25. Owner-facing version with
screen mockups: <https://claude.ai/artifact/Haj33MrqeHQg2QPJvcBkSu>.

A Morocco senior men's team section where supporters take part rather than
read: pick a starting XI and share it, predict the score, then rate the
players. "Mon XI du Maroc" ships first, "Pronostics Maroc" second, player
ratings third, "Lions Watch" runs as editorial in the news system.

The differentiator is participation. SNRT's Oussoud app already covers news,
results, lineups and polls, so a Morocco news page alone adds nothing.

## Screens

| #    | Screen                                                               | Route                      | Phase | Basis                                        |
| ---- | -------------------------------------------------------------------- | -------------------------- | ----- | -------------------------------------------- |
| P1   | Hub (states: no squad yet, squad announced, lineup out, after match) | `/maroc`                   | 1     | `UiCard`, `MatchCard` patterns               |
| P2   | XI builder with formation choice                                     | `/maroc/mon-xi`            | 1     | `UiPitchSurface`, `UiPlayerPlate`, `kits.ts` |
| S1   | Player picker sheet                                                  | inside P2                  | 1     | `UiSheet`                                    |
| P3   | XI ready and share                                                   | `/maroc/mon-xi` (step 2)   | 1     | `PredictionsShareButton` sheet               |
| P4   | Shared XI, friend's view                                             | `/maroc/xi/$code`          | 1     | new                                          |
| I1   | Link preview image 1200×630                                          | `/og/maroc-xi/$code.png`   | 1     | new (no image generation exists today)       |
| I2   | Story image 1080×1920                                                | drawn client-side (canvas) | 1     | new                                          |
| A1   | Admin: Morocco matches (fixture, kickoff, lineup, result)            | `/admin/maroc`             | 1     | admin console                                |
| A2   | Admin: squad per international window                                | `/admin/maroc/liste`       | 1     | admin console                                |
| E1–3 | Home card, "Maroc" Explorer tile, desktop top-bar link               | `/`, `TopBar`              | 1     | `index.tsx` sections                         |
| P5   | Pronostics Maroc: my prediction + Morocco leaderboard                | `/maroc/pronostics`        | 2     | `ScoreStepper`, `PredictionsLeaderboard`     |
| P6   | Rate the players + supporters' man of the match                      | `/maroc/matchs/$id/notes`  | 3     | `MatchVoteCard` pattern                      |
| P7   | Ratings result (P6 after closing)                                    | same                       | 3     | new state                                    |
| I3   | Ratings result share image                                           | `/og/maroc-notes/$id.png`  | 3     | I1 renderer                                  |

Totals: 7 pages (4 at launch), 1 sheet, 3 images (2 at launch), 2 admin
screens, 3 entry points. Every page in French and Arabic (RTL), phone and
desktop: 28 page frames for design, 16 of them at launch.

Lions Watch has no screen: it is a weekly News CMS article under a
"Lions Watch" topic, verified by hand, 10–15 internationals.

### Navigation

- No sixth bottom-bar item: `primary-nav.ts` has no slot, the same reason
  Pronostics lives under Matches.
- Home: a Morocco card after the live/upcoming matches block, moved above
  it during international windows. Update `index.home-structure.test.ts`.
- Explorer grid: "Maroc" replaces the Profile tile (Profile is already in the
  bottom bar), keeping 2 rows of 3.
- Desktop `TopBar`: a "Maroc" link.

## Data

### Source

The football ingestion is pinned to SportsMonks Botola Pro (league 860, one
season, adapters reject other leagues) and `resolve_football_country` accepts
only `MA`. Connecting a national-team feed is a separate project with
unverified coverage, so **phase 1 is admin-entered**: fixtures, squad,
official lineup and result, from FRMF announcements (about 30 minutes per
window). Revisit the feed once the section proves itself.

### Schema (phase 0)

- A competition "Équipe du Maroc" (`competition_type` `international` /
  `friendly` already exist) with its own season `2026-27`, so Morocco fixtures
  never enter Botola standings, Fantasy or Botola Pronostics. Check every
  reader that assumes "current season" or lists `active` teams
  (`football_team_catalog`, onboarding club lists) so national teams stay out.
- Opponent countries: extend the country resolver / seed beyond `MA`.
- One round per international window (`round_number` 1, 2, …), which gives
  Pronostics the `round_id` it requires.
- `app.nt_squads` (window, fixture ids, announced_at) and
  `app.nt_squad_players` (squad id, display name FR/AR, position GK/DEF/MID/FWD,
  optional `player_id`, `withdrawn_at`). Most internationals are not in the
  Botola catalogue, hence the optional link. A withdrawn player stays in saved
  XIs, marked withdrawn.
- Official lineup and result go into the existing `app.lineups` /
  `app.lineup_players` (`player_name` fallback already exists) and
  `app.fixtures`.
- Admin writes go through `api.*` RPCs with the existing staff grants and
  audit trail, like the news editor.

### Mon XI storage

- The XI lives in the share link: formation + 11 squad indexes, encoded short
  (`/maroc/xi/<squad key>-<code>`). No database write is needed to create or
  share, so guests need no account and there is no free text to moderate.
- Supporters' XI: `api.nt_xi_submit(squad, formation, slots)` counts each
  completed XI anonymously (validated: 11 distinct squad players, exactly one
  GK, legal formation), with a per-device token and a daily cap. Aggregates
  are read through `api.nt_xi_community(squad)`.
- Signed-in users: `app.nt_xi_saves` for history; guest XIs held in
  localStorage are claimed at sign-in, like `guest-store.ts` does for
  predictions.

## Pronostics Maroc (phase 2)

Today Pronostics runs one contest: `app_private.prediction_settings` is a
single row, `save_predictions` accepts only fixtures in
`predictions_current_season()` with a `round_id`, the API has no competition
parameter, and leagues hang off the Fantasy season.

- Generalise settings to one row per contest (competition + season, mode,
  scoring flag). Botola stays the default so existing calls are unchanged.
- Add an optional competition parameter to `save_predictions`, the round and
  leaderboard reads, and `src/services/predictions.ts`.
- `app.prediction_standings` is already keyed by season, so the Morocco
  leaderboard is separate by construction.
- Rule to publish before launch: score at the end of regulation time
  (90 + stoppage); extra time and penalties do not count. Fixtures store
  extra-time and penalty scores separately, so scoring reads the regulation
  score; confirm that on real knockout data before the first knockout match.
- Deadline, postponement and void handling reuse what exists.
- Morocco private leagues come later; they need leagues decoupled from the
  Fantasy season.
- "Your XI vs the official lineup" (N of 11 right) ships in this phase,
  once A1 can enter lineups.

## Player ratings (phase 3)

- `app.nt_player_ratings` (fixture, squad player, user, 1–10) and
  `app.nt_potm_votes` (fixture, squad player, user), one per user.
- Open at full time for 48 hours; signed-in only for ratings, so averages
  stay honest. Results show vote counts and say these are supporters'
  ratings, not a statistical rating.
- Same shape as `match_votes` (totals + caller's own choice, kick-off style
  lock, ban filter).

## Share images

Nothing in the app renders images today.

- I1 / I3: a server route renders a PNG from the link (satori + resvg or
  `@vercel/og`; check what the nitro build supports on the deploy target).
  The URL is immutable, so cache it forever at the CDN. `/maroc/xi/$code`
  sets `og:image` to it in `head()`. Fallback: a static `/og-maroc.jpg`.
- I2: drawn with canvas on the phone, shared with `navigator.share({files})`
  where supported, otherwise downloaded.
- No player photos (image rights) and no FRMF crest (trademark): red shirts
  from `kits.ts`, names, flag colours, BotolaGO branding.

## Flags, i18n, analytics

- `MAROC_ENABLED` (routes, admin) and `MAROC_PROMOTED` (home card, tile,
  sitemap, indexing) in `src/lib/feature-flags.ts`, like Pronostics.
- All copy in `dictionary-fr.ts` and `dictionary-ar.ts`; Arabic reviewed by a
  native editor. Update the i18n gate baselines if counts move.
- New `AnalyticsEvent` names: `maroc_xi_start`, `maroc_xi_complete`,
  `maroc_xi_share`, `maroc_xi_create_from_share`, `maroc_prediction_save`,
  `maroc_rating_submit`, `maroc_signup`. Share links carry
  `utm_source=share&utm_medium=<channel>&utm_campaign=maroc_xi`.
- Add `/maroc/xi/*` to `SELINE_MASK_PATTERNS`.

## Order

| When      | Phase | Work                                                      |
| --------- | ----- | --------------------------------------------------------- |
| Week 1    | 0     | Competition, countries, squad tables, admin A1/A2, flags  |
| Weeks 2–4 | 1     | P1–P4, S1, I1, I2, supporters' XI, entry points. Launch.  |
| Weeks 5–6 | 2     | Pronostics contests, P5, XI vs official lineup, saved XIs |
| Weeks 7–8 | 3     | P6, P7, I3                                                |
| Ongoing   | 4     | Lions Watch articles                                      |

Target the November international window for launch (confirm dates on FIFA's
calendar); October is too close.

## Measures

Per international window: XIs completed ÷ builder opened; shares ÷ XIs
completed, by channel; visits from shared links and XIs made by those
visitors; predictions per Morocco match; fans returning for the next Morocco
match; accounts created from the section that then join Botola Pronostics or
Fantasy. Set targets after the first window.

## Open decisions (owner)

1. Admin-entered squad and fixtures at launch (recommended).
2. Names: "Équipe du Maroc" / "المنتخب الوطني", "Mon XI du Maroc" /
   "تشكيلتي للمنتخب", "Pronostics Maroc" / "توقعات المنتخب".
3. "Maroc" replaces the Profile Explorer tile.
4. No player photos or FRMF crest at launch.
5. Launch window: November.
6. No prizes or sponsorship at launch.
