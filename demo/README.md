# BotolaGO pitch demo

A clickable demo for pitch meetings: the real BotolaGO screens, running on
sample data, inside a phone on a presenter page with a step-by-step guide.

**Seven stops:** welcome → Fantasy hub → pick your 11 → your points → Botola
Pro table → managers' leaderboard → sponsor placements.

## What is real and what is sample

| Real (from the product)                                                                                                                                                                                                           | Sample (generated for the demo)                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Every screen component, token, font, photo and illustration, imported from `src/`                                                                                                                                                 | Twelve rounds of Botola matches (seeded, so identical on every device)                              |
| The 16 clubs of 2026/27 (French and Arabic names, crests) and the 603 Fantasy players (names, clubs, positions, prices), copied from production into `src/data/catalog.json`                                                      | Minutes, goals, assists, cards, saves, and so every point and every form figure                     |
| The scoring rules and scoring function (`scorePlayerFixture`, `FANTASY_RULES_V1`), the league-table computation (`computeLeagueTable`), the rank and ordinal helpers, the prize catalog of the prize migration, both dictionaries | 2,764 invented managers on the leaderboard; the partner name and logo, which the presenter types in |

The demo never reads or writes a BotolaGO database: every data service is
pinned to its local mock (`vite.config.ts`). The presenter page labels the
data as demo data under the phone.

The full game builds a fifteen-player squad and lines up eleven each
gameweek. The demo asks for the eleven only, which is what scores.

## Use it

```sh
bun run demo:dev        # the app alone, http://127.0.0.1:4310
bun run demo:build      # demo/dist/site: index.html (presenter), app.html, preview.html
bun run demo:typecheck
```

`demo/dist/site/preview.html` next to `app.html` is the whole demo; any
static host serves it, and `app.html` alone also works offline from a file.
`index.html` is the same presenter page without the document wrapper, for
hosts that add their own (the published Artifact).

On a large screen the presenter shows the phone beside the guide (arrow keys
change step). On a phone the app fills the screen and the guide opens from
the bar at the top. "Compléter l'équipe" fills the eleven in one tap;
"Recommencer la démo" starts again. The partner panel takes a name, a colour
and a logo file, and every placement updates live.

## Files

- `src/App.tsx`: providers and routes (the product's own paths, on a hash router)
- `src/screens/`: one file per screen, each composed as its route in `src/routes/` is
- `src/data/world.ts`: the catalog and the sample season; `board.ts`: the managers
- `src/state.tsx`: the visitor's team, captain, name and sponsor (this device only)
- `src/bridge.tsx`: messages between the app and the presenter page
- `presenter/presenter.html`: the presenter page; `scripts/build.ts` fills it in
- `scripts/refresh-catalog.ts`: re-reads the clubs, crests and players from the
  live catalog (read-only, public RPCs), for example after the transfer window
