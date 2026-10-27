# BotolaGO – Phase 1 audit report (27 Oct 2026)

Five auditors looked at the code without changing it. Every finding below was
checked by the Lead against the code and approved. The full reports, with the
file and line for each finding, are in
[`docs/review/phase1-2026-10-27/`](phase1-2026-10-27/). How each report was
reviewed and sent back is in [`REVIEW_LOG.md`](../../REVIEW_LOG.md).

Finding codes point into the full reports: **S** = Speed & Data, **C** = Code
Health & Security, **U** = UX & Design, **M** = Mobile, Language & Access,
**F** = Fantasy. Severity: Critical / High / Medium / Low. Effort: S (hours),
M (days), L (a week or more).

---

## Right now: live data is cut off

This was measured in the live database on 27 Oct, with a read-only check the owner approved.

- **RapidAPI has refused every Sofascore call today** (8 of 8 refused). Live scores, fixtures, standings and Fantasy ratings are not updating.
- The cause was the 24–26 Oct weekend: **6,795 calls in 3 days**, 4,000 of them on 25 Oct alone.
- **5,800 of the month's ~9,000 counted calls** came from one habit. During live matches the app re-downloaded each match's line-ups, goal timeline and statistics again and again, instead of once.
- Our own counter says 9,036 calls used. RapidAPI says all 10,000 are used. The difference comes from calls made before the counter existed and from manual jobs that don't count their calls (S2).
- The allowance resets on 10 Nov. Until then, nothing updates unless the plan is upgraded.

Already under way: Build task A (cut the wasted calls) is with the Builder on
branch `claude/rapidapi-call-reduction`. The owner has decided the long-term
split: BSD (free) for match data, and Sofascore on RapidAPI only for Fantasy
ratings and team stats.

---

## Top 10 to fix first

| # | What | Why it matters to fans and sponsors | Sev. | Effort | Codes |
|---|---|---|---|---|---|
| 1 | Sofascore allowance used up; live data frozen until 10 Nov | No live scores, no Fantasy points this week. Ratings for matches finished before ~26 Oct may never be fetched again | Critical | S (plan upgrade) | S1, F17 |
| 2 | The live job re-downloads line-ups, timeline and stats on every update; 15 manual GitHub jobs spend calls without counting them; the safety stop switches itself off if the counter can't be read | Burns the monthly allowance in one weekend | High | M | S2, S3 (+ measured counts) |
| 3 | A prize period is skipped for good if the prize was switched on late or nobody qualified at that moment. Nobody is told | A sponsor's prize week can vanish silently | High | S–M | F2 |
| 4 | A gameweek can wait forever for a missing rating; rating checks stop 14 days after a match although Sofascore can take up to 16 | Points stuck at "pending"; later prizes blocked too | High | M | F4 |
| 5 | The rules promise a 72-hour window to correct scores after a gameweek is final; nothing in the code does it | No answer for a sponsor who asks "what if the data was wrong?" | High | L | F1 |
| 6 | No anti-bot check on sign-up; nothing spots repeat or throwaway emails; one person can make many accounts | Fake accounts can farm a prize challenge | High (for prizes) | M | C11, F8 |
| 7 | Arabic readers first get a French, left-to-right page, then a second download and a full reload of the data; page titles stay French | Half the audience sees the page jump, and screen readers read French | High | M | M2, S6, M3 |
| 8 | Pinch-zoom is switched off and a lot of text is 11px or smaller | Hard to read on small phones in sunlight; nobody can zoom | High | S–M | M1, M5 |
| 9 | Visitors who aren't logged in still download login, two-step sign-in and Fantasy code (~1.7 MB of JavaScript). Standings, Player and Fantasy take 6.6–9 s to show content on a slow phone | Slow first visit on mobile data | Medium | M | S4, S5, S7 |
| 10 | Players can't be opened from match line-ups or club squads; the player page looks like a Fantasy page. New managers must pick all 15 players by hand (no auto-fill) | Fans can't follow players, and new Fantasy players give up | Medium–High | S (links) / M (auto-fill) | U1, U2 |

---

## Full list by area (duplicates merged)

### Data and Sofascore calls
- **Critical** – Allowance used up; provider refusing calls (S1, F17). Effort S.
- **High** – Live job re-downloads line-ups/timeline/stats each update; measured as the main cost (counter data). Effort M.
- **Medium** – 15 manual GitHub jobs call Sofascore without counting (S2). Effort M.
- **Low** – The safety stop switches off if the counter read fails (S3). Effort S.
- **Low–Medium** – The database default data source is still "sportsmonks"; a reset would point live scores at a provider that can't answer (S11). Live value today: `sofascore`. Effort S.
- **Low** – Large dead Sportmonks/Flashscore code: about 8,600 lines of server code, 24 workflows and ~90 scripts. The report lists what is safe to delete and what needs a database change (S12). Effort L.
- **Low–Medium** – Browsers check for new data every 30 s while the server updates only every 120–180 s (S9). Effort S.
- **Medium** – Every visitor re-reads the whole Fantasy hub every 60 s, just to decide whether to show a button (S10). Effort S.

### Speed
- **Medium** – The home page preloads 95 code files (~314 KB compressed), including login and Fantasy code (S4). Effort M–L.
- **Medium** – Fonts are sent with no caching rule, so Arabic readers re-download ~190 KB each visit (S5). Effort S.
- **Medium** – Arabic readers get a French first render, an extra 57 KB and a full data reload (S6; same root cause as M2). Effort M.
- **Medium now, High at scale** – Public pages are rebuilt on every visit and the home page waits on 5 database reads before it appears (S7). Effort M.
- **Medium** – Browsers ask the database directly with nothing in between: ~15–55 requests/s on a normal evening at 5,000 users, 135–217 on a derby night (S8). Effort M.
- **Low** – News fallback pictures are one large size (up to 156 KB) for every screen (S13). Effort S.
- **Baseline** (simulated mid-range phone, slow connection, test copy with no data): main content appears in 2.1–2.6 s on Home and Matches, and in 6.6–9.1 s on Standings, Player and Fantasy. No Lighthouse score yet.

### Security and code health
- **Medium** – 86 package warnings, most of them build tools only. On the server path: `zod`, the MCP connector package and `sanitize-html` (C1). Effort S–M.
- **Medium** – About 54 old one-off GitHub jobs still hold production keys. They are safe only if the GitHub environment settings are strict, which can't be seen from the code (C3). Effort M.
- **Medium for prizes** – No anti-bot check on sign-up (C11; merged with F8 above).
- **Low** – One browser protection (a script policy) is missing; the others are on (measured) (C2). Effort M.
- **Low** – GitHub jobs pin one tool (`setup-bun`) by name instead of exact version (C4). Effort S.
- **Low** – 1 of 10,870 tests fails, only on a newer Bun version (C5). Effort S.
- **Low** – 14 unused packages (C6). Effort S.
- **Low** – Two screens format Morocco dates their own way (C7, F12). Effort S.
- **Low** – Passwords only need 8 characters (C8). Effort S.
- **Low** – Usernames can be tested for existence without a limit (C10). Effort S.
- **Low** – `/mcp` exposes three read-only tools that show only the caller's own data (C12).
- **Low** – Very large files make changes riskier (C9). Effort L.
- **Checked and fine:** no keys in the code or its history; every table is locked; no personal data in public lists; each user can reach only their own photo; admin checks happen on the server with two-step sign-in; test pages are hidden on the live site.

### Fantasy
- **High** – F1, F2, F4 (in the Top 10).
- **High (depends on live data)** – The season prize and the GW1–4 monthly prize can't be paid while rating revisions exist for GW1–4 (F3). Owner decision needed. Effort M.
- **Medium** – A match moved earlier on the same day can leave the old, later deadline in force, so teams can still be edited after kick-off (F7). Effort S.
- **Medium** – Prizes ignore the hidden test-account list, and the prize tie-break differs from the leaderboard's (F6). Effort S.
- **Medium** – The rating used is the first complete Sofascore reading; later changes are ignored. This must be stated in the prize rules (F5). Effort S.
- **Medium (policy)** – A captain who plays 1–9 minutes and is "not rated" scores 0, and the vice-captain is not promoted (F10). Owner decision.
- **Medium** – The exact code that scored a week can't be shown from the project alone; it is assembled in the database (F15). Effort S.
- **Low** – Lock screens use the phone's clock for display; the server still enforces the real deadline (F11). One bad team blocks locking the whole gameweek (F14). A kick-off at exactly midnight is treated as "time unknown" (F16). Old copies of rules in the app's code (F13). A chip could be dropped by an outside app (F9).
- **Checked and fine:** the points maths (10 worked examples), captain/vice/auto-subs, deadline enforcement by the server, editing other users' teams is impossible, invite codes can't be guessed, 322 Fantasy tests pass. Morocco stays on UTC+0 all year.

### UX and design
- **Medium** – Player page still Fantasy-framed and not linked from line-ups/squads (U1). Effort S (links) / M.
- **High** – No auto-fill for the first 15-player squad (U2). Effort M.
- **Medium** – Matches screen: four bands of controls before the first match (U3). Effort M.
- **Medium** – Two different styles for empty/error/loading screens (public screens vs Fantasy) (U5). Effort M.
- **Medium** – A visitor who isn't logged in has no way to the Fantasy leaderboard or leagues (U18). Effort S.
- **Medium** – Fantasy screens have no tab bar, so moving between them means going back to the hub (U15). Effort M.
- **Medium** – The first-visit language pop-up blocks every page, including articles opened from Google or WhatsApp (U14). Effort M.
- **Medium** – "Composer l'équipe" means both "create" and "pick this week" (U8). Effort S.
- **Medium** – The join-league screen has a greyed button with no explanation (U9). Effort S.
- **Medium** – Sign-up asks for 5 fields; the Google/Apple buttons sit below them (U13). Effort M.
- **Medium (business)** – A sponsor can appear only on the prize card. "Presented by" placements exist only in the pitch demo. Seven candidate places are listed (U17).
- **Low** – Old unused design components (U6). Desktop home shows two live strips (U4). Leftover comments and dead code (U16). A prize pop-up adds a tap the first time (U19). "Prochain match" label (U11).
- **Taps from Home (clicked):** live match 1 · today's scores 1 · standings 2 · my Fantasy team 2 · Fantasy leaderboard 2 (logged in) or no way at all (not logged in) · a player 2 plus typing.

### Mobile, Arabic and access
- **High** – M1 and M2 (in the Top 10).
- **Medium** – Browser-tab titles stay French in Arabic (M3). Effort S.
- **Medium** – Green and magenta text on pale chips (e.g. "Blessé", "Journée double") is below the readable contrast level. Fix by adding a darker text shade; brand colours stay unchanged (M4). Effort S.
- **Medium** – 28–138 pieces of text under 12px per screen (M5). Effort S–M.
- **Medium (unmeasured)** – Colour code may not work on old Android phones that never update their browser engine (M8). Effort M to check.
- **Low** – Tiny Terms/Privacy links (M6). Bars cover half the screen in landscape (M7). Four small items (M9).
- **Checked and fine:** no sideways scrolling at 320–390px in French or Arabic; right-to-left layout is solid; scores display correctly in Arabic; no unlabelled buttons or images; dark theme passes contrast.

---

## Sofascore calls per month

| | Calls |
|---|---|
| **Measured, 14–27 Oct** (counter) | Quiet days ~50/day. Match days: 311–451 (17–20 Oct), then 1,755 / 4,000 / 1,040 (24–26 Oct) |
| **Used this month** | Counter 9,036 (incl. a 472 correction); RapidAPI says 10,000 |
| **Design estimate if the waste is removed** (keeping Sofascore for everything) | 3,700–6,300 / month |
| **With the owner's new split** (BSD for match data, Sofascore for ratings + team stats only) | about 300 / month |
| **At 5,000 active users** | **The same as now.** Every call is made on a timer or by staff, never by a fan opening a page, so calls do not grow with users |

What does grow with users is database traffic (S8): about 15–55 requests a
second on a normal evening and 135–217 on a derby night at 5,000 active users.

---

## How to test Android without an Android phone

The Android app is a shell that opens botolago.com, so most Android problems are website problems.

1. **Chrome on your computer, device mode** (free, today): screen sizes, slow network, Arabic layout.
2. **Android Studio emulator** (free; needs a computer with 8 GB+ memory): old Android versions, largest font size, the TalkBack screen reader, and installing the app file that Codemagic builds.
3. **BrowserStack or LambdaTest** (paid): 3–4 real cheap phones (Samsung A, Redmi, Tecno/Infinix, one old Android) before each big release.
4. **Firebase Test Lab**: a quick crash check after each new app build.

---

## Decisions and checks only you can make

1. **Sofascore plan:** upgrade now to restore live data before Wednesday's matches, or wait for 10 Nov?
2. **Season prize (F3):** which GW1–4 numbers count, the original final points or the later rating revision?
3. **Missing ratings (F4):** what happens to a player who played 10+ minutes and never gets a Sofascore rating? Is a reviewed manual entry acceptable?
4. **Captain rule (F10):** keep "captain played = counts", or give the vice-captain the armband when the captain is "not rated"?
5. **Sponsor prizes (F2):** the prize must be switched on before its first gameweek finishes, or the code must change first.
6. **Supabase dashboard** (C8, C11): confirm two-step sign-in is on, plus the password rules, the anti-bot setting and the sign-up limits.
7. **GitHub settings** (C3): do the production environments require your approval and allow only `main`? Which old one-off jobs may be retired?
8. **Pinch-zoom (M1):** OK to allow zoom and make input text 16px? That is a small visual change.
9. **Arabic first page (M2):** OK to remember the language in a cookie so the server can send Arabic straight away?
10. **Which phones** do your fans use? This sets the real-device test list.
