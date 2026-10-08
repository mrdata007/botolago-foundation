# Onboarding captures

Screenshots of the onboarding screens (`onboarding.html`), made by `tools/capture-onboarding.sh`. Fictional sample data only; Semelle captures carry the label « Test culturel en attente » (no onboarding moment ships on Semelle until its cultural test passes).

**488 files, 10.5 MB** (WebP, quality 80).

## How they were made

```sh
cd design-lab/manager-cards-claude
PW_CORE=<playwright-core/index.mjs> CHROME=<chrome> bash tools/capture-onboarding.sh   # everything
bash tools/capture-onboarding.sh lead|others|desktop|motion|2x                          # one set
```

Each file is one `tools/capture.mjs` call, `onboarding.html?<direction>&screen=<id>&variant=<key>&lang=<fr|ar>&scheme=<light|dark>`, converted with `ffmpeg -c:v libwebp -quality 80`. Phone screens are the 390 x 844 viewport at device pixel ratio 1 (2 in `2x/`), reduced motion on, animations frozen. The t = 0 motion proofs come from `tools/capture-motion.mjs`. The per-capture console errors and elements outside the frame are in `capture.log` (one JSON line each; the S11 `image` lines list parts of the share image's SVG that its own SVG clips, which is not an escape).

## Files

| Folder | Direction | What |
|---|---|---|
| `07-v2/` | Écharpe v2 (the lead) | 236 files (5944 KB): every screen and variant, fr and ar, light and dark, 390 x 844 at 1x; `2x/` has the eight key moments at 2x; `D1-*` are the desktop screens at 1440 |
| `03-v2/` | Porte-clés v2 | 57 files (1030 KB): S05, S06, S08, S09, S10, S14: fr light, ar light, ar dark |
| `01/` | Lucarne | 57 files (1045 KB): the same six screens |
| `05-v2/` | Semelle v2 | 57 files (1116 KB): the same six screens, with the cultural-test label |
| `t1-touchline/` | Touchline (reworked) | 57 files (1079 KB): the same six screens |
| `motion/` | all five | 24 files (561 KB): S05 new-serial and S08 fresh at t = 0 with motion on, and under reduced motion |

File names: `<screen>-<variant>-<fr|ar>-<light|dark>.webp`. Motion proofs: `motion/<direction>/<screen>-<variant>-<lang>-<scheme>-<t0-motion|reduced>.webp`.

## By moment (Écharpe set; the other directions reuse the names)

### M1a

**S01** · Hub guest intro with the fifth point

- `S01-points` (fixture `guest`: Open intro scrolled to “how it works”: the card is the fifth point, after the deadline): 4 files in 07-v2
- `S01-fold` (fixture `guest`: Unscrolled: the first screen is the app's own, the card adds nothing above the fold): 4 files in 07-v2

### M1b

**S02** · Name step: the line and the unnamed token, keyboard closed

- `S02-guest` (fixture `guest`: Guest: token drawn locally, no name, a dash. The field is empty and unfocused (no autofocus)): 4 files in 07-v2
- `S02-signedNoTeam` (fixture `signedNoTeam`: Signed in, no team: the token carries the card name; the club stays unresolved (own material)): 4 files in 07-v2

### M1c

**S03** · Register hint; profile setup steps 1 and 2 with the live token

- `S03-register` (fixture `guest`: Register: one hint under “Nom complet”): 4 files in 07-v2
- `S03-name` (fixture `guest`: Setup step 1: the name typed, the token follows it (guest journey, account just created)): 4 files in 07-v2
- `S03-club` (fixture `clubNull`: Setup step 2: a club row tapped. Decision 5: the card is not recoloured and nothing promises a colour): 4 files in 07-v2
- `S03-skipped` (fixture `clubNull`: Setup step 2: club skipped (nothing chosen). The card stays in its own material): 4 files in 07-v2
- `S03-clubResolved` (fixture `clubNull`: CONDITIONAL, not shippable as is: only once the server resolves the club (decision 5): token recoloured, plan's club hint): 4 files in 07-v2

**S04** · Back in the builder on the name step, focus on save

- `S04-restored` (fixture `guest`: Draft restored, complete and valid: opens on the name step, focus on “Entrer l'effectif”): 4 files in 07-v2

### M2

**S05** · Team page with the card's birth panel

- `S05-new` (fixture `born0`: New: squad just saved, serial not assigned): 8 files in 07-v2, 2 at 2x, 24 in the other directions
- `S05-new-serial` (fixture `born0Serial`: New: serial assigned, the serial line shows): 4 files in 07-v2, 12 in the other directions
- `S05-arrival` (fixture `forming1`: Arrival, forming: existing manager, 1 of 3 counted): 4 files in 07-v2, 12 in the other directions

### M3a · M3b

**S06** · Hub: the card block while the card forms

- `S06-forming1` (fixture `forming1`: Forming, 1 of 3, next round and deadline): 4 files in 07-v2, 2 at 2x, 12 in the other directions
- `S06-eve2` (fixture `eve2`: Eve: last round before the first rating (J7 locked)): 4 files in 07-v2, 12 in the other directions
- `S06-notFinal2` (fixture `notFinal2`: Round over, not final yet): 4 files in 07-v2, 12 in the other directions
- `S06-insufficient3` (fixture `insufficient3`: 3 of 3 counted, the rating waits for a stat): 4 files in 07-v2, 12 in the other directions
- `S06-late` (fixture `forming1`: Late signer: season closed below the minimum): 4 files in 07-v2, 12 in the other directions

### M3c · M3d · M3e · M3f

**S07** · Formation on the screens where it is earned

- `S07-rank` (fixture `forming1`: M3c: rankings, my position with the 44px token and 1/3): 4 files in 07-v2
- `S07-recap` (fixture `forming1`: M3d: Ma journée BotolaGO, the private line): 4 files in 07-v2
- `S07-hint-cap` (fixture `forming1`: M3e: captain action sheet, open after the tap): 4 files in 07-v2
- `S07-hint-sel` (fixture `forming1`: M3e: first substitution, a player picked): 4 files in 07-v2
- `S07-hint-trf` (fixture `forming1`: M3e: first visit to Transfers): 4 files in 07-v2
- `S07-first-transfer` (fixture `forming1`: M3f: transfer confirmation, TRF line): 4 files in 07-v2

### M4a, M11

**S08** · Hub hero: the first rating

- `S08-fresh` (fixture `rated`: Fresh: the first rating after the third final journée): 4 files in 07-v2, 2 at 2x, 12 in the other directions
- `S08-arrival` (fixture `launchArrival`: Launch: an existing manager, already rated): 4 files in 07-v2, 12 in the other directions
- `S08-coalesced` (fixture `returning`: Returning: one coalesced hero, first 84 at J3, today 81): 4 files in 07-v2, 12 in the other directions
- `S08-coalescedProv` (fixture `returning`: Returning one week after: still provisional (chip and line present)): 4 files in 07-v2, 12 in the other directions

### M4b

**S09** · Detail sheet: where the 84 comes from

- `S09-rated` (fixture `rated`: All four stats): 4 files in 07-v2, 2 at 2x, 12 in the other directions
- `S09-ratedTrfNull` (fixture `ratedTrfNull`: TRF empty: a dash and its reason): 4 files in 07-v2, 12 in the other directions

### M5

**S10** · League page: band, rows in points order, head-to-head sheet

- `S10-band` (fixture `rated`: League page: band (names only), rows in points order, compare hint): 4 files in 07-v2, 2 at 2x, 12 in the other directions
- `S10-h2h` (fixture `rated`: Head-to-head open, a rated friend (both provisional)): 12 files in 07-v2, 36 in the other directions
- `S10-h2h-forming` (fixture `rated`: Head-to-head open, a friend still forming (2/3): dashes, never 0): 4 files in 07-v2, 12 in the other directions
- `S10-h2h-dash` (fixture `rated`: Head-to-head open, a friend with one empty stat (TRF)): 4 files in 07-v2, 12 in the other directions

### M6

**S11** · Share sheet and the 1080 x 1920 image

- `S11-sheet` (fixture `rated`: Share sheet over the hub: the message names the league (tu)): 12 files in 07-v2
- `S11-sheet-solo` (fixture `rated`: Share sheet, a manager with no league: the plain message): 4 files in 07-v2
- `S11-sheet-web` (fixture `rated`: Share sheet where the phone cannot share a file: a download in its place): 4 files in 07-v2
- `S11-image` (fixture `rated`: The share image at 360 x 640 (exports at 1080 x 1920), Provisoire on it): 4 files in 07-v2, 2 at 2x

### M7

**S12** · Provisional cleared: one line, the chip gone

- `S12-cleared` (fixture `cleared`: The hub block, one line, no hero, no motion): 4 files in 07-v2

### M8

**S13** · Tier up hero, tier down line

- `S13-tierUp` (fixture `tierUp`: Up, first time at CHAMPION: the hub hero): 4 files in 07-v2
- `S13-tierDown` (fixture `tierDown`: Down: one line on the card page, no hero, no motion): 4 files in 07-v2

### M9

**S14** · Founder hero

- `S14-founder` (fixture `founder`: Founder granted: ·26 after the name, here only): 4 files in 07-v2, 2 at 2x, 12 in the other directions

### M10

**S15** · Season closed hero and the new season's block

- `S15-closed` (fixture `seasonClosed`: Season 2026/27 closed: the hub hero, once (86, it stays on the card)): 4 files in 07-v2
- `S15-started` (fixture `seasonStarted`: Season 2027/28: counter 0/3 and last season's 86 labelled 2026/27, never a dash): 4 files in 07-v2

### M12

**S16** · Card page: history, « Revoir » and a replay

- `S16-page` (fixture `rated`: The card page right after the first rating (84, Provisoire)): 4 files in 07-v2, 2 at 2x
- `S16-history` (fixture `rated`: Three rounds on (J10, 87): the history, newest first, and « Revoir »): 4 files in 07-v2
- `S16-replay` (fixture `rated`: Replay frame 1: J7's stored 84 and its round, today's 87 in the first line): 4 files in 07-v2

### edges

**S17** · Edges: deletion line, offline card page, feature off

- `S17-deletion` (fixture `rated`: Profile deletion dialog, after the tap: the card line with its serial): 4 files in 07-v2
- `S17-deletionNoSerial` (fixture `rated`: Same dialog, serial null: the line without the serial part): 4 files in 07-v2
- `S17-offline` (fixture `offline`: Card page, the read failed: the plan's sentence and « Réessayer », no stale number): 4 files in 07-v2
- `S17-featureOff` (fixture `featureOff`: Feature off: the hub exactly as today, no card, no "coming soon"): 4 files in 07-v2

### M4c

**S18** · v2, only if measured: the three-frame story (PepitesReveal shell)

- `S18-frame1` (fixture `rated`: v2, only if measured · frame 1 of 3: the number): 4 files in 07-v2
- `S18-frame2` (fixture `rated`: v2, only if measured · frame 2 of 3: the tiles): 4 files in 07-v2
- `S18-frame3` (fixture `rated`: v2, only if measured · frame 3 of 3: the league): 4 files in 07-v2

### M4a, M12

**D1** · Desktop 1440: the hub with the hero, and the card page (desktop 1440)

- `D1-hub` (fixture `rated`: The hub in the 672px Fantasy column, the first-rating hero under Valeur / Banque / Rang): 2 files in 07-v2
- `D1-card` (fixture `rated`: The card page in the same column): 2 files in 07-v2

## Motion proof

`motion/<direction>/…-t0-motion.webp` is the screen with `motion=1` under `prefers-reduced-motion: no-preference`, every animation rewound to time 0 and paused: the first painted frame of the beat. The number and the serial are there, at full opacity, in every one. `…-reduced.webp` is the same screen under `prefers-reduced-motion: reduce` (no animation, no beat). The measured version of this is criterion 5 in `CHECKS.md`.

- `motion/01/S05-new-serial-fr-light-reduced.webp`
- `motion/01/S05-new-serial-fr-light-t0-motion.webp`
- `motion/01/S08-fresh-fr-light-reduced.webp`
- `motion/01/S08-fresh-fr-light-t0-motion.webp`
- `motion/03-v2/S05-new-serial-fr-light-reduced.webp`
- `motion/03-v2/S05-new-serial-fr-light-t0-motion.webp`
- `motion/03-v2/S08-fresh-fr-light-reduced.webp`
- `motion/03-v2/S08-fresh-fr-light-t0-motion.webp`
- `motion/05-v2/S05-new-serial-fr-light-reduced.webp`
- `motion/05-v2/S05-new-serial-fr-light-t0-motion.webp`
- `motion/05-v2/S08-fresh-fr-light-reduced.webp`
- `motion/05-v2/S08-fresh-fr-light-t0-motion.webp`
- `motion/07-v2/S05-new-serial-ar-dark-reduced.webp`
- `motion/07-v2/S05-new-serial-ar-dark-t0-motion.webp`
- `motion/07-v2/S05-new-serial-fr-light-reduced.webp`
- `motion/07-v2/S05-new-serial-fr-light-t0-motion.webp`
- `motion/07-v2/S08-fresh-ar-dark-reduced.webp`
- `motion/07-v2/S08-fresh-ar-dark-t0-motion.webp`
- `motion/07-v2/S08-fresh-fr-light-reduced.webp`
- `motion/07-v2/S08-fresh-fr-light-t0-motion.webp`
- `motion/t1-touchline/S05-new-serial-fr-light-reduced.webp`
- `motion/t1-touchline/S05-new-serial-fr-light-t0-motion.webp`
- `motion/t1-touchline/S08-fresh-fr-light-reduced.webp`
- `motion/t1-touchline/S08-fresh-fr-light-t0-motion.webp`
