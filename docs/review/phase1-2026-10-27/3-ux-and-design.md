## Findings

Revision r2 (lead review). Changes are marked FIXED 1 to FIXED 6. Everything else is as in r1. Dev server for all local shots: this tree, port 5391, mock data. Real-data shots (5 anonymous page loads of botolago.com at 390px: Home, /matches, a club page, /fantasy/players, one player page) are named SHOTS/prod-*.png. The /fantasy guest hub was not loaded on production (the 5-page cap was spent on the player list needed to find a player id); I used the Home Fantasy card instead.

Method note: all screenshots are from this tree's dev server (127.0.0.1:5391, started from /home/user/botolago-foundation, mock data modes, "MODE DEMO" badge visible). Shots are in /tmp/claude-0/-home-user-botolago-foundation/28165697-c0db-582d-a9c4-20a0f74bacc1/scratchpad/phase1/ux-shots/ (abbreviated SHOTS/ below). No botolago.com pages were loaded. No repo file was changed.

**U1. (FIXED 1) Player football info exists now; the gap is that nothing links to it and the page is still Fantasy-framed**
- What changed: PR #563 (commit 171479f) added `PlayerFootballProfile` to the player page. I re-read it and looked at the page with real data (SHOTS/prod-player-full-m.png). A non-Fantasy fan now gets: "Statistiques de la saison" (matches, starts, minutes, average rating, goals, assists, yellow and red cards, with a "figures cover N of M club matches" note when the data is partial) and "Derniers matchs" (the last five matches with result chip, opponent crest, date, home or away, minutes, goals, assists, score and rating; each row links to its match page).
- What is still Fantasy-framed: the header reads "FANTASY / Joueur"; the hero carries a price pill ("PRIX 9,8 M"); the key-number card is Fantasy only (Points, Forme, Minutes, Sélection %); then "Prochain match" with "Difficulté 3", "Dernières journées" Fantasy points bars, and a fixed "Comparer" / "Recruter · 9,8 M" bar at the bottom. The football profile is the 4th block, below those. No position-in-squad, nationality, age or career info.
- What is still missing: nothing links to the page except Fantasy lists and global search. Club squad rows (`src/components/clubs/ClubSquad.tsx:84`) and match line-ups (`src/components/matches/LineupsView.tsx:194,353,393,439`) are plain `<li>` with no link.
- Where: `src/routes/fantasy.players.$playerId.tsx:277-278` (price), `:387` (profile mounted after Fantasy blocks), `:425-460` (Comparer/Recruter bar); `src/components/fantasy-lists/PlayerFootballProfile.tsx`.
- Why it matters: Fans tap a name in a line-up first. The page now has real football content, so linking is worth much more than before, but a fan who lands there from a line-up sees "Fantasy" and "Recruter" on a page they came to for football.
- Severity: re-graded from High to Medium (the content exists; the problem is reach and framing).
- Effort: linking squad and line-up rows to the existing page = S (rows already have the player id). Neutral framing (title "Joueur" without Fantasy label, football block first, Recruter bar hidden or secondary for visitors not in the game) = M (layout order and a route-level decision on a shared route; a separate public route `/joueurs/$id` would be L).
- Proof: code lines above; SHOTS/prod-player-full-m.png (real data, the full profile is there); SHOTS/player2-m.png (mock: the profile is the empty state "Pas encore de match cette saison").

**U2. No "auto-pick" for first Fantasy squad; 15 manual picks**
- What: `fpl.autofill` ("Compléter automatiquement") exists in the dictionary but is used by no component. A new manager must add 15 players one by one under a 100M budget. The pitch demo (`demo/`) has a one-tap "Compléter l'équipe", so the owner already knows the value.
- Where: `src/i18n/dictionary-fr.ts:1486` (unused key); builder `src/routes/fantasy.create.tsx`, `src/components/fpl/SquadBuilderScreen.tsx`.
- Why it matters: Fantasy sign-up is the stated main conversion (PRODUCT.md). A sponsored challenge will bring first-time players, and each of the 15 picks is a point where people quit. FPL has auto-pick (from knowledge).
- Severity: High. Effort: M.
- Proof: `grep -rn autofill src` finds only dictionary lines. Earlier screenshot run showed the empty builder text "Encore 15 à choisir" (`dictionary-fr.ts:2114`).

**U3. Matches screen: four stacked control bands before the first match (phone)**
- What: At 390px the first match starts at about y=440 of 844. Above it: the page title with the season picker, the Calendrier/Classement/Pronostics tabs, the live strip, the Tous/En direct/À venir/Résultats chips, a navy date banner with arrows, and the day strip. The live match then appears twice (strip and list row).
- Where: `src/routes/matches.index.tsx` (header stack), `src/components/matches/MatchesTabs.tsx`, `MatchdayStrip.tsx`, `DateStrip.tsx`, `LiveStrip.tsx`; `AppShell.tsx:100-101`.
- Why it matters: Today's scores should be visible at once. FotMob (from knowledge) uses one date strip, then matches.
- Severity: Medium. Effort: M.
- Proof: SHOTS/matches-m.png (mock, with a live match). FIXED 6, real data: SHOTS/prod-matches-m.png (no matches today) still shows four bands (tabs, filter chips, date banner, day strip) and the empty card starts at about y=390 of 844; the live strip is absent because nothing is live. So the band stack is confirmed with real data; the duplicate live strip is only seen when a match is live.

**U4. Desktop Home: two live strips stacked, showing the same match**
- What: At 1280px the Home page renders `MatchdayStrip` (WAC 1-1 FAR, RCA 13:35 RSB) and `LiveStrip` (WAC 1-1 FAR 63') one above the other, then repeats the match in the hero carousel and in the list. On phone only the live strip shows.
- Where: `src/routes/index.tsx:432-436` (`liveStrip` and `matchdayStrip` both set); `src/components/shell/AppShell.tsx:100-101`.
- Why it matters: Looks cluttered and unpolished on the first screen a sponsor will see on a laptop.
- Severity: Low (downgraded: only when a match is live). Effort: S.
- Proof: SHOTS/home-d.png (mock, one live match). FIXED 6: not confirmed with real data, because production had no live match on 27 October and I did not load the desktop width on production. Keep as Low until someone sees it live.

**U5. Two parallel empty/error/loading systems, which look different in Fantasy and public screens**
- What: `src/components/common/States.tsx` (`EmptyState`, `ErrorState`, `LoadingState`; sunken panel with round icon disc) is used by 14 files (Home, Matches, Standings, Clubs, News, Match detail). `UiEmptyState` and `UiErrorState` from the kit (`UiStatePanel`) are used by 34 files (all Fantasy). The skeletons are also split: `common/Skeletons.tsx` against `UiSkeleton`. `fpl/` and `fantasy/` also hold their own `FantasyUnavailableState`.
- Where: `src/components/common/States.tsx:1-120`; `src/components/ui-kit/primitives.tsx:1197,1383,1387`; `src/components/common/Skeletons.tsx`.
- Why it matters: A fan who hits an error in Matches sees a different panel from the same fan in Fantasy. The design-system doc says "a screen should never hand-roll an empty or error block" (the kit's own comment at `primitives.tsx` above line 1383).
- Severity: Medium. Effort: M.
- Proof: counts from `grep -rl` on the two import paths.

**U6. Legacy shadcn `ui/` folder is mostly orphaned, with a few live leaks**
- What: Of `src/components/ui/*`, `button` is imported only by `pagination`, `alert-dialog`, `calendar`; `card`, `badge`, `input`, `skeleton`, `sheet`, `tabs`, `table` have zero importers. `dialog` is used once. These are dead weight and a risk that a new screen picks the wrong button.
- Where: `src/components/ui/`; live leaks in `src/components/matches/SeasonPicker.tsx`, `src/components/fpl/FplChipInfo.tsx`, `src/routes/auth.verify.tsx`, `auth.mfa-challenge.tsx`, `profile.security.tsx`, `__root.tsx` (they import from `components/ui/`).
- Why it matters: Consistency. A sponsor reviewing the app should not meet a differently-styled select or dialog on the season picker.
- Severity: Low. Effort: S-M.
- Proof: grep counts above.

**U7. (FIXED 3) DROPPED: guest landing on a pre-filled squad is a mock artefact**
- Read of the code: in the cloud (non-mock) mode a visitor is `owned.source === "guest"`. The builder keys the draft to `GUEST_DRAFT_KEY` (device storage) and starts from `initCreateDraft(...)`, an empty squad (`src/routes/fantasy.create.tsx:140-175`). The redirect to `/fantasy/team` fires only when `screen.phase === "ready" && screen.team` (`fantasy.create.tsx:~124`). A real guest has no team, so gets the empty builder and is asked for an account at "Enregistrer". In mock mode the "local" source is seeded with a team ("Atlas XI"), which explains what I saw. Not a product finding. Removed.

**U8. Existing-team screen is titled "Composer l'équipe", same as the creation step**
- What: The pick-team screen for a manager with a squad is headed "Composer l'équipe" (compose the team), the same wording as the guest card "Composez votre équipe", while the points screen says "Atlas XI". The hub tile for the same action says "Mon équipe". FPL calls it "Pick Team" (from knowledge).
- Where: `src/routes/fantasy.team.tsx` (header); `src/routes/fantasy.index.tsx`; title tag "Mon équipe — BotolaGO Fantasy".
- Why it matters: Fans cannot tell "I am creating" from "I am picking this week's XI". Three names for one screen.
- Severity: Medium. Effort: S (copy).
- Proof: SHOTS/fteam-m.png header; tab title printed by the screenshot run.

**U9. League join: disabled button with no reason, odd "Terminé" link, wrapped label**
- What: `/fantasy/leagues/join` opens on the "Privée" tab with a greyed "Rejoindre une ligue" button and no hint on the code format. The top-right link says "Terminé" (`fpl.done`) although the user has done nothing. On `/fantasy/leagues` the button "Rejoindre des ligues" wraps to two lines and looks smaller than its neighbour "Créer une ligue".
- Where: `src/routes/fantasy.leagues.join.tsx:264,279` (`fpl.done`); `src/routes/fantasy.leagues.tsx` (button row).
- Why it matters: Joining a friend's league is the viral loop, and it arrives as a WhatsApp invite. A disabled button with no explanation reads as broken.
- Severity: Medium. Effort: S.
- Proof: SHOTS/fjoin-m.png, SHOTS/fleagues-m.png.

**U10. (FIXED 3) DROPPED: the three "general" leagues are mock data**
- Proof: "BotolaGO Officielle" and "Overall" exist only in `src/mocks/fantasy-data.ts:483,493`. No migration or seed contains them (grep of `supabase/` finds none). The "Général" row is hard-coded from `fpl.overall` in `src/routes/fantasy.leagues.tsx:224`. In production the list is "Général" plus whatever public leagues the database returns, which I could not see anonymously. Removed.

**U11. Club page labels a live match "Prochain match"**
- What: The club overview card titled "Prochain match" shows a match that is "EN DIRECT 63'".
- Where: `src/i18n/dictionary-fr.ts:315` (`club.next_match`); `src/components/clubs/ClubOverview.tsx`.
- Why it matters: Small, but it is the kind of wording slip that costs trust on a "premium" page. A live match should read "En direct".
- Severity: Low. Effort: S.
- Proof: SHOTS/club-m.png (mock, live match). FIXED 6: with real data SHOTS/prod-club-m.png the card shows a true upcoming match (sam. 31 oct. 15:00), so the label is right there. It only misfires while the club is playing. Low, edge case.

**U12. (FIXED 3) DROPPED: the Arabic carousel indicator is correct**
- Proof: I read `HomeMatchCarousel.tsx:149-172` and measured the DOM in Arabic Chromium at 390px. Initial: dots at x=206 (wide, active), 192, 178, 164, so the active first dot is at the right as the cards run; "previous" (x=238) has `aria-disabled=true`, "next" (x=108) is enabled. After tapping "next": the wide dot moves to x=192 and "previous" becomes enabled. The maths uses `Math.abs(scrollLeft)`, which is right for Chrome's negative RTL scrollLeft. My r1 reading of the screenshot was wrong (I read the dot order as LTR). Removed.

**U13. Sign-up asks five fields up front (FIXED 4: OAuth answered)**
- What: Register asks full name, username, email, password and password confirmation, then an emailed code. Fantasy itself defers the account until "Enregistrer", which is good, but the form is long on a phone.
- OAuth answer: Google and Apple buttons are in the code and switched on for the web: `OAUTH_PROVIDERS_ENABLED = true` (`src/lib/feature-flags.ts:145`, turned on in merge e8a7880), rendered under the form on both `src/routes/auth.register.tsx:383-405` and `auth.login.tsx:342`, below the first screen, after the 5 fields. They are hidden inside the phone app (`WebOnly`). Whether the providers are actually enabled in the production Supabase project cannot be known from the repo: `supabase/config.toml:322-323` has Apple `enabled = false` (that file is the local stack), and `src/services/auth-oauth-probe.ts` exists because a provider that is off sends the visitor to a raw JSON error. I did not log in or test it on production.
- Where: `src/routes/auth.register.tsx`; `src/routes/auth.verify.tsx`.
- Why it matters: Each field costs sign-ups. The social buttons, if live, are the shortest path, but they sit under the fold at the bottom of a long form instead of at the top.
- Severity: Medium. Effort: M (reorder so social sign-in leads; reduce fields).
- Proof: SHOTS/register-m.png (five fields in the first screen, no social buttons visible); code above.

**U14. First-visit language gate blocks every page**
- What: A mandatory modal "Choisissez votre langue" covers whatever page the visitor lands on, including an article from search, until they tap Continuer. French is pre-selected, so French readers pay one extra tap and Arabic readers two.
- Where: `src/components/shell/FirstLaunchLanguage.tsx:19-80`; the server renders French for all (PRODUCT.md).
- Why it matters: Visitors from Google or WhatsApp see a blurred page and a dialog before any content. FotMob and Sofascore (from knowledge) detect the language and never block.
- Severity: Medium. Effort: M (depends on the planned `/ar` URLs).
- Proof (FIXED 5): SHOTS/gate-article-m.png: clean storage, deep link `/news/a0000000-0000-4000-8000-000000000001` at 390px; the language dialog covers the article and `localStorage['botolago.language']` is null. Code: `FirstLaunchLanguage.tsx:19-80`.

**U15. Fantasy sub-screens have no section navigation**
- What: Team, Transfers, Points, Rankings, Leagues are reached only from the hub; each has a "Retour" pill and no tab bar. Moving from Points to Rankings means back, back, tap.
- Where: `src/components/fpl/FantasyFrame.tsx`; `src/routes/fantasy.tsx:56-77` (the layout is just an `Outlet`).
- Why it matters: Fantasy is checked often on match days; FPL (from knowledge) has a persistent Pick Team / Transfers / Points tab row.
- Severity: Medium. Effort: M.
- Proof: SHOTS/fteam-m.png, fpoints-m.png, fleagues-m.png, frank-m.png all show only "Retour" plus the app bottom nav.

**U16. Stale comments say News is "hidden at launch"**
- What: Comments in the Home route still say News is hidden, but `NEWS_ENABLED = true`.
- Where: `src/routes/index.tsx:276`; `src/lib/feature-flags.ts:76`.
- Why it matters: A maintenance trap only; no fan impact.
- Severity: Low. Effort: S.
- Proof: file lines above. Also `src/components/fantasy/FantasyOnboarding.tsx` has no importer (dead code).

**U17. Sponsor slots are only a prize-card field; no placement in the game**
- What: The production code has a sponsor name and logo only on the prize card (`prize.sponsorName`, `sponsorLogoUrl`, string "prizes.sponsored_by"). The "presented by" placements on the gameweek, leaderboard and prizes exist only in the pitch demo, not in `src/`. `feature-flags.ts:157-159` records that prizes are currently provided by the organiser with no sponsor; a sponsor must be named in the T&Cs.
- Where: `src/components/prizes/PrizesPage.tsx:245-256`; `src/backend/prizes/contracts.ts:61-62,117-118`; demo `demo/src/components/Sponsor.tsx:101,131` (`SponsorStrip`, `SponsorBanner`).
- Why it matters: Brands will want to see their name where fans look, not only on a prize list.
- Severity: Medium (commercial). Effort: M.
- Proof: grep of "sponsor" outside `src/components/prizes`, `src/backend/prizes` and `feature-flags.ts` finds nothing in `src/`.

**U18. (new, from clicking) A guest has no link to the leaderboard or leagues**
- What: As a visitor, the Fantasy hub offers no link to `/fantasy/rankings`, `/fantasy/leagues` or the join-league page. Hub links for a guest, measured in the browser: create, rules, matches, fixtures, players, top-players, pepites, news, prizes, help. The leaderboard link exists only in the personal hub (signed in, with a team): `src/components/fantasy/FantasyHubPersonal.tsx:527,533`, `:560-564`, and in `src/routes/fantasy.leagues.tsx:225`. `/fantasy/rankings` is still in the sitemap (`src/lib/sitemap.ts:29`).
- Why it matters: A fan or a sponsor's guest cannot see how many people play or what the ranking looks like before signing up, which is the best proof that the game is alive.
- Severity: Medium. Effort: S (a link row or a preview card in the guest hub).
- Proof: Playwright hub-link dump as a guest (taps.cjs); `grep -rn "fantasy/rankings"` shows only the two components above.

**U19. (new, from clicking) The prize welcome dialog covers the Fantasy hub on first visit**
- What: A signed-in manager's first Fantasy hub visit opens a modal "Jouez gratuitement, gagnez des lots !" (lot of the day, month, season) with "C'est parti" and "Voir les lots". It must be dismissed before any hub link works (Playwright clicks were intercepted by it).
- Where: `src/components/prizes/PrizeWelcome.tsx`; opened from `src/routes/fantasy.index.tsx`.
- Why it matters: It costs one tap on the most important screen, but it is also the existing, tasteful prize surface; a sponsor placement fits here ("Lot offert par ...").
- Severity: Low. Effort: S.
- Proof: SHOTS/tap-e0-hub-prize-modal.png.

### Sponsor placement candidates (identification only)
1. Fantasy deadline hero on the hub ("JOURNÉE 14 · DATE LIMITE" green gradient card): `src/components/fantasy/DeadlineCard.tsx`, `DeadlineStrip.tsx`; the same strip on Home (`src/routes/index.tsx:445-451`). SHOTS/fantasy-m.png.
2. Leaderboard header, "Mon classement" card in Rankings: `src/routes/fantasy.rankings.tsx`, `MyRankCard.tsx`. SHOTS/frank-m.png.
3. League and cup header: `src/routes/fantasy.leagues.$leagueId.tsx`.
4. Prize welcome dialog (`PrizeWelcome.tsx`, SHOTS/tap-e0-hub-prize-modal.png) and the Prizes page and hub row "Lots à gagner": `PrizesPage.tsx:245` (slot already exists).
5. Gameweek recap share image: `src/components/fantasy/GameweekRecapCard.tsx`, `recap-image.ts`.
6. Match card: a quiet "Présenté par" under the match score header, `src/components/matches/MatchScoreHeader.tsx`, but note the club-colour split (red/blue) leaves little room, so prefer the line under it.
7. Home "À venir" header and the Pronostics card (`PredictionsHomeCard`).
The club-colour card and header colours are brand-fixed, so the sponsor should sit on a neutral surface (card edge rule as in `Sponsor.tsx` comments).

## Tap counts table

FIXED 2. All counts below were clicked with Playwright from Home at 390px in this tree's dev server (mock data, language already chosen). Script: scratchpad `taps.cjs`, `taps2.cjs`, `taps3.cjs`. The signed-in rows used the mock demo account (`demo@botolago.ma`), because a guest has no path to the leaderboard (U18). First-time visitors add 1 tap (French) or 2 (Arabic) for the language gate (U14).

| Goal | Actual taps from Home | End screen | Differs from r1? | FotMob / Sofascore (from knowledge) |
|---|---|---|---|---|
| (a) Live match details | 1 (live hero card). On phone the matchday strip is hidden; the first visible match link is the card | `/matches/00000020-...0001`, SHOTS/tap-a.png | No | 1 |
| (b) Today's scores | 1 (bottom nav "Matchs") | `/matches`, SHOTS/tap-b.png | No | 0-1 |
| (c) Standings | 2 (Matchs, then "Classement" tab). Or 1 tap from the Home "Classement" block, but its "Tout voir" link sits 1862px down the page (about 2.2 screens of scrolling on 844px) | `/matches/standings`, SHOTS/tap-c.png | The shortcut needs a long scroll | 2 |
| (d) My Fantasy team / pick team | Signed in with a team: 2 (Fantasy tab, then the main hub button; the link sits at y=375, on the first screen). Guest: 2 to the empty builder (Fantasy tab, "Créer mon équipe") | `/fantasy/team`, SHOTS/tap-d-signedin.png and tap-d.png | Signed in: +1 on the first visit, because the prize dialog must be dismissed first ("C'est parti") | 1-2 |
| (e) Fantasy leaderboard | Signed in with a team: 3 on the first visit (Fantasy tab, dismiss the prize dialog, tap the overall rank row), 2 afterwards, plus a scroll: the link is at y=2019 (about 2.4 screens). Guest: no path from the hub (0 links) | `/fantasy/rankings`, SHOTS/tap-e.png | Yes: r1 said "2 plus scroll" and did not know guests have no link | 2 |
| (f) A player page | 2 plus typing (search icon, type "Kaabi", tap the one option); lands on the Fantasy player page. Not reachable from line-ups or club squads (U1) | `/fantasy/players/fp_rca_7`, SHOTS/tap-f.png | No | 1-2 |

## What I checked and found fine

- Loading, error with retry and empty states are present on Home (`src/routes/index.tsx:538-546,578-616,740-829`: skeletons, `ErrorState onRetry`, an off-season "no match scheduled" state that links to results or the calendar), Matches (`matches.index.tsx:456-541`), Match detail (`matches.$matchId.tsx:315-326`, plus a not-found card), Standings (`matches.standings.tsx:236-242`), Clubs list and Club page (`clubs.index.tsx:85-96`, `clubs.$clubId.tsx:300-422`), News list and article (`news.tsx:249-253`, `news.$articleId.tsx:181-190`), Fantasy hub, Points, Leagues, League detail, Join, Rankings, Fantasy player page (skeleton, `UiErrorState` with retry, `UiEmptyState`). Root-level `errorComponent` and `notFoundComponent` exist (`__root.tsx:331-332`) and a default pending screen (`router.tsx:26-27`).
- The empty "off-season" and "no match today" wording on Home is considerate (`home.no_match_today`, `home.next_match_day`).
- Arabic mirrors correctly on Home, Matches and Fantasy hub at 390px (SHOTS/home-ar-m.png, matches-ar-m.png, fantasy-ar-m.png, fteam-ar-m.png): bottom nav order reverses, titles right-aligned, arrows mirrored. Only the carousel indicator is suspect (U12).
- The visual language is coherent on the main screens: Changa display titles, 14px cards, navy and green gradient CTA, club-colour edge rules (SHOTS/home-m.png, standings-m.png, club-m.png). It is close to FotMob in density on Home desktop (SHOTS/home-d.png).
- Standings table is readable on phone with zone colour bars, form chips and an expander for W/D/L (SHOTS/standings-m.png).
- Fantasy deadline countdown hero is clear and prominent (SHOTS/fantasy-m.png).
- No outside network requests from the app during my runs besides the local server (script logged none).
- Bottom nav has 5 items with 44px+ targets; Matches placed second by owner decision (`primary-nav.ts:34`).

## What I could not check and why

- Production: 5 anonymous pages at 390px only (Home, Matches, a club, the Fantasy players list, one player). Arabic and desktop were not checked on production.
- The true first-time Fantasy creation flow on screen: in mock mode the guest lands on a pre-filled squad (code reading, FIXED 3, shows production gives an empty builder), so the 15-pick flow, team-name step and save-and-sign-up step were not walked. U2 and U13 rest on code and strings.
- Real data not seen: a live match, a signed-in manager, the real league list, the Fantasy guest hub on production (5-page cap), and the desktop width on production. The blank navy squares where Home news thumbnails should be in SHOTS/prod-home-full-m.png are probably lazy-loaded images that a full-page capture does not trigger (the club page shows its photos), so I do not report them.
- Error and retry visuals: not triggered in the browser (the mock never fails); verified in code only.
- Desktop views of most Fantasy screens and the Arabic views of Standings, Club and Article: not captured to stay within scope; shots exist for Home, Matches, Standings, Clubs, News, Fantasy at 1280px (`*-d.png`).
- Loading states for slow networks, real-time live refresh behaviour, dark mode, contrast (not measured; per CLAUDE.md contrast must be read from rasterised sRGB), and tap-target sizes by measurement.
- FotMob and Sofascore comparisons are from my own knowledge, not checked live.
- `git rev-parse HEAD` printed ab4506b while an earlier `git log` showed 86f1034 at the top. I did not investigate; the server was started from this working tree.

## Questions for the Lead

1. Should U1 be handled as "link squads and line-ups to the existing player page" (S) first, with neutral framing (M) as a second step?
2. Is the Google and Apple sign-in actually enabled in the production Supabase project? The code shows the buttons on (FIXED 4); I cannot test production. If they are off, visitors may hit the error handled by `auth-oauth-probe.ts`.
3. Closed in r2: U7, U10 and U12 were mock or reading errors and are dropped.
