# Review log

How the audit team worked: every brief, every review verdict, and the final
result, in plain language. Newest phase at the bottom.

Team: the Lead reviews; five auditors (workers) do the hands-on checks.
Verdicts: **APPROVED** (correct, specific, proven), **REVISE** (send back a
numbered list of fixes), **REJECTED** (wrong approach, new brief). At most 3
rounds per task.

---

## Phase 1 – Audit (no code changes)

Started 2026-10-27. All five auditors ran at the same time.

### Rules every auditor was given

- Look only. No file changes, no commits.
- No access to any database (live or test copy).
- No calls to Sofascore/RapidAPI (each call spends the 10,000-a-month budget).
- No logging in to botolago.com. At most 15 visits to public pages, like an
  ordinary visitor, to measure speed or take screenshots.
- Every finding needs proof: the file and line, a measured number, or a
  screenshot. Generic advice is rejected.
- If unsure, ask the Lead instead of guessing.

### Briefs

| Auditor | Looks at | Report must include |
|---|---|---|
| 1. Speed & Data | Page weight, images, fonts, caching; every place that calls Sofascore and how often; leftover Sportmonks/Flashscore code | Sofascore calls per day/month estimate |
| 2. Code Health & Security | Leaked keys, who can read whose data, login rules, admin protection, bugs, old packages, risky old GitHub automations | Attack path for each security finding |
| 3. UX & Design | Taps to reach live scores / standings / Fantasy, missing loading/error/empty screens, confusing flows, look vs FotMob/Sofascore, places for sponsors | Tap-count table, screenshots |
| 4. Mobile, Language & Access | Small screens (320–390px), tap target size, Arabic right-to-left, mixed text, contrast, font size, screen readers | Measured numbers, how to test Android without a phone |
| 5. Fantasy Referee | Points maths, deadlines in Morocco time (incl. Ramadan time change), late stats, cheating risks for sponsored challenges | Worked scoring examples traced through the code |

### Task 1 – Speed & Data

**Round 1 – REVISE.** 13 findings plus a Sofascore call estimate. I checked the
key ones against the code and they hold: the budget stop, the 15 manual
GitHub jobs that spend Sofascore calls without counting them, the guard that
switches itself off when the database read fails, Arabic readers getting a
French page first, and the Fantasy check every 60 seconds. Sent back because:
1. The monthly hard stop was given as two different numbers; say which one is in force.
2. The 5,000-user load estimate assumed all 5,000 on the home page at once. Redo it with a realistic share online at the same time (normal evening and derby night).
3. It guessed the hosting provider (Cloudflare) without proof; find out where the site is really served.
4. No page-speed baseline (Lighthouse score, load time per page) yet. Phase 2 needs one.
5. Add the plain statement that Sofascore calls do not grow with users.

**Round 2 – APPROVED.** All five points fixed. I re-checked the hosting answer
(Lovable hosting on Cloudflare) in the deployment notes and the build output.
- The hard stop in force is 9,700 calls a month.
- Load at 5,000 active users: about 15–55 requests a second to the database on a normal evening, and 135–217 on a derby night. Medium now; High at around 5 times that audience.
- Speed baseline (simulated mid-range phone on a slow connection, test copy with no data):
  - The main picture or text appears in 2.1–2.6 s on Home and Matches, and 6.6–9.1 s on Standings, Player and Fantasy.
  - Every page downloads about 1.7 MB of JavaScript before compression.
  - No Lighthouse score: the tool is not installed here.
  - These numbers compare pages with each other. They are not live-site times; Phase 2 will add a measurement of the live site.

### Task 2 – Code Health & Security

**Round 1 – REVISE.** No leaked keys, every table locked, admin checks done on
the server, 1 failing test out of 10,870 (depends on the Bun version). Claims
I re-checked held up. Sent back because:
1. Photo storage (user avatars) was not checked.
2. Of the 53 functions anyone can call without logging in, only one was read; read every one that returns user data and check for leaked emails or IDs.
3. Security headers were guessed; measure them (3 public requests allowed).
4. The local settings file has authenticator-app sign-in switched off; find out whether that reaches the live site.
5. Report sign-up rate limits and whether any anti-bot check exists (needed for prize challenges).
6. Check the public `/mcp` connection point: what it exposes and whether a faked header can mislead it.

**Round 2 – APPROVED.** All six points fixed, with proof. I re-checked two
myself: each user can reach only their own photo in storage, and sign-up sends
no anti-bot check.
- Storage and public functions: no personal data leaks. Leaderboards show only team names or partly hidden usernames to people who are not logged in.
- Security headers measured on the live site: most protections are in place; one extra browser protection is missing (Low).
- The authenticator-app setting in the local file never reaches the live site. You still need to confirm it in the Supabase dashboard.
- New: sign-up has no anti-bot check (Medium for prize challenges). This agrees with the Fantasy referee's finding; they are merged as one item, with no conflict between them.
- The site is served through Cloudflare (measured), which settles the hosting question.

### Task 3 – UX & Design

**Round 1 – REVISE.** 17 findings, seven places for sponsors, screenshots. Sent back because:
1. Its biggest finding (no player page for fans) missed today's change that added a football profile to the player page. It must be restated.
2. Tap counts were worked out from the code, not tapped through; they must be clicked for real.
3. Three findings might come only from demo data; settle each from the code.
4. Whether Google/Apple sign-in is on was asked instead of checked.
5. The language-pop-up screenshot was lost; take it again.
6. Confirm the main screens on the real site (5 public pages allowed).

**Round 2 – APPROVED.** All six points fixed. I re-checked the Google/Apple sign-in switch and the demo-only league names in the code.
- Player page: lowered from High to Medium. Since today's change, fans get season stats and the last five matches. But the page still looks like a Fantasy page, and club squads and match line-ups don't link to it.
- Taps were clicked for real: live match 1, today's scores 1, standings 2, a player 2 plus typing.
- New: a visitor who isn't logged in has no way to reach the Fantasy leaderboard (U18). A prize pop-up adds one tap the first time (U19, Low).
- Dropped as demo-only: three findings (a pre-filled squad for visitors, odd league names, the Arabic slider dots).
- Google/Apple sign-in buttons are switched on in the code; whether they work on the live site depends on your Supabase settings.

### Task 4 – Mobile, Language & Access

**Round 1 – APPROVED.** 9 findings, all measured (sizes, contrast, tap areas)
rather than guessed, at 320/360/390px in French and Arabic. I re-checked the
pinch-zoom block, the French-first page and the 11px text size in the code.
- High: pinch-zoom is switched off; Arabic readers get a French page first.
- Medium: French tab titles in Arabic, low-contrast green/magenta chips, a lot of tiny text, and a possible problem on old Android phones.
- Fine: no sideways scrolling, right-to-left layout solid, no unlabelled buttons.
- Includes a step-by-step way to test Android without a phone.

Overlap with Speed (French-first page for Arabic readers): same cause, merged into one item. No conflict.

### Task 5 – Fantasy Referee

**Round 1 – REVISE (small).** 16 findings and 10 worked scoring examples, run
through the real scoring code. The points maths is correct. Deadlines are
enforced by the server clock with no grace period. The auditor also corrected
my brief: since 20 Sept 2026 Morocco stays on UTC+0 all year, so there is no
Ramadan clock change. I checked the two most serious findings myself and both
are real:
- A prize period is skipped for good if the prize was switched on late or nobody qualified.
- A match moved earlier on the day can leave the old, later deadline in place, so teams can still be edited after kick-off.

Sent back because:
1. One finding (a chip lost when making transfers) did not show whether the real app ever triggers it; prove it or lower it.
2. It must spell out what the possible Sofascore blackout until 10 Nov does to Fantasy (late ratings, stuck gameweek).

**Round 2 – APPROVED.** Both points fixed:
1. Chip finding: the real app always sends the active chip, so this is only a risk from broken or outside apps. Lowered to Low.
2. New finding F17 (High while Sofascore calls are at zero). I checked the stop in the code myself:
   - Every data job stops: live scores, ratings, fixtures, standings.
   - The jobs still report "ok", so only one health check shows the problem.
   - Deadlines and gameweeks that already have all their ratings carry on as normal.
   - Matches still missing ratings cannot finish. Fans see frozen scores and "points pending", and prizes are held back.
   - Matches finished before about 26 Oct may never be checked for ratings again.


### Side task – testing a second data feed (SportAPI on RapidAPI)

Asked for by the owner on 27 Oct, after the Sofascore allowance may have run
out. The Lead made the test calls directly, using the key the owner provided.
5 calls on the SportAPI free plan (50 a month; 45 left afterwards). It does
not use the main Sofascore allowance.

Result: **passed.**
- Botola Pro 2026-27 is there, with the same season number BotolaGO already uses (102220).
- Results up to round 5 (24–25 Oct) are there.
- Upcoming fixtures from 28 Oct are there.
- Player ratings for a finished match: 32 of 32 players who played are rated.
- Player IDs are identical to Sofascore's own (checked against IDs already in the project).

Not tested: a match while it is live (none was being played at the time).

### Owner decision (27 Oct) – data sources

The owner chose: **BSD for match data** (fixtures, scores, events, line-ups,
stats) and **RapidAPI (Sofascore data) for Fantasy ratings**.

The Lead checked BSD with 5 free calls (sports.bzzoiro.com; free up to 7,500 a day).

What BSD has:
- This season: Botola Pro 2026-27 (BSD's season number 1962). Round 5 results match SportAPI.
- Kick-off times, status, half-time and full-time scores.
- Line-ups with positions, shirt numbers, captain, substitution minutes, goals and cards per player, and minutes played (32 of 32 players who played).
- Team card counts.
- Each player carries Sofascore's own ID (`api_id`), so the two sources can be matched without guesswork.
- During a match, its live feed carries the minute and a goal/card timeline. This was seen on other leagues; no Botola match was live during the test.

What BSD does not have for Botola now:
- Team stats: possession, shots, corners, fouls are empty.
- Detailed player stats: passes, duels, xG are all zero.
- Player ratings.
- Referee and stadium.
- A goal timeline after the match, unless BotolaGO saves it while the match is live.

Lead's recommendation to the owner:
1. Fantasy ratings come from RapidAPI, as decided.
2. Fetch the team stats once per finished match from RapidAPI as well (about 35 calls a month).
3. Save the live goal timeline from BSD while each match is on.
4. Keep RapidAPI as an automatic backup for the live score if BSD stops answering.

### Owner decision (27 Oct) – which RapidAPI feed

Sofascore (the current feed) is used for Fantasy ratings and team match stats.
SportAPI stays on its free plan as a spare.

### Build task A – too many Sofascore calls (asked for by the owner ahead of the phase order)

**Brief to the Builder:**
- Find every place that spends Sofascore calls, how often each runs, and whether it is counted and capped.
- Show the main causes of over-spending, with proof.
- Fix them on a separate branch, `claude/rapidapi-call-reduction`, with tests.
- Not allowed: touching the database, calling any provider, deploying, changing Fantasy scoring or screens, or building BSD.
- Next: a separate Tester checks the work, then the Lead reviews it, then the owner decides.

### Live call-counter check (27 Oct, read-only, approved by the owner)

Only SELECT queries; nothing written.
- RapidAPI refused 8 of 8 calls today: the allowance is used up.
- 24–26 Oct: 6,795 calls. Re-downloading line-ups, timeline and stats during live matches accounts for about 5,800 of the month's calls.
- These numbers were passed to the Builder as evidence.

## Phase 1 result

All five reports were approved, in 1–2 rounds each. The merged report is in
`docs/review/PHASE1_AUDIT_REPORT_2026-10-27.md`, and the five full reports are
in `docs/review/phase1-2026-10-27/`. Waiting for the owner's approval before Phase 2.

### Owner decisions (27 Oct)

- Phase 1 approved.
- No Sofascore plan upgrade. SportAPI runs the app for the rest of this period.
- The Builder's task was extended with A2: a switch that lets the app use SportAPI with the same data and IDs. The Lead fetched 5 more SportAPI sample replies (40 free calls left) as test examples.

## Phase 2 – Plan

Written by the Lead from the approved audit: `docs/review/PHASE2_PLAN_2026-10-27.md`.
- Batch 0 (emergency) is under way.
- Then quick wins, Fantasy fairness, BSD, anti-bot, Arabic first screen, speed, the score-correction process, and tidy-up.
- Targets cover API calls, load time, Lighthouse, the Arabic first screen and taps.

Waiting for the owner's approval.

