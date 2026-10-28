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

### Owner decisions (27 Oct, later)

- SportAPI bought: 15,000 calls from 27 Oct until the same day next month.
- The Builder was told to keep the SportAPI call count separate from the old Sofascore count. Otherwise this month's ~9,000 old calls would trip the safety stop almost at once.
- Phase 2 approved.

## Phase 3 – Design proposals

Started 27 Oct. Owner rule added: **the Fantasy pitch and the jerseys must not change.**

Two operators run at the same time:
- **UX & Design:** a design system built on the existing brand; prototypes of Home, Live match, Standings, Player page, Fantasy team picker and leaderboard, in French and Arabic; before/after screenshots at 390px and 1280px; each change explained in one line and tied to an audit finding; 3–5 sponsor spots.
- **Mobile & Arabic:** writes the size, Arabic, tap-target and contrast rules first, so UX can follow them; then measures every prototype at 320/360/390px in French and Arabic.

If the two disagree, the Lead decides and records why here.

### Phase 3 – round 1

**Mobile & Arabic – APPROVED.**
- Wrote the size, Arabic, tap-target and colour rules first. Each rule is backed by a measurement; for example, Arabic letters measure about 22% smaller than French at the same size, so Arabic text gets 1px more.
- Tested all 14 mock-ups (112 runs, 320–390px, French and Arabic, light and dark). Zero sideways scrolling, zero tiny text, zero small tap targets. Found 10 issues to fix.

**UX & Design – REVISE.** 6 redesigns and 5 sponsor spots, French and Arabic, with before/after screenshots. The pitch and jerseys are unchanged (pasted in as an image of today's pitch). Sent back with 14 fixes:
- Team picker: the pitch starts too low on a phone; Bench Boost and Free Hit are hidden; the save bar covers players.
- Home: the Fantasy deadline is missing from the first screen; two "Classement" buttons look alike, and one is cut off.
- The Mobile worker's issues: Arabic table header, text direction in the language bar, score covering the crests, text on club colours, landscape bars, tab rows, the screen-reader tab role.
- Arabic pages must use the app's existing Arabic words (تعزيز الاحتياط, الضربة الحرة…), not English terms.

**Lead decisions** (where the two workers asked):
- Arabic gets +1px on small text (measured reason).
- Darker text-only shades count as allowed additions.
- Visitors who are not logged in see team names only on the leaderboard.
- Club-colour captions may be dropped.
- Compact landscape menu approved.
- No pure black text on club colours; labels go on a neutral pill instead.
- Home team on the right in Arabic is kept (as today); to confirm with the owner.

Left for the owner: auto-fill picking rules, sponsor wording, a separate player page route, official Arabic names, and language cookie first or not.

### Phase 3 – round 2

**UX & Design – APPROVED.** All 14 fixes done. I checked the screenshots myself:
- Pitch back near its old height (y=342 French, 362 Arabic; it was 345).
- Bench Boost and Free Hit visible in Arabic.
- Save button moved to the top.
- Fantasy deadline on the first screen of Home.
- Shortcut buttons not cut off.
- Re-measured: no sideways scrolling, no tiny text, no small tap targets, at 320/360/390 in French and Arabic.

Known issue to fix when building: on the leaderboard mock-up, the sample points don't add up (the top 3 show fewer points than "my" team at rank 330). This is mock data only.

Saved in `docs/review/phase3-2026-10-27/`: design system, proposals, mobile spec and review, the working mock-ups (`proto/`), phone screenshots, and before/after comparisons (`compare/`).

Phase 3 result: waiting for the owner's approval and answers.

### Owner decisions on Phase 3 (27 Oct)

1. Phase 3 approved.
2. Auto-fill picks a mix (form and price), never injured players.
3. Sponsor wording: "Présenté par".
4. The player page stays inside Fantasy, with a football look.
5. Official Arabic names come from the API. Checked: SportAPI/Sofascore data carries official Arabic names for clubs and players (e.g. الكوكب المراكشي, أمين الوعد).

Not answered: should the home team stay on the right in Arabic? It stays as today unless the owner says otherwise.

## Phase 4 – Build

### Build task B – Batch 1 website quick wins

**Brief to the Builder:**
- Work on branch `claude/batch1-web-quick-wins`.
- Make player names in line-ups and squads open the player page.
- Give visitors who are not logged in a way to the Fantasy leaderboard.
- Clearer wording on three screens; Arabic page titles.
- Darker text shades for small coloured text; pinch-zoom back with 16px inputs; small text up to 12px (13px in Arabic).
- Bigger tap areas for the legal links; lighter background checks in the browser.
- The pitch and jerseys must not change.
- Not allowed: database, API, deploying, opening a pull request, merging.
- AGENTS.md screen rules apply: write a brief first, take before/after screenshots in French and Arabic, and run the tests.

**Builder round 1 – done, sent to the Tester.**
- 9 commits on `claude/batch1-web-quick-wins`; all nine items built.
- Tests: 10,890 pass, 1 known failure (Bun version).
- 0 sideways scrolling.
- Small coloured text now 6.0–6.2:1 contrast (was 3.9–4.0).
- Legal links are now 44px tall.
- The pitch and jerseys are identical (783 elements compared).

Open concern sent to the Tester: the new player links load the whole Fantasy player list on match pages. The Tester must measure the extra data per page view.

**Tester round 1 – FAIL** (4 Medium, 6 Low; nothing serious).
Builder numbers confirmed:
- Tests and contrast pass.
- The pitch is pixel-identical (0 differing pixels in 8 views).
- Background checks on Home dropped from 14 to 6 in 150 seconds.

Problems found:
1. Player links download the whole Fantasy player list: about 74 KB extra per match or club page for every visitor.
2. The keyboard focus outline on linked rows is cut off.
3. The visitor "Ligues" tile leads to a sign-in wall.
4. Arabic text at +1px wraps the player stat lines badly on 320px phones.
Also: the visitor leaderboard tile sits 1,500px down the page (defeats the goal), and an Arabic Home card is cut off at 320px.

Lead sent these 6 fixes back to the Builder. Accepted as they are:
- Arabic titles set after loading (fixed in Batch 4).
- A few tiny symbols still under 12px.
- Fantasy availability may be up to 5 minutes old.

**Builder round 2 – all 6 fixes pushed (5dde976).**
- Player links now ask only for the teams on screen (3 requests instead of 8), only when the line-up tab is open. The size is calculated, not yet measured.
- Visitor leaderboard tiles moved up from about 1,500px to about 350–400px.
- The "Ligues" tile is honestly labelled "Créer ou rejoindre une ligue".
- Arabic stat lines no longer break inside an item.
- Focus outline visible.

Tests unchanged (10,890 pass, 1 known failure). Sent to the Tester for round 2, with the instruction to measure the page weight for real.

**Tester round 2 – PASS.** Everything was measured:
- Player links: 3 requests and about 6.7 KB on a match page, 2 requests and about 3.5 KB on a club page (was 8 requests and 74 KB). Nothing loads until the line-up or squad tab is opened.
- Visitor leaderboard tiles at 342–403px from the top.
- 0 sideways scrolling on 44 screen states.
- The pitch is pixel-identical.
- Tests unchanged.

**Lead final review – APPROVED.** I read the main code changes: zoom, background checks, player links, and the Fantasy availability check.
- They match what the Tester measured.
- Only website code changed: no database, no server functions.
- Ready for the owner. Nothing is merged.

### Batch 1 – owner approval and release (27 Oct)

The owner said yes to merging, and asked the Lead to publish it in Lovable.
- `main` had moved on (#566, page speed and security headers). Four files clashed, because both sides removed the zoom cap on the same day.
- The Lead merged `main` into the Batch 1 branch: kept main's wording, and kept both sets of tests.
- Re-checked: typecheck clean, lint 0 errors, formatting clean, 10,896 tests pass (1 known failure), i18n gate passes, build passes.
- Pull request #569 opened. Waiting for GitHub's checks before merging; then publish in Lovable (project "BotolaGO").

**Merged** (#569 → `main`, 86fb535) after both GitHub checks passed. Codex's optional review was still running.

**Not published yet: Lovable is out of step with GitHub.**
- At 15:47 Lovable made its own change: its build tool went from 2.23.1 to 2.26.5. It put that on side branch `lovable-sync-1793116085`, not on `main`.
- Since then Lovable has not taken anything from `main`: neither #566 nor #569.
- Publishing now would put an older version live, without today's work.

The Lead tested `main` combined with Lovable's change:
- It combines without clashes.
- The build passes and typecheck is clean.
- Tests: 10,895 pass. Two failures: the known Bun-version test, and a timing-sensitive animation test that passed 3 out of 3 on its own, with and without the change.

Asked the owner before combining the two on `main`.

**Owner approved (28 Oct): bring Lovable's change into `main`.** Pull request #570 opened.
- Codex found nothing; both checks passed.
- `main` moved twice while it waited: #569, then #567 "SEO pass 1" from another session. The branch was brought up to date each time, and the checks are running again.
- Publishing will also put #566 (page speed) and #567 (SEO) live, because both are on `main`.
- #567's database change (20261027150000) is written so the website behaves the same before and after it is applied (migration header, "Rollout"). Safe to publish without it.

**#570 merged** (9d2f38e). Lovable took in every change up to it.

**Published (28 Oct, 00:39 UTC).**
- Checked on the live site: botolago.com reports version 9d2f38e, and the viewport no longer blocks zoom.
- Home, Matches and Fantasy load normally.
- On a 390px phone, a visitor who is not logged in sees "Classement général" at 332px from the top (screenshot `docs/review/batch1-2026-10-27/live-fantasy-fr-390.png`).
- Also live with it: #566 (page speed, security headers) and #567 (SEO).

Seen on the live Fantasy page: Gameweek 5 still shows "EN DIRECT", with a deadline of Saturday 24 Oct. This fits the Sofascore cut-off (ratings missing, gameweek cannot finish). Batch 0 (SportAPI) is the fix.

**Owner check on the live site (28 Oct): "nothing looks wrong."** Batch 1 is closed.

### Build task A (Batch 0) – restarted (28 Oct)

The first Builder was stopped from the owner's side (it cannot be resumed).
- Its unfinished work (16 files) was saved as a clearly labelled "wip" commit 71f819c on `claude/rapidapi-call-reduction`.
- With the owner's yes, a new Builder took over from that commit.
- Its brief adds: check the earlier unfinished work critically, bring in the latest `main`, save to GitHub after every step, separate call budgets for each provider, and owner steps written click by click.
- Target: ready to put live before Friday 30 Oct 17:30 UTC.

**Builder (restarted) – done**, pushed 6571fbe on `claude/rapidapi-call-reduction`. Report: `docs/review/batch0-2026-10-28/BUILDER_REPORT.md`.

- **Call waste:**
  - During a match, the goal/card timeline is read only when the score changes or a half/extra time/penalties starts.
  - Line-ups are read once at kick-off; stats once at the final whistle.
  - Finished matches are never read again, and nothing is fetched twice in one run.
  - If the counter cannot be read, the safety stop stays on.
  - The manual scripts are capped and keep a 1,500-call reserve.
  - Estimate (a calculation, not a measurement): about 185 calls on a 4-match day; 8-match day 425 → 275.
- **SportAPI switch:** setting `RAPIDAPI_HOST=sportapi7.p.rapidapi.com` turns it on. Any other value is refused. 35 tests.
- **Per-provider budgets:** migration 20261028100000 plus a guarded apply script and 60 database tests. The database tests were not run (no Docker); CI decides.
- **Tests:** 11,035 pass, 1 known failure. Lint, typecheck, migrations check and build are clean.
- **Lead check:** confirmed `main` never read a `RAPIDAPI_HOST` setting before (always Sofascore).
- **Lead note:** the Builder tried its SQL on a local throwaway PostgreSQL. This is not a shared database, so the one-writer rule is not affected. Flagged.
- **Trade-off to put to the owner:** cards between goals appear only at half time and full time. Showing them as they happen would cost about 4 more calls per match.

Sent to a separate Tester.

**Tester round 1 – PASS WITH CONDITIONS** (no Critical/High, 3 Medium).

Simulated match days:
- Live job calls: 4 matches 204 → 128, and 8 matches 361 → 209.
- Whole day: about 188 calls for 4 matches and about 281 for 8.
- Scores, line-ups, final events and stats are stored correctly. Nothing is fetched twice.

SportAPI translation: works with the real captured replies. An unset address behaves as today; a wrong address is refused safely.

Migration: correct and safe. Database tests were not run (no Docker); CI decides.

Problems:
1. Cards between goals show up to about 62 minutes late.
2. Late-published team stats may stay partial for up to 3 days.
3. The owner steps were in an unsafe order (key set before the new code), with no pause/wait, no check, and an incomplete undo.

Lead sent fixes:
- A capped timeline read every 15 minutes, as an owner setting.
- One follow-up stats read 90 minutes after the match, only if the stats are partial.
- The owner steps rewritten in a safe order, click by click.
- Formatting fixed.

**Builder round 2 – fixes pushed.**
- **Cards:** an extra timeline read every 15 minutes per live match (an owner setting). The red at 33' now shows 3 minutes late (was 6); the yellow at 80' 7 minutes late (was 31); worst case about 15 minutes (was about 62).
- **Late stats:** one follow-up read 90 minutes to 3 hours after a match, only if the stats are partial.
- **Owner steps:** rewritten a–h in a safe order, click by click.
- **Calls per day:** about 210 on a 4-match day and about 325 on an 8-match day. Well within 15,000 a month (roughly 4,300 a month).
- **Tests:** 11,042 pass, 1 known failure.
- **Database change:** edited in place before being applied anywhere, which is allowed for an unapplied migration (CLAUDE.md).

Sent to the Tester for round 2.

**Tester round 2 – PASS WITH CONDITIONS.**
- Card fix confirmed: worst delay 16 minutes, average 6.6.
- The late-stats read is correct.
- Migration and apply script consistent: all 8 code fingerprints the script checks match.
- Owner steps safe.
- New N1 (Medium): if the match-schedule read fails, the app would make about 2.6 times as many timeline calls.
- Low: small wording gaps in the owner steps.

Round 3 (last allowed) sent: when that read fails, skip the extra reads (fail closed), plus the owner-step tweaks.

**Tester round 3 – PASS.**
- N1 closed: if the schedule cannot be read, the extra reads are skipped.
- Owner steps complete. Only nit: three stale line numbers in step g3, which is harmless.
- Tests: 11,043 pass, 1 known failure.

**Lead final review – APPROVED.** I read the address choice (unset = Sofascore as today; only the two approved addresses are accepted, anything else is refused before any call) and the database change (adds to what exists, keeps the Sofascore figures, every function locked with security definer and `search_path = ''`).

Pull request #572 opened so CI runs the database tests that could not run here. Not merged: the owner's steps start with the merge.

**PR #572 CI: green**, including `database-quality`: the new database tests passed in CI. The branch was updated with `main` (#571, font caching only, no database change); the checks are re-running. Waiting for the owner: steps by themselves (1) or authorise the Lead (2).

### Batch 0 – going live (28 Oct, Lead acting with the owner's authorisation, option 2)

- 03:05 One-writer check. No other session was writing; one session was waiting for a command approval, and the owner was told not to approve it. Recorded the settings: mode `live`, live refresh on.
- 03:10 #572 merged (150066b). Live refresh and email paused with `notification_email_configure('off', null, null, false)`.
- 03:15 Waited 5 minutes. No run in flight and no data-job query active.
- Guarded apply script, copied from `main`:
  - Safety checks first: all 8 code fingerprints matched production.
  - Full test run: "Rehearsal passed". Read back afterwards: nothing kept.
  - Real run: "Applied".
  - Read back: migration recorded; SportAPI 15,000 / 13,500 / 14,700, reset day 27, 0 used; Sofascore unchanged (10,000 of 10,000).
- 03:21 Deploy workflow run #20 (exact commit 150066b): success. **It did not wait for the owner's approval:** the `production-admin-activation` environment has no required reviewer. This confirms Phase 1 finding C3.
- Setting `RAPIDAPI_HOST`: the Supabase tool asks the owner to type the value, and the prompt went unanswered twice (not shown on the owner's phone). Not set yet.
- 03:28 Live refresh and email restored to the recorded values (`live`, on); every other setting is unchanged.
  - With no address set, the new code behaves as before the pause (Sofascore, refused until 10 Nov).
  - Remaining owner action: add the Supabase secret `RAPIDAPI_HOST=sportapi7.p.rapidapi.com` in the dashboard. It takes effect on the next run, with no redeploy. The Lead then checks.

