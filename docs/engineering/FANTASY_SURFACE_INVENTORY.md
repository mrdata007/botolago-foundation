# Fantasy surface inventory and V2 migration baseline

Generated from the source, not from memory: route→component edges come from the actual
`@/components/fpl|fantasy` imports, and every count below is measured on comment-stripped
source so explanatory prose cannot inflate it.

## Why this exists

The owner's instruction was explicit: _do not redesign only the obvious landing screen; follow
the actual reachable user journey and find every Fantasy surface._ This is that list. A screen
lane that converts only what its route file renders will miss the sheets, gates, banners and
state components that the journey actually passes through.

## Baseline, 2026-09-21 (before migration)

| Scope              | files  | on kit   | `--fpl-*` | legacy radii | glass/surface | hardcoded colour | Tailwind type ramp | bare `tracking-*` | physical dir |
| ------------------ | ------ | -------- | --------- | ------------ | ------------- | ---------------- | ------------------ | ----------------- | ------------ |
| Fantasy routes     | 17     | 2/17     | 247       | 2            | 0             | 71               | 38                 | 13                | 0            |
| Fantasy components | 44     | 0/44     | 188       | 41           | 24            | 111              | 53                 | 15                | 0            |
| **Total**          | **61** | **2/61** | **435**   | **43**       | **24**        | **182**          | **91**             | **28**            | **0**        |

Two things worth reading off this table before planning any work:

- **Physical direction utilities are already zero.** The RTL discipline in this codebase holds.
  Do not undo it: logical properties only, and every `tracking-*` `ltr:`-prefixed.
- **Hardcoded colour, not `--fpl-*`, is the larger share of the debt in components.** Several
  files carry no Fantasy token at all and are simply written in raw Tailwind. Mapping
  `--fpl-*` onto the kit does not fix those; they need converting individually.

## Routes

| Route                        | on kit | `--fpl-*` | legacy classes | components it pulls in                                                                                                                                  |
| ---------------------------- | ------ | --------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/fantasy/top-players`       | —      | 35        | 46             | FantasyFrame, GameweekSelector, JerseyVisual, primitives                                                                                                |
| `/fantasy/players`           | —      | 40        | 12             | DifficultyBadge, FantasyFrame, JerseyVisual, PlayerStatusBadge, primitives                                                                              |
| `/fantasy/index`             | —      | 33        | 14             | FantasyFrame, FantasyScreenGate, primitives, useFantasyScreen                                                                                           |
| `/fantasy/players/$playerId` | —      | 30        | 15             | DifficultyBadge, FantasyFrame, JerseyVisual, PlayerStatusBadge, primitives                                                                              |
| `/fantasy/rankings`          | —      | 25        | 9              | FantasyFrame, MyRankCard, RankChangeIndicator, RankingsPodium, primitives                                                                               |
| `/fantasy/fixtures`          | —      | 23        | 9              | FantasyFrame, FantasyScreenGate, primitives, useFantasyScreen                                                                                           |
| `/fantasy/points`            | Y      | 13        | 5              | FantasyFrame, FantasyScreenGate, FplPitch, FplPlayerCard, SquadListTable, primitives, useFantasyScreen                                                  |
| `/fantasy/leagues`           | —      | 11        | 5              | FantasyFrame, FantasyScreenGate, primitives, useFantasyScreen                                                                                           |
| `/fantasy/leagues/join`      | —      | 12        | 0              | FantasyFrame, FantasyScreenGate, primitives, useFantasyScreen                                                                                           |
| `/fantasy/leagues/$leagueId` | —      | 7         | 2              | FantasyFrame, FantasyScreenGate, primitives, useFantasyScreen                                                                                           |
| `/fantasy/help`              | —      | 6         | 2              | FantasyFrame, primitives                                                                                                                                |
| `/fantasy/create`            | —      | 5         | 1              | AddPlayerScreen, FantasyFrame, FantasyScreenGate, PlayerActionSheet, SquadBuilderScreen, primitives, useFantasyScreen                                   |
| `/fantasy/profile`           | —      | 3         | 3              | FantasyFrame, FantasyScreenGate, primitives, useFantasyScreen                                                                                           |
| `/fantasy/team`              | —      | 4         | 1              | FantasyFrame, FantasyScreenGate, FplChipsRow, FplPitch, FplPlayerCard, PlayerActionSheet, SquadListTable, primitives, useFantasyScreen, useNextFixtures |
| `/fantasy/rules`             | Y      | 0         | 0              | LegacyFantasyPage                                                                                                                                       |
| `/fantasy/transfers`         | —      | 0         | 0              | AddPlayerScreen, FantasyFrame, FantasyScreenGate, PlayerActionSheet, SquadBuilderScreen, TransferConfirmScreen, primitives, useFantasyScreen            |
| `/fantasy`                   | —      | 0         | 0              | —                                                                                                                                                       |

## Components

Ordered by total debt. `0 / 44` are on the kit today.

| Component                     | `--fpl-*` | radii | glass | colour | type | tracking |
| ----------------------------- | --------- | ----- | ----- | ------ | ---- | -------- |
| `primitives.tsx`              | 36        | 0     | 0     | 10     | 0    | 2        |
| `MyRankCard.tsx`              | 27        | 0     | 0     | 5      | 10   | 1        |
| `TransferReviewPanel.tsx`     | 0         | 7     | 3     | 4      | 8    | 1        |
| `RankingsPodium.tsx`          | 15        | 1     | 0     | 4      | 1    | 0        |
| `FplPlayerCard.tsx`           | 12        | 0     | 0     | 8      | 0    | 0        |
| `AddPlayerScreen.tsx`         | 12        | 0     | 0     | 5      | 0    | 0        |
| `FantasyScreenGate.tsx`       | 11        | 0     | 0     | 6      | 0    | 0        |
| `PlayerPickerDrawer.tsx`      | 0         | 3     | 3     | 5      | 4    | 2        |
| `FantasyImportPrompt.tsx`     | 0         | 4     | 3     | 4      | 5    | 0        |
| `TransferConfirmScreen.tsx`   | 12        | 0     | 0     | 3      | 0    | 0        |
| `PlayerActionSheet.tsx`       | 9         | 0     | 0     | 5      | 0    | 0        |
| `FantasyAccessGate.tsx`       | 0         | 4     | 1     | 3      | 6    | 0        |
| `GameweekStatusStrip.tsx`     | 0         | 3     | 2     | 1      | 5    | 3        |
| `FantasySubNav.tsx`           | 0         | 2     | 3     | 6      | 2    | 0        |
| `FplChipsRow.tsx`             | 6         | 0     | 0     | 4      | 0    | 1        |
| `SquadBuilderScreen.tsx`      | 8         | 0     | 0     | 2      | 0    | 0        |
| `DifficultyBadge.tsx`         | 8         | 0     | 0     | 2      | 0    | 0        |
| `LeagueTable.tsx`             | 0         | 3     | 3     | 1      | 2    | 1        |
| `SquadListView.tsx`           | 0         | 1     | 0     | 5      | 2    | 2        |
| `SquadListTable.tsx`          | 6         | 0     | 0     | 3      | 0    | 0        |
| `PlayerStatusBadge.tsx`       | 6         | 0     | 0     | 2      | 0    | 1        |
| `GameweekSelector.tsx`        | 5         | 0     | 0     | 2      | 1    | 0        |
| `FplStatBar.tsx`              | 6         | 0     | 0     | 1      | 0    | 0        |
| `CloudSyncBanner.tsx`         | 0         | 1     | 0     | 4      | 1    | 0        |
| `FantasyOnboarding.tsx`       | 0         | 2     | 0     | 1      | 3    | 0        |
| `FplPitch.tsx`                | 5         | 0     | 0     | 0      | 0    | 0        |
| `FantasyChipCard.tsx`         | 0         | 1     | 1     | 2      | 0    | 1        |
| `SquadListToggle.tsx`         | 0         | 0     | 3     | 1      | 1    | 0        |
| `FantasyFrame.tsx`            | 2         | 0     | 0     | 2      | 0    | 0        |
| `ConflictBar.tsx`             | 0         | 3     | 0     | 1      | 0    | 0        |
| `FantasyMobileNav.tsx`        | 0         | 3     | 1     | 0      | 0    | 0        |
| `Pitch.tsx`                   | 0         | 0     | 0     | 4      | 0    | 0        |
| `PlayerShirt.tsx`             | 0         | 1     | 0     | 3      | 0    | 0        |
| `FantasyUnavailableState.tsx` | 0         | 0     | 1     | 0      | 2    | 0        |
| `PlayerNameplate.tsx`         | 0         | 0     | 0     | 2      | 0    | 0        |
| `RankChangeIndicator.tsx`     | 2         | 0     | 0     | 0      | 0    | 0        |
| `UnsavedBadge.tsx`            | 0         | 2     | 0     | 0      | 0    | 0        |

## States every lane must cover

Per screen, not just the happy path:

- **auth gate** — `FantasyAccessGate`, `FantasyScreenGate` (signed out, and signed in without a squad)
- **loading** — skeletons, not spinners, wherever a layout is known in advance
- **empty** — notably `/fantasy/rankings` before any gameweek has scored, which must show the
  "available after the first gameweek" copy rather than a spinner or an error
- **error** — `FantasyUnavailableState`, and the hub's "service did not respond" branch
- **offline / conflict** — `CloudSyncBanner`, `ConflictBar`, `UnsavedBadge`, `FantasyImportPrompt`
- **sheets and drawers** — `PlayerActionSheet`, `PlayerPickerDrawer`; every sheet today exposes an
  untranslated "Close" alongside the translated one

## Do not break these while redesigning

Presentation only. The squad architecture (2 GK / 5 DEF / 5 MID / 3 FWD), budget, club limit of
three, formation validity, captain and vice-captain, transfer accounting, chips, gameweek lifecycle,
scoring and league membership are proven logic. Wrap them in new presentation; do not reimplement
them, and do not replace a working RPC because the screen around it changed.

Two live behaviours that must survive, because they are already correct in production:

- GW1 has **seven** counting fixtures. FAR Rabat v Raja Casablanca is postponed and deliberately
  deferred out of the gameweek — it must not reappear in a fixture list, the difficulty grid or a
  player's upcoming fixtures through a stale frontend assumption.
- The deadline is `2026-09-24T18:30Z`, rendered **pinned to Africa/Casablanca** ("jeudi 24 sept.,
  19:30"). Any new date formatting must pass `timeZone: MATCH_TIME_ZONE`; a formatter without it
  follows the viewer's browser and will disagree with the card beside it. See BG-0100.
