# WP5 brief: Fantasy inline and the Pépites tile

Written before the first interface change (AGENTS.md "Screen work", rule 3). Package: plan section
8.7, with 3.4 (Pépites inside Fantasy) and 5.1–5.3 (where each moment lands, and its rules). Branch
`claude/manager-card-section-wp5`, from `claude/manager-card-section` at `0195b344`. Port 4185.

Inspected first, on the base tree with the preview on and nothing of this package applied: the
Fantasy hub (guest and owner), `/fantasy/team`, `/fantasy/transfers`, `/fantasy/rankings`,
`/fantasy/points` and `/fantasy/leagues/lg1` at 390 × 844, French, light. The mock Fantasy team
is "Atlas XI"; the mock league `lg1` has `m1`, `m2`, `me`, `m4`, `m5`.

## What must be preserved

1. **Every edited file renders exactly as before while `useManagerCardLive()` is false**: same DOM,
   same hook order (the off hook is a constant function that calls no hook), no request, no
   storage key, no console message. The existing tests of each edited file stay unchanged and
   pass. This is proved, not asserted (INDEX.md "Switch off").
2. **Business logic**: Fantasy rules, scoring, the gameweek lifecycle, deadlines, the squad
   builder's validation, the save and import paths, chips and transfers are not touched. The card
   is display-only: nothing here reads a rating to rank, filter or sort anyone. League rows keep
   the league's own points order and their `ReportNameMenu`.
3. **Identity**: the hub's order (title band, deadline, team card, « Composer l'équipe », the
   transfers row, the four shortcuts, « Mes ligues »), the kit components, the `ui.*` tokens, the
   club colours only through `clubPalette`/`clubStyle`, logical properties only, 44 px targets and
   48 px rows.
4. **Existing behaviours that look incidental**: `autoFocus` on the team-name field and the builder
   opening on the squad step (both unchanged unless live); the destination after a save
   (`/fantasy/team`, or the league join form for an invite); the PrizeWelcome dialog on the hub;
   the guest draft; the registration-closed intro (no mention of the card at all).
5. **Pépites addresses, canonicals and SEO** (plan decision 6): the tile is a plain link to
   `/pepites`.

## The improvements

Fantasy gains the onboarding moments the owner approved (plan 5.1), all inline, none opening by
itself, all gated on the section being live:

| Moment | Surface | Change while live |
| ------ | ------- | ----------------- |
| M1a | `FantasyGuestIntro` (open state only) | A fifth « Comment jouer » point: the guest mini in its 36 px disc, `m1.intro.*`, after the deadline point. Not shown without `minRated` from the status. |
| M1b | `/fantasy/create`, name step | A 64 px row (token + `m1.save.line`) between the captain rows and the guest note; `autoFocus` off the team name; `card_save_line_view`. |
| M1c (back) | `/fantasy/create` | A restored draft that the new account adopted from the visitor opens on the name step with `m1.builder.line`, focus on the save button. |
| M2 | `/fantasy/team` | `CardBornPanel surface="team"` (WP4) above the controls; the SEL hint. |
| M3a, M3b | hub, `FantasyHubTeamArea` | `HubCardBlock` after « Composer l'équipe » (64 px token, counter or number, next round, « Nouveau »), taps to `/gradins`. |
| M3c | `MyRankCard` | 44 px token and `k/n` or `84 OVR` at the end of « Mon classement », taps to `/gradins`. |
| M3d | `GameweekRecapCard` | `m3.recap` under the total while the card forms and that round counted. |
| M3e | `PlayerActionSheet`, `/fantasy/team`, `/fantasy/transfers` | `CardHint` (`UiAlert tone="info"`, dismissible), once each per device, only for a manager whose card has no number yet. |
| M3f | transfer confirmation | `FirstTransferLine` while TRF's reason is `no_transfers`. |
| M5 | `/fantasy/leagues/$leagueId` (private) | `LeagueCardBand`, 28 px minis before the team name, the `gradins.people.compare` link to G3. |
| 3.4 | hub, `fantasy.index.tsx` | `PepitesHubTile` under the four shortcuts; PrizeWelcome waits when a hero was already shown this session. |
| Decision 6 | `FantasyImportPrompt` | `track("fantasy_team_created")` on the import's success path, **in its own commit**, not gated (analytics only); and the card read is invalidated after an import, gated. |

The lab's open points, solved in the real components rather than carried over:

- **The M2 panel and the pitch's first row.** The panel sits at the top of the content, above the
  facts row, so the controls and the pitch stay one unit below it, unchanged. Its height budget
  is measured at 390 × 844 in both languages (INDEX.md); where the pitch's first row is not
  visible the number goes to WP4 as a ceiling for the panel.
- **Tall tokens.** Every token is placed in an auto-width column that takes the box the renderer
  reports (`tokenBox`), never a fixed width, so a tall Écharpe at 64 px cannot be clipped or
  squeezed and the text column takes what is left.
- **No promise of a club colour before the server resolves the club.** No copy of this package
  mentions colour. The hub, rankings and league tokens draw the card read's own club (null
  means the object's own material); the save-step token for a signed-in manager without a team
  uses `user.favoriteClubId` through `findClub`, as the Gradins no-team hero does (plan 4.1), and
  none of it is worded as a promise.

## Acceptance criteria

Functional

1. With the hook off, `bun test` for every edited file passes unchanged, and a server render or
   DOM comparison of each edited surface against the base tree is identical (INDEX.md).
2. With the hook on, each inline surface renders for its audience and not for the others: guest,
   no team, registration closed (no point at all), owner forming, owner rated, no card (nothing).
3. A hint stores its device key and shows once; blocked storage counts as seen; a dismissed hint
   never returns. League rows keep their order and report menus. No number is ever computed here.
4. `useManagerCardLive` is called before any early return, and no hook is called conditionally.
5. `card_*` events fire once per view, never on the server.

Visual (measured as CLAUDE.md "Evidence" says, from element rectangles and rasterised pixels)

6. At 390 and 1440, French and Arabic (right-to-left), light and dark for the hub and the league
   page: no element escapes the viewport, every control is at least 44 × 44, rows at least
   48 px, text contrast at least 4.5:1 (3:1 for the 30 px figures), Arabic digits isolated and
   no letter-spacing on Arabic text, the mirror right (back pill, chevron, token side).
7. Reduced motion: `document.getAnimations()` is empty; nothing here animates the number.
8. No banned word (plan 2.5), no name in a heading, « — » and never 0 for an unknown number.

Not in this package: the Gradins screens (WP3), the panel, hero, lines and share (WP4), the
account path and the Pépites back pill (WP6), the shared files (WP1/WP6b). Missing keys or events
are reported, not added.
