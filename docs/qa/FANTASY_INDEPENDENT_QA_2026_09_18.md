# Fantasy — independent QA pass against the FPL Figma reference (2026-09-18)

Scope: every implemented Fantasy state (FPL-001…027 plus the derived states)
re-compared against the original boards of Figma file `CMGPbsWSIhMAwc6xLF6y7b`,
rendered from the running application (local dev server on the production
Supabase project), corrected where the implementation materially differed, and
re-tested end to end through the real UI controls on mobile (390×844) and
desktop (1280×800) viewports. Previous PASS statuses were not trusted.

Security precondition: the checked-out `eslint.config.js` was verified before
any lint run (72 lines, no line longer than 200 characters, no `_0x…`,
`createRequire` or `global.i` markers in tracked files).

## 1. Reference inventory (re-opened, not assumed)

The page "Fantasy Premier League" contains 52 top-level boards / loose frames.
Every frame was inspected (board screenshots for the sections, individual
screenshots for the six loose frames 1:3, 1:254, 1:255, 1:256, 1:292, 1:297 and
the 29-frame Onboarding board).

| Board (node)                                                                | Frames | Fantasy? | Mapped IDs                                                                                                       |
| --------------------------------------------------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| Transferring a player (1:165)                                               | 8      | yes      | FPL-001 → FPL-007                                                                                                |
| Activating a chip (1:174)                                                   | 3      | yes      | FPL-008 → FPL-010                                                                                                |
| Fixture difficulty rating (1:178)                                           | 6      | yes      | FPL-011 → FPL-014                                                                                                |
| League detail (1:185)                                                       | 3      | yes      | FPL-015 → FPL-017                                                                                                |
| Team detail (1:189)                                                         | 4      | yes      | FPL-018, FPL-019                                                                                                 |
| Join a League (1:194)                                                       | 5      | yes      | FPL-020 → FPL-023                                                                                                |
| Help & Rules (1:200)                                                        | 3      | yes      | FPL-024, FPL-025                                                                                                 |
| Team profile (1:204)                                                        | 3      | yes      | FPL-026, FPL-027                                                                                                 |
| Onboarding (1:2), loose 1:3                                                 | 30     | no       | PL account onboarding: favourite team, follows, emails, personal details, notifications, create account, welcome |
| Manage account / More / reset (1:232, 1:254–256, 1:292, 1:297)              | 8      | no       | PL account management                                                                                            |
| All other boards (news, players, stats, match centre, quiz, awards, legal…) | ≈100   | no       | Premier League companion app                                                                                     |

**Answer to the squad-building question.** The file contains **no** dedicated
new-user squad-selection boards: no "pick your squad" pitch with empty slots,
no team-name step, no captain-selection confirmation. The only Fantasy surfaces
for adding players are the Transfers frames (1:166–1:173). The FPL iOS app
itself reuses the Transfers composition for first-time selection, which is what
BotolaGO does: FPL-D01 (empty squad), FPL-D02 (team name) and FPL-D03 (player
action sheet) are derived from FPL-002/003/004, not from missing boards. The
27-state inventory is therefore complete for the Fantasy product; nothing in the
file was overlooked. 27 reference states → 27 implemented states + 6 derived
states = 33 BotolaGO states.

## 2. Discrepancies found and corrected

| ID(s)                  | Reference (Figma)                                                                                                                         | BotolaGO before this pass                                                   | Correction                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| FPL-002, 004, 005, D01 | Whole 15-man squad on the pitch in four rows 2 GK / 5 DEF / 5 MID / 3 FWD, **no bench strip**                                             | 11 starters + labelled bench strip (Pick Team layout)                       | `SquadBuilderScreen` lays out all 15 slots in 2-5-5-3; bench strip removed; cards shrink so five fit at 390 px                          |
| FPL-002, 005           | Cards carry the **price** on the sub plate                                                                                                | Next-fixture label                                                          | Price sub plate on Transfers and squad selection                                                                                        |
| FPL-002                | No permanent remove badge; tapping a card opens its actions                                                                               | Pink “×” on every card                                                      | Removed; tap → action sheet (“Transfer out” / “Player information”, plus “Remove” during squad selection, “Undo transfer” for incoming) |
| FPL-004                | Incoming-first flow: Add Player → choose player → non-matching positions dimmed + **“Incoming Player” strip** → tap the player who leaves | Only remove-first flow                                                      | Implemented: unlocked Add Player from the bottom bar, replace mode with dimming, Incoming Player strip with cancel, budget/club checks  |
| FPL-002 vs FPL-004     | “Reset” appears only once changes exist                                                                                                   | Always visible (disabled)                                                   | Hidden until dirty; green label on ink like the reference                                                                               |
| FPL-002/005 stat bar   | Four single-line captions over ink pills, green value text                                                                                | “Transferts gratuits” wrapped onto two lines, misaligned pill; cyan values  | Single-line captions, bottom-aligned pills, green values                                                                                |
| FPL-007                | Points Overview card anchored to the bottom, purple “Edit Transfers” / ink “Confirm” with green label                                     | Card directly under the note, ink Edit / gradient Confirm, “1 transfert(s)” | Bottom-anchored card, secondary-blue Edit, ink Confirm with green label, proper singular/plural banner                                  |
| FPL-009                | Header becomes “✕ Cancel … ✓ Confirm” (Back disappears)                                                                                   | Back still shown, title truncated                                           | Cancel pill replaces Back; smaller title when both pills are present                                                                    |
| FPL-011–014            | Team column ≈ 40 % width, fixed-width gameweek cells                                                                                      | Team column stretched to ≈ 70 % with a single gameweek                      | Fixed 150 px team column and 84 px gameweek cells                                                                                       |
| FPL-006                | Player names readable next to Form / Current / Selling / Purchase                                                                         | Names truncated after ~9 characters                                         | Narrower numeric columns in the four-column list                                                                                        |
| FPL-001                | “Pick Team” / “Transfers” buttons on one line                                                                                             | “Composer l’équipe” wrapped                                                 | 13 px, no-wrap                                                                                                                          |
| FPL-001 News & Video   | Every card has a photo                                                                                                                    | Gradient blocks (French feed has no hero images in production)              | Cards prefer illustrated articles; when none exist the card is text-only (no invented photo, no arbitrary gradient)                     |

Playwright regression updated for the new Transfers flow
(`tests/e2e/fantasy.journey.e2e.ts`: tap card → “Transférer ce joueur” → Add
Player).

## 3. Side-by-side verdicts after correction

Evidence: `docs/qa/fpl-screens/*.png` (fr), `ar_*.png` (RTL), `anon_*.png`
(unauthenticated), `journey/mobile_*.png` and `journey/desktop_*.png` (full
product journeys). Reference boards were viewed at 1400 px height.

| ID      | Verdict | Remaining visible difference (if any)                                                                                                  |
| ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| FPL-001 | PASS    | News cards are text-only in French (no hero images in the production feed); Arabic shows photos. Botola brand mark instead of PL lion. |
| FPL-002 | PASS    | —                                                                                                                                      |
| FPL-003 | PASS    | “Prix actuel” header wraps to two lines (French label length).                                                                         |
| FPL-004 | PASS    | Incoming strip shows one summary line instead of the four-column Form/Current/Selling/Purchase row.                                    |
| FPL-005 | PASS    | —                                                                                                                                      |
| FPL-006 | PASS    | —                                                                                                                                      |
| FPL-007 | PASS    | Wildcard / Free Hit buttons are enabled (chips available) where the reference shows them disabled (unavailable).                       |
| FPL-008 | PASS    | Bench strip is full-width instead of an inset rounded panel.                                                                           |
| FPL-009 | PASS    | —                                                                                                                                      |
| FPL-010 | PASS    | —                                                                                                                                      |
| FPL-011 | PASS    | Long club names truncate in the 150 px column.                                                                                         |
| FPL-012 | PASS    | —                                                                                                                                      |
| FPL-013 | PASS    | —                                                                                                                                      |
| FPL-014 | PASS\*  | Only one gameweek is published in production, so horizontal scrolling cannot be exercised with real data (see limitations).            |
| FPL-015 | PASS    | Standalone route has a Back header (the reference shows the section inside the hub scroll, which BotolaGO also has).                   |
| FPL-016 | PASS\*  | Table rows cannot be shown until standings exist (no results yet); empty state shown. “Leave league” button has no reference.          |
| FPL-017 | PASS    | —                                                                                                                                      |
| FPL-018 | PASS\*  | Points plates show “—” until the first calculation.                                                                                    |
| FPL-019 | PASS\*  | Same as FPL-018.                                                                                                                       |
| FPL-020 | PASS    | —                                                                                                                                      |
| FPL-021 | PASS    | —                                                                                                                                      |
| FPL-022 | PASS    | Two helper lines under the Classic / Head-to-head control that the reference does not have.                                            |
| FPL-023 | PASS\*  | List rendered from real memberships; empty until a join is pending.                                                                    |
| FPL-024 | PASS    | —                                                                                                                                      |
| FPL-025 | PASS    | —                                                                                                                                      |
| FPL-026 | PASS    | Chip badges show “PLAY” outlines (available) where the reference shows ACTIVE / UNAVAILABLE.                                           |
| FPL-027 | PASS    | —                                                                                                                                      |

\* PASS with a data-dependent state that real production data cannot populate
yet; the layout is implemented and unit / e2e covered.

## 4. Manual product journey (real controls, no shortcuts)

Script `journey.mjs` (kept in the session scratchpad; log copies in
`docs/qa/fpl-screens/journey/`). Every step clicks what a user sees: login form,
Fantasy tab, hub buttons, empty shirts, Add Player rows, the player sheet,
Suivant, team-name field, Entrer l’effectif, Retour links, Transferts, Confirmer,
Liste tab, Gérer les ligues, Rejoindre des ligues, Aide & Règles, Composer
l’équipe.

| Viewport         | Account                                  | Steps | Result                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ---------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mobile 390×844   | `e2e.fantasy.newcomer@…` (no team)       | 24    | 24/24 product steps OK: 15 players picked one by one, remove via sheet, Add Player (any position), captain + vice, name “QA Botola XI”, save, reload keeps 15, transfer confirmed and persisted, points, leagues, join, help, back to team, no page errors. (One check in the first run mis-counted the vice badge because of a case-sensitive label match; the screenshot `mobile_07_create_captain.png` shows both C and V.) |
| Desktop 1280×800 | `e2e.fantasy.recovery@…` (existing team) | 20    | 20/20 OK: hub CTA opens Pick Team, reload keeps 15, transfer confirmed and persisted, points, leagues, join, help, back to team, no page errors.                                                                                                                                                                                                                                                                               |

## 5. Automated results (final tree)

| Check                                        | Result                                  |
| -------------------------------------------- | --------------------------------------- |
| `bun run typecheck`                          | clean                                   |
| `bun test`                                   | 622 pass, 0 fail                        |
| `bun run lint` (config verified clean first) | 0 errors, 12 pre-existing warnings      |
| `bun run build`                              | success                                 |
| Playwright, all suites, production data      | 18 passed, 3 skipped (staging inactive) |

## 6. Remaining functional limitations

1. One gameweek published (provider has only round 1); FDR scrolling, points
   gameweek navigation and league standings cannot be exercised with real data.
2. No results yet: points plates show “—”, league tables are empty.
3. French news feed carries no hero images in production; hub cards are
   text-only until the editorial pipeline attaches heroes (Arabic already has
   them).
4. Head-to-head public leagues are not offered by the backend (control shown
   disabled, as documented on screen).
