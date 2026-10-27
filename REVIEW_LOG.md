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

