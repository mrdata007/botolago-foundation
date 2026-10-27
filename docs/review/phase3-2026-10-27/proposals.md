# Phase 3 proposals: six redesigns, five sponsor spots

Nothing in the repo was changed or committed. Everything is in `/tmp/claude-0/-home-user-botolago-foundation/28165697-c0db-582d-a9c4-20a0f74bacc1/scratchpad/phase3/` (called `phase3/` below).
Design system: `phase3/design-system.md`. Prototypes: `phase3/proto/<screen>.html` (French) and `<screen>.ar.html` (Arabic, `dir="rtl"`), built in code with the real tokens (`proto/tokens.css` is copied from `src/styles.css`) and the real fonts. Open any file in a browser; the small black bar at the top has the language switch and "Sans sponsor" / "Avec MARQUE". Add `?sponsor=off`, `?theme=dark` or (leaderboard) `?state=guest` to the address.
Screenshots: `phase3/shots/`. Name pattern: `before-<screen>-<fr|ar>-<m|d>[-full].png` and `after-<screen>[-variant]-<fr|ar>-<m|d>[-full].png`; `m` = 390px, `d` = 1280px, `-full` = whole page, no suffix = first screen.
BEFORE = this tree's dev server (mock data, "MODE DEMO" badge, port 5593, started from /home/user/botolago-foundation, git HEAD 6c4526c, working tree clean). AFTER = my prototypes.

**Data in the prototypes.** Club names, the table, the form of the top five, the next fixtures (Raja-Hassania 18:00, FAR-Ittihad 20:00, Maghreb Fès-Berkane) and the three news headlines are real, read from 4 anonymous loads of botolago.com on 27 Oct (`/`, `/matches`, `/matches/standings`, `/fantasy/players`). The live state (Raja 1-1 Hassania, 63') is a simulation, because nothing was live on 27 Oct. Players and Fantasy manager names are invented. Arabic club names are my own and need a native check.
The Fantasy pitch and jerseys are NOT redrawn: `proto/assets/pitch-fr.png` and `pitch-ar.png` are screenshots of today's pitch element from this tree, embedded as an image.

Effort: S = hours, M = days, L = a week or more.

---------------------------------------------------------------------
## Round 2 (Lead review of round 1: REVISE). All items below are FIXED in the prototypes; screenshots re-shot (before shots unchanged).

Measurement, re-run after the fixes (`phase3/measure.cjs`, `phase3/measure2.cjs`, `phase3/contrast.cjs`; results `measure-results.json`, `measure2-results.json`, `contrast-results.json`). At 320, 360, 390 (and 1280), French and Arabic, all 7 pages: 0 elements outside the screen, 0 text under 12px (FR) / 13px (AR), 0 tap targets under 44px. Plus: landscape 640x360 and 568x320, fixed bars take 27 % and 30 % (96px) on all six main screens.

| # | Item | What changed | Proof |
|---|---|---|---|
| FIXED 1 | Team picker: pitch no lower than ~400px; unsaved bar | Challenge card moved below the pitch (one line). Title and deadline are one slim row. The unsaved-changes bar is gone: "Enregistrer" with a count badge sits in that top row, so nothing covers the captain or forward row. Pitch top, 390 wide: before 345, now **342 (FR) and 362 (AR)**; same at 360 and 320 | `after-team-fr-m.png`, `after-team-ar-m.png`, `measure2-results.json` ("pitchTop", "fixedBars": 0) |
| FIXED 2 | Bench Boost / Free Hit visible, not cut | Two full-width buttons in one row under the title, at 320, 360 and 390 (measured inside the screen, text not clipped) | same files |
| FIXED 3 | Home: Fantasy deadline in the first screen | New one-line strip under the live strip: "Fantasy J5 : plus que 21 h 04 · Jouer". Bottom at y=218 on 390 | `after-home-fr-m.png`, `after-home-ar-m.png` |
| FIXED 4 | Home chips | 2x2 grid of 44px tiles, labels Classement / Calendrier / Top managers / Pronostics (Arabic: الترتيب / المباريات / أفضل المدربين / التوقعات); none truncated at 320, 360, 390 | `measure2-results.json` ("chips") |
| FIXED 5 (R1) | Standings AR header | `+/-` isolated in `<bdi dir="ltr">`; Arabic short labels with full words in `title` (ل, ن); 4px padding each side; fits 320 with no overflow | `after-standings-ar-m.png` |
| FIXED 6 (R2) | Language bar | The French sentence in the Arabic page has `lang="fr" dir="ltr"`; the Arabic word in the French page is `<bdi lang="ar">` with the `?` kept next to it (no-wrap) | `after-home-ar-m.png` |
| FIXED 7 (R3) | Score plate vs crests | Hero and live header now leave 128-136px under the plate; measured no overlap at 320, 360, 390, FR and AR | `measure2-results.json` ("plateOverlap": false) |
| FIXED 8 (R4) | Text on club fills | Raja and Hassania (best 4.50 / 4.45) get a white pill under crest letters, club names and the player-hero text; no opacity on text over a fill; no pure black; club fills unchanged | `after-home-fr-m.png`, `after-player-fr-m.png`, design-system 1.4 |
| FIXED 9 (R6) | Landscape | `@media (max-height: 480px) and (orientation: landscape)`: bottom nav icon and label side by side at 48px, tab rows and table headers not sticky; bars 96px = 27 % at 640x360, 30 % at 568x320 | `measure2-results.json` ("land") |
| FIXED 10 (R5) | Scrolling tab rows | Tabs shrink first (14px under 360). If a row still scrolls, the active tab is scrolled into view and an edge fade shows more tabs exist (checked at 320: Classement/Teamnew rows scroll 22px FR, 3px AR, active tab inside, fade on) | `measure2-results.json` ("tabs") |
| FIXED 11 (R8) | Live team switch | Real `role=tab`, `aria-selected`, `aria-controls` and a `tabpanel` | `proto/live.html` |
| FIXED 12 (R9) | Arabic terms | تعزيز الاحتياط, الضربة الحرة, فانتازي (heading, tabs aria-label, share card), كورفا in the nav; no Latin label on Arabic pages except BotolaGO and MARQUE (team codes like RCA are crest abbreviations) | `after-team-ar-m.png`, `after-home-ar-m.png` |
| FIXED 13 (R10, U20) | Dash and control edge | NEW `--ui-control-edge` 3.79 on sunken (light), 4.30 (dark); score dash now muted text colour, 7.43 | design-system 1.3b |
| FIXED 14 | Token names | The four mobile-spec names are used exactly: `--ui-positive-text`, `--ui-negative-text`, `--ui-live-text`, `--ui-on-surface-faint-text` | `proto/additions.css` |
| Lead Q4 | Visitors on the leaderboard | Guest view and the Home preview show TEAM NAMES and rank only; manager names hidden | `after-rank-state-guest-fr-m.png`, `after-home-fr-m-full.png` |
| Also (R7) | Notch | Side padding uses `env(safe-area-inset-left/right)` (code only, Chromium cannot show it) | `proto/proto.css` |

Decisions applied: Q1 approved (noted in design-system section 2), Q2 approved, Q9 approved, Q11 kept. Q3, Q5, Q6, Q7, Q8 stay with the owner and are left as drawn. Questions 4, 9, 10, 12 below are closed by the Lead; the other questions stay open.
Not fixed: R7 cannot be verified here; R11 (prototype toolbar) is not shipped.

---------------------------------------------------------------------
## Proposals

### 1. Home
Before: `shots/before-home-fr-m.png`, `before-home-ar-m.png`, `before-home-fr-d.png`, `before-home-ar-d.png` (+ `-full`).
After: `shots/after-home-fr-m.png`, `after-home-ar-m.png`, `after-home-fr-d.png`, `after-home-ar-d.png` (+ `-full`); no sponsor: `after-home-sponsor-off-fr-m.png`, `...-ar-m.png`, `...-fr-d.png`, `...-ar-d.png`. Prototype: `proto/home.html`, `proto/home.ar.html`.
Effort: M. Fans: they see the live match, the table and the Fantasy deadline in the first two screens instead of scrolling past three bands.

| Change | Why (one line) | Fixes |
|---|---|---|
| One live strip only, at the top | Desktop showed the same match twice | U4 |
| Language question becomes a thin bar with one tap, dismissible, never a blocking pop-up | A fan arriving from WhatsApp should see the page first | U14 |
| Four shortcut chips under the hero (Classement, Calendrier, Classement Fantasy, Pronostics) | Standings is 1 tap, not "scroll 2 screens"; the Fantasy table is reachable | U18, audit tap table (c) |
| Fantasy card now shows the deadline, one main button and the top 3 managers with a count (12 480) | A visitor can see the game is alive before signing up | U18 |
| Standings block shows 5 clubs and one big "Voir le classement complet" button, placed after Fantasy, before news | The existing "Tout voir" sat 1862px down | audit tap table (c) |
| All captions 12px (13px in Arabic); club codes in crests no longer 9.6px | Readable in sunlight on a cheap phone | M5 |
| Score shows as separate pieces, home on the right in Arabic; live badge uses the darker red text | Correct reading order, readable red | M4 (live-text), score rule |
| Sponsor spot 1: "Défi de la journée présenté par MARQUE" under the Fantasy card (no sponsor: a free "des lots à gagner" link) | First place a brand sees its name, never on club colour | U17 |
| Match card names stack under the crest | Long names stop breaking mid-word ("Berkan e") | new |

### 2. Live match
Before: `shots/before-match-fr-m.png`, `before-match-ar-m.png`, `before-match-fr-d.png`, `before-match-ar-d.png` (+ `-full`).
After: `shots/after-live-fr-m.png`, `after-live-ar-m.png`, `after-live-fr-d.png`, `after-live-ar-d.png` (+ `-full`); no sponsor `after-live-sponsor-off-*`; dark `after-live-theme-dark-fr-m.png`. Prototype: `proto/live.html`, `live.ar.html`.
Effort: M (header and states S, line-up links S, timeline layout M). Fans: goals and cards appear with minute and player; tapping a name opens the player.

| Change | Why | Fixes |
|---|---|---|
| Player names in the line-up are full-width links with a chevron | Fans tap a name first and nothing happened | U1 |
| Timeline: home events on the home side, minute in the middle, icon plus word for goal and card | The tab used to read "Aucun fait de jeu" | new |
| Small city lines removed from the club-colour header; names stay large | 12px text on Hassania orange measures 4.45:1, under 4.5 | new (see design-system 1.4) |
| Spoken score in one polite live region; clock not live; score as 5 pieces | Screen readers and Arabic order | mobile-spec 1.4, 6.2 |
| "Pas de statistiques par joueur" uses the one shared "unavailable" panel, no retry | Two different empty styles became one | U5 |
| Sticky 48px tab row, 12/13px captions, darker live text | Reach sections without scrolling back; readable live badge | M4, M5 |
| Sponsor spot 2: "Match présenté par MARQUE" on a neutral strip under the header, next to "Mis à jour il y a 12 s"; never over the score or club halves (no sponsor: the strip disappears) | Quiet, always visible while the match is watched | U17 |
| Prediction card moves to the end (phone) | Content first, secondary action last | new |

### 3. Standings
Before: `shots/before-standings-fr-m.png`, `before-standings-ar-m.png`, `-d` versions (+ `-full`).
After: `shots/after-standings-fr-m.png`, `after-standings-ar-m.png`, `after-standings-fr-d.png`, `after-standings-ar-d.png` (+ `-full`). Prototype: `proto/standings.html`, `standings.ar.html`.
Effort: S-M. Fans: the whole 16-club table with form is readable without opening anything.

| Change | Why | Fixes |
|---|---|---|
| Title row, one tab row, then the table: the live strip, the season picker row and the Matchs title no longer stack as four bands | The table starts higher | U3 (the Matchs header stack; standings share it) |
| Last five results under each club as V/N/D letters in squares; table shows all 16 clubs with 4 numbers on phones, G/N/P on desktop | The old table showed 5 clubs and hid the rest behind an expander | new |
| "My club" row tinted with a star and a hidden word | Find your club in one glance | new |
| Sticky header with abbreviations explained on press | Long table keeps its columns | new |
| Legend as a list under the table; a line when clubs have games in hand | Real data: 6 clubs are behind on games | new |
| 12/13px type, 40px crests, 0 overflow at 320px (measured) | Small phones | M5 |
| Real zone bars kept (CAF, Confédération, relégation) | Identity and business logic unchanged | - |

### 4. Player page
Before: `shots/before-player-fr-m.png`, `before-player-ar-m.png`, `-d` (+ `-full`).
After: `shots/after-player-fr-m.png`, `after-player-ar-m.png`, `after-player-fr-d.png`, `after-player-ar-d.png` (+ `-full`). Prototype: `proto/player.html`, `player.ar.html`.
Effort: M (a layout order and a labelled Fantasy block on the existing route; a separate public route would be L). Fans: they arrive from a line-up and find football first.

| Change | Why | Fixes |
|---|---|---|
| Header says "Joueur", not "FANTASY / Joueur"; price pill leaves the hero | A football fan should not land on a game page | U1 |
| Club-colour hero with name, position, number, club, age, country | The existing page had no identity line | U1 |
| Season numbers and last matches come first; Fantasy price, points, selection and "Ajouter à mon équipe" sit together in "Dans le Fantasy" | The Fantasy block was first and the football block fourth | U1 |
| The fixed "Comparer / Recruter" bar is gone; "Ajouter" is an outline button inside the card | A visitor sees no sales bar | U1 |
| Tabs: Aperçu, Saison, Matchs, Fantasy | Same sections, easier to reach | new |
| Result letters (V/N/D) plus rating chips | Not colour alone | M4 |

### 5. Fantasy team picker
Before: `shots/before-team-fr-m.png`, `before-team-ar-m.png`, `-d` (+ `-full`).
After: `shots/after-team-fr-m.png`, `after-team-ar-m.png`, `after-team-fr-d.png`, `after-team-ar-d.png` (+ `-full`), no sponsor `after-team-sponsor-off-*`. New-manager state: `shots/after-teamnew-fr-m.png`, `after-teamnew-ar-m.png`, `-d` (+ `-full`). Prototypes: `proto/team.html`, `team.ar.html`, `teamnew.html`, `teamnew.ar.html`.
Effort: M for the tab row and compact header; M for auto-fill (needs a product rule, see Questions).
The pitch is the real screenshot, unchanged.

| Change | Why | Fixes |
|---|---|---|
| Five-tab row (Équipe, Transferts, Points, Classement, Ligues) on every Fantasy screen | Moving between screens no longer means going back to the hub | U15 |
| Screen is called "Mon équipe" for an existing squad and "Créer mon équipe" for a new one; "Composer l'équipe" is gone | One name per action | U8 |
| Date limite merged into one dark line, boosts become two chips in the formation and budget row; average and best leave the phone view | The old header block was about 100px; the new one is three slim rows. Honest note: because of the new tab row, title and challenge card, the pitch now starts near y=500 on 390px (it started at y=345 before), so the first screen shows less of it. Trade-off for the Lead (Question 12) | new |
| New-manager state: a card "On vous prépare une équipe" with progress (0/15), a gradient "Compléter automatiquement" and "Je choisis moi-même"; the pitch only appears after the choice | The unused `fpl.autofill` becomes a first-run path; fewer give up at pick 4 | U2 |
| Three-step strip Choisir / Capitaine / Enregistrer | Shows the end is near | new |
| Sticky bar says "2 changements non enregistrés" with one button | Existing behaviour, clearer words | new |
| Sponsor spot 3: "Défi J5 · lot offert par MARQUE" in a neutral card above the pitch; collapses to "un lot à gagner" without a sponsor | Next to the thing fans are playing for; never over the pitch | U17 |
| 12/13px, 44px chips | Phones | M5 |

### 6. Fantasy leaderboard
Before: `shots/before-rankings-fr-m.png`, `before-rankings-ar-m.png`, `-d` (+ `-full`).
After: `shots/after-rank-fr-m.png`, `after-rank-ar-m.png`, `after-rank-fr-d.png`, `after-rank-ar-d.png` (+ `-full`); guest view `after-rank-state-guest-fr-m.png`, `...-ar-m.png`, `...-fr-d.png`, `...-ar-d.png`; no sponsor `after-rank-sponsor-off-*`. Prototype: `proto/rank.html`, `rank.ar.html` (`?state=guest`).
Effort: M (screen) + S (a link and a read-only top list for visitors; needs the public-data decision in Questions).

| Change | Why | Fixes |
|---|---|---|
| Visitor view: the same screen with a podium, the top managers, and "Où seriez-vous classé ?" with a gradient button | A visitor now has a way in (also from the Home Fantasy card and the Home shortcut) and a reason to sign up | U18 |
| Five-tab row | See above | U15 |
| "Mon classement" card with rank, points and the climb (up 12) | Where I stand, first | new |
| Podium of three, then "Autour de vous" with long team names allowed to wrap on two lines | The old rows broke "Dragons de Marrakech" awkwardly | new |
| Movement shown as arrow plus number plus hidden words, in the darker green/magenta text | Not colour alone, passes contrast | M4 |
| Sponsor spot 4: "Classement présenté par MARQUE" strip under the title (no sponsor: gone) | The page sponsors want to be on | U17 |
| Sponsor spot 5: "Partager ma journée" card, a recap picture with a neutral footer "Présenté par MARQUE" (no sponsor: "botolago.com · Fantasy"); total is never covered | Shared on WhatsApp, it carries the brand out of the app | U17 |

---------------------------------------------------------------------
## Sponsor spots (summary)
All use `--ui-sponsor-surface` (the existing sunken grey), the placeholder "MARQUE" in a thin-bordered mark, and never sit on club colours, scores or the pitch. A sponsor logo would replace the word mark at the same size (about 20px high).
| # | Spot | With sponsor | Without |
|---|---|---|---|
| 1 | Home, under the Fantasy deadline card | `after-home-fr-m.png` | `after-home-sponsor-off-fr-m.png` |
| 2 | Match, under the header | `after-live-fr-m.png` | `after-live-sponsor-off-fr-m.png` |
| 3 | Team picker, challenge card | `after-team-fr-d.png` | `after-team-sponsor-off-fr-d.png` |
| 4 | Leaderboard header | `after-rank-fr-m.png` | `after-rank-sponsor-off-fr-m.png` |
| 5 | Gameweek recap share image | `after-rank-fr-d.png` (right column) | `after-rank-sponsor-off-fr-d.png` |
Arabic versions of every file exist with `-ar-` in place of `-fr-`.

---------------------------------------------------------------------
## What I checked and found fine
Measured by script on all 7 prototype pages, French and Arabic, at 320, 360, 390 and 1280px (`phase3/measure.cjs`, results in `phase3/measure-results.json`):
- no element wider than the screen (by bounding box, not scrollWidth);
- no text under 12px (French) or 13px (Arabic);
- no button or link under 44x44 painted;
- `lang`, `dir`, a translated `<title>`, one visible h1 per breakpoint, skip link;
- contrast of every token pair used, light and dark, from rasterised pixels (`phase3/contrast-results.json`); all text pairs reach 4.5 except the two existing items listed in design-system 1.1 and the Hassania caption case in 1.4, which the prototypes avoid;
- Arabic mirroring: tabs, rows, chevrons, score order (home on the right), timeline sides, tables; the pitch stays physical (left-to-right image).
Fine in the current product and kept: club-colour edges, the split match header idea, the Changa/Manrope pairing, the navy and gradient action language, zone bars, the real-table rule for standings.

## What I could not check and why
- Real devices: no Android phone or emulator here, so no font scaling, no Roboto/Noto fallback, no real safe areas. Chromium only.
- Screen reader speech (TalkBack/VoiceOver): I wrote the live regions and names but did not listen.
- Sticky-bar budget (mobile-spec 5.2) on 320x568 and in landscape: not measured. The Fantasy team page stacks top bar, tab row, bottom nav and a confirm bar; that needs a check before build.
- Dark mode: only two screenshots (`theme=dark` on live and standings); the logo shows its colour file in dark here, where the product uses the all-white one.
- Real data: no live match, no signed-in manager, no real leaderboard or player stats (invented). Arabic club names unverified.
- The prototypes are static HTML. Scroll behaviour, sticky overlap with the real shell, loading and error screens in motion, auto-fill logic, and performance were not tested.
- Old WebView (M8): oklch/color-mix not tested.
- Benchmarks (FotMob, Sofascore) were not loaded; my references to them are from memory.

## Questions for the Lead
1. **Arabic +1px (mobile-spec 1.2).** It reverses the BG-0124 decision (same px, taller leading). I followed the Mobile operator's spec in the prototypes (one switch in `additions.css`). Approve, or should I redesign with leading only?
2. **Allowed colour additions.** I added text-only shades (the four from the Mobile spec), two wash mixes, medals and the sponsor tokens (design-system 1.2-1.3). OK as "additions only"?
3. **Auto-fill rules (U2).** Choosing 15 players under 100 M, 3 per club and a formation is a product rule, not a screen detail. Who decides what auto-fill picks (cheapest, best form, random) and whether it may pick injured players? I only drew the screen.
4. **Public leaderboard for visitors (U18).** The visitor view shows manager display names. Is it right to show them without login, or only team names plus rank?
5. **Sponsor wording and rules.** "Présenté par" / "برعاية" / "Lot offert par": legal wording per sponsor and in the T&Cs (the repo says prizes are "provided by the organiser" today). Also: may a sponsor appear on a match page for a prize-free match?
6. **Language bar (U14).** The bar assumes the language cookie (Batch 4, decision 9) so Arabic arrives first. Without the cookie the bar still works but the page flashes. Which do you want first?
7. **Player page route.** Keep the shared Fantasy route with neutral framing (M) or build `/joueurs/$id` (L)?
8. **Names.** Arabic club names are mine; player names are invented. Who supplies the official Arabic names, and may a pitch deck show real player photos?
9. **Club-fill captions.** The city line on the match header is dropped because small text on Hassania and Raja fills is at or under 4.5:1. Accept, or keep it on a neutral strip below?
10. **Fantasy confirm bar** covers part of the pitch on 390px (existing behaviour). Accept it, or move the save button into the top tab row area?
12. **Pitch position.** On phones the pitch starts lower than today (about 500px against 345px) because of the tab row, title and challenge card. Hide the title and the challenge card on scroll, or keep as drawn?
11. **Mobile-spec items I did not test**: landscape nav change (their question 4) and the home-on-the-right score order (their question 2). I implemented home-on-the-right and left the nav alone.
