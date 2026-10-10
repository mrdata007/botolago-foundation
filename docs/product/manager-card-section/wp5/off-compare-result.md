# Switch off: the Fantasy files WP5 edits render as before

Measured with `off-compare.mjs` (this folder). Two development servers of the same app on port
4185, one after the other, both with the build switch OFF (no `VITE_MANAGER_CARD_PREVIEW`), mock
data modes, the clock fixed at 2026-10-08T12:00:00Z, 390 x 844, light, French and Arabic where the
text differs:

- **base**: `claude/manager-card-section` at `be98884b` (detached worktree, its own `node_modules`);
- **branch**: `claude/manager-card-section-wp5`, the source of commit `802c738f` (every later commit only adds
  documents and pictures). It was measured twice: once before the last three source commits and again on
  this tree; both give the table below, digit for digit.

Each cell is the first 12 hex digits of the SHA-256 of the file, base then branch. `html` is the body
after hydration (scripts and the dev-only `data-tsd-source` attribute removed, one tag per line);
`ssr.html` is the server's own markup before any script ran (the one line that is the commit's own
sha, `botolago-release`, is left out of both); `meta.json` is the focused element, the
localStorage and sessionStorage keys, the title, the URL, every same-origin request made (method and
path) and the console errors.

The base was captured twice first: both runs are byte-identical, so the harness has no noise of its
own.

| scenario                   | html                        | ssr.html                    | meta.json                   |
| -------------------------- | --------------------------- | --------------------------- | --------------------------- |
| create-name-guest-fr       | 1e3b9dac9bf7 = 1e3b9dac9bf7 | 68b13bdafbe6 = 68b13bdafbe6 | 2614270d7f0a = 2614270d7f0a |
| create-name-signedin-fr    | ea6c9319fde7 = ea6c9319fde7 | 68b13bdafbe6 = 68b13bdafbe6 | cc30ecb9f682 = cc30ecb9f682 |
| create-squad-guest-fr      | 9252cb3a6922 = 9252cb3a6922 | 68b13bdafbe6 = 68b13bdafbe6 | 1c22b6b0f08e = 1c22b6b0f08e |
| hub-guest-ar               | d78211cdb0f8 = d78211cdb0f8 | 0783cb70ccea = 0783cb70ccea | 7ac83320db0b = 7ac83320db0b |
| hub-guest-fr               | b0bebdd1a6ce = b0bebdd1a6ce | 0783cb70ccea = 0783cb70ccea | 140c45c6f27c = 140c45c6f27c |
| hub-owner-ar               | f6ba35b496e7 = f6ba35b496e7 | 0783cb70ccea = 0783cb70ccea | fdcda65c14b2 = fdcda65c14b2 |
| hub-owner-fr               | 5d593416d481 = 5d593416d481 | 0783cb70ccea = 0783cb70ccea | 57aa3ec10013 = 57aa3ec10013 |
| hub-owner-prize-welcome-ar | 4e06b7b323c9 = 4e06b7b323c9 | 0783cb70ccea = 0783cb70ccea | 02f168c1006f = 02f168c1006f |
| hub-owner-prize-welcome-fr | aca669ffec25 = aca669ffec25 | 0783cb70ccea = 0783cb70ccea | c2638905d2f6 = c2638905d2f6 |
| league-private-ar          | 2aae79ecf2e9 = 2aae79ecf2e9 | 6009d21d7da7 = 6009d21d7da7 | f56784a89af8 = f56784a89af8 |
| league-private-fr          | fbe93c14ff4f = fbe93c14ff4f | 6009d21d7da7 = 6009d21d7da7 | 4810c22b4abf = 4810c22b4abf |
| league-public-ar           | b3ae8e31de25 = b3ae8e31de25 | 6009d21d7da7 = 6009d21d7da7 | ee6996f9b0e7 = ee6996f9b0e7 |
| league-public-fr           | 1aba1ce87919 = 1aba1ce87919 | 6009d21d7da7 = 6009d21d7da7 | 3478afae60a9 = 3478afae60a9 |
| points-fr                  | fdb108acf2c7 = fdb108acf2c7 | b5d98d62f95e = b5d98d62f95e | 74f312756690 = 74f312756690 |
| rankings-ar                | b45926e0add5 = b45926e0add5 | 8ab392d5f7b4 = 8ab392d5f7b4 | fb09b8305aac = fb09b8305aac |
| rankings-fr                | c070ebb16824 = c070ebb16824 | 8ab392d5f7b4 = 8ab392d5f7b4 | f171bcd7f026 = f171bcd7f026 |
| team-ar                    | 3694642d0557 = 3694642d0557 | 766d27a303a8 = 766d27a303a8 | ac527fe6e61c = ac527fe6e61c |
| team-captain-sheet-ar      | 40337d34ee22 = 40337d34ee22 | 766d27a303a8 = 766d27a303a8 | 8b12f6e81431 = 8b12f6e81431 |
| team-captain-sheet-fr      | 08e46911d007 = 08e46911d007 | 766d27a303a8 = 766d27a303a8 | 6352d3a7b9b7 = 6352d3a7b9b7 |
| team-fr                    | 8d469ac65aed = 8d469ac65aed | 766d27a303a8 = 766d27a303a8 | 3bea6c129bd9 = 3bea6c129bd9 |
| team-substitution-bar-fr   | 7434d8d24bdc = 7434d8d24bdc | 766d27a303a8 = 766d27a303a8 | 3bea6c129bd9 = 3bea6c129bd9 |
| transfers-ar               | 0295caf8e04a = 0295caf8e04a | eb8e2add695b = eb8e2add695b | c47941b5e18b = c47941b5e18b |
| transfers-confirm-fr       | b4b4a229614b = b4b4a229614b | eb8e2add695b = eb8e2add695b | 2e8719742eda = 2e8719742eda |
| transfers-fr               | 08734daa4eb7 = 08734daa4eb7 | eb8e2add695b = eb8e2add695b | 2e8719742eda = 2e8719742eda |

**Result: all 24 snapshots identical in all three kinds.** No new request (no module of
`src/components/manager-card/inline/**` or `gradins-inline` is asked for), no new storage key, the
same focus (the builder's team name is still the focused field), the same markup, the same console.

Scenarios: the hub (visitor, manager, manager with the prize welcome open), the builder (squad step,
name step for a visitor and for a signed-in account, with where focus lands), the team page (plain,
captain sheet, substitution bar), transfers (plain, confirmation), rankings, points, a private and a
public league page. Not reachable in mock mode: `FantasyImportPrompt` (it needs a cloud account with
an empty cloud squad), whose two edits are one inert hook call, a `cardLive` branch that is not taken,
and the new `track("fantasy_team_created")` (analytics only, shipped on its own).
