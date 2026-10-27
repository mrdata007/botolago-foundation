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

