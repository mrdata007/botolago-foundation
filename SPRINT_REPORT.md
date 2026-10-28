# Sprint report

Sprint 1 (speed and stability) is finished, on the branch `sprint-1-performance`.
**Nothing is live yet.** The live site is unchanged until you approve and publish.
Sprint 2 has not started.

## Results

All numbers are for the home page on a phone-sized screen (375 px wide). "Before" is
the code as it was on `main` (commit `9d2f38e`); "After S1" is this branch. Both were
built and measured the same way on the same test machine, so they can be compared
with each other. The raw reports are in `audit/before/` and `audit/after-sprint-1/`.

| Measure                     | Before | After S1 | After S2 | Target |
| --------------------------- | ------ | -------- | -------- | ------ |
| Requests (home, first load) | 157    | 119      |          | < 50   |
| JS files (home, first load) | 123    | 85       |          | < 20   |
| Load time (mobile, slow 4G) | 6.6 s  | 5.9 s    |          | ~3 s   |
| Layout shift (CLS), French  | 0.009  | 0.009    |          | < 0.1  |
| Layout shift (CLS), Arabic  | 0.90   | 0.90     |          | < 0.1  |
| Lighthouse performance      | 29     | 31       |          |        |
| Lighthouse accessibility    | 100    | 100      |          |        |
| Installable                 | No     | No       |          | Yes    |

How to read this:

- **"First load"** is what the phone downloads to show the page. About two seconds
  after the page settles, the app also quietly downloads the other main sections
  (Matches, Fantasy, News…) so that tapping them feels instant. That was designed on
  purpose before this sprint, and you chose to keep it. Counting those too: requests
  went from 282 to 219, and JS files from 232 to 177.
- **Lighthouse** is Google's speed test. It runs on a pretend slow phone. This test
  machine has a slower processor than a real phone, so its scores are lower than the
  live site's (the live site scored **66** when I measured it on 28 October). Only
  compare "Before" with "After" in this table, not with the live score. Lighthouse
  scores change a little from run to run, so each one is the middle of 3 runs.
- **Load time** is the full page load on a slowed-down 4G connection (Playwright,
  a tool that controls a real browser). It varies by about 0.2 s between runs.
- **CLS** measures how much the page jumps while it loads. Under 0.1 is good.

**I did not reach the targets.** I explain why below, and what would get closer.

## What was done (one line per item, plain words)

- **FE-C1 (load pages on demand): already done, nothing to change.** In this version
  of TanStack Start, every page's code is already its own file, loaded only when
  needed. I checked: the admin pages are not downloaded on the home page. The setting
  the audit names (`autoCodeSplitting`) no longer exists in Start; it is always on.
- **FE-C2 (group libraries): done.** The big shared libraries (React, TanStack,
  Supabase, the animation library, Radix and the icons) now each come as one file,
  instead of being spread over dozens of tiny ones. Home page script files: 123 → 86,
  with no extra code downloaded (85 after FE-C3).
- **FE-C3 (remove fake test data): done.** The made-up players, clubs and articles
  used for testing are no longer downloaded by the live site: not by Football, News,
  Pronostics and Pépites, and (with your OK) not by Fantasy either. Fantasy's
  "import the team I built on my phone" feature still works the same; it now fetches
  its sample data only at the moment it needs it. The test files are kept, because
  development and the automatic tests use them.
- **FE-M1 (real release version): already done, small addition.** The live site
  already shows the real code version (`9d2f38e…`) in its page and its response. I
  added a backup: if a hosting service ever builds without the code history, the
  version now comes from that service instead of showing "unknown".
- **FE-M2 (fonts shifting text): already done, nothing to change.** The fallback fonts
  matched in size to Manrope and Changa were already in place, and only two fonts are
  preloaded. I measured on a slow network: the whole French page moves by 0.009, and
  the Arabic fonts add about 0.02. Both are far too small to see.
- **FE-M3 (reserve space for images): already done, nothing to change.** I checked
  every image on 12 pages (home, matches, a match, news, an article, clubs, a club,
  standings, Fantasy, players, top players, Pépites). All have a size, and images
  further down the page load only when you scroll to them.
- **FE-H3 (pinch-zoom): already done, nothing to change.** The page allows zooming,
  and every text box is 16 px on phones, so iPhones do not zoom in when you tap one.
  This was fixed on 27 October, the same day as the audit.
- **Checks added for later:** scripts that measure the home page
  (`scripts/qa/measure-home.mjs`, `scripts/qa/lighthouse-home.sh`) and that open the
  main pages in French and Arabic to look for errors (`scripts/qa/smoke-pages.mjs`).

After every item I ran the type check, the code-style check, all 11,011 automatic
tests and a production build. I also opened home, matches, news, Fantasy, Fantasy
team creation, profile, login and sign-up at phone size, in French (light mode) and
Arabic (dark mode): no errors, and the screenshots are in `audit/after-sprint-1/smoke/`.
Switching language from French to Arabic and back works, and the choice is kept
after a reload.

## What I could NOT do and why

1. **Under 20 script files (FE-C2 target).** The 85 files left are the app's own small
   pieces, not libraries. I tried packing them into one big file: that gets to 21
   files, but the home page then downloads about 15% more code (it would include code
   for other pages), and it is exactly the "one giant file" the plan says to avoid.
   Lighthouse showed no clear speed gain from it, so I left it out.
2. **Load time of 3–4 seconds.** Most of the time now goes into the phone _running_
   the code (about 2.7 seconds of a busy phone in Lighthouse), not downloading it.
   The code that every page starts with includes the whole Fantasy team system and
   several BotolaGO+ panels, even on pages that do not show them. Making that lighter
   means reorganising Fantasy and BotolaGO+ code, which this plan does not allow
   (Fantasy logic, and BotolaGO+ is Sprint 3).
3. **The big jump in Arabic (CLS 0.90).** This is the page first showing in French,
   then switching to Arabic once the Arabic words have downloaded. I proved it: when I
   block the Arabic words, the jump disappears; when I block the Arabic fonts, it
   stays. This is exactly Sprint 2's item FE-H1 (the server sends Arabic straight
   away), so I left it for Sprint 2. Preloading the Arabic font belongs there too,
   because today the server does not know a visitor wants Arabic.
4. **Pre-existing problem, not caused by this sprint:** one automatic test fails on
   this test machine, the same with or without my changes. It expects a time written
   as "(GMT)" and this machine's date library writes "(GMT+0)". It is about the news
   scheduling screen, not about speed.

## What I need from the owner

Your answers on 28 October: yes to changing how Fantasy loads its test data (done),
keep the background downloads (kept), and open a pull request for a preview (done).

Still needed:

- **Approval to publish** Sprint 1, after you have tried the preview (checklist below).

Needed later, for Sprint 2 (deep links), please get these ready:

- the Android release signing certificate SHA-256 fingerprint (from the Google Play
  Console, "App integrity" page);
- the Apple Team ID and the iOS bundle ID (from your Apple developer account).

## What to test yourself on your phone (simple step-by-step checklist)

Nothing here is live yet. The pull request for this branch is marked ready for
review, so the hosting service builds a preview of it. Its link appears on the pull
request page on GitHub, in the "Vercel" comment or check, a few minutes after it opens.

On the preview link, with your phone:

1. Open the home page. It should look exactly as it does today.
2. Tap **Matchs**, then a match. Check the score and the details show.
3. Tap **Fantasy**. If you have a team, check it shows. Try picking a player.
4. Tap **Actualités**, then open an article. Check the photo and text show.
5. Open your **profile**. Log out, then log in again.
6. Tap the language button at the top (FR / ع) and choose **العربية**. Everything
   should switch to Arabic, right to left. Repeat steps 1–4 in Arabic.
7. Switch back to **Français**.
8. Turn on dark mode on your phone and look at the home page again.
9. Pinch the page with two fingers: it should zoom. Tap the login email box on an
   iPhone: the page should not zoom in by itself.

If anything looks different from today, take a screenshot and send it to me.

## How to undo a change if something breaks

Each change is a separate saved step ("commit") on the branch, so any one can be
removed without touching the others. Give me the item code and I will undo it, or
a developer can run `git revert <code>` with the code from this list:

| Item  | What it changed                             | Commit    |
| ----- | ------------------------------------------- | --------- |
| FE-C2 | Grouped the libraries into a few files      | `a2521bf` |
| FE-C3 | Test data no longer ships for four sections | `79b4113` |
| FE-C3 | Fantasy test data loads only when needed    | `bd5ed75` |
| FE-M1 | Backup source for the version number        | `0f14902` |

The other commits on the branch only add measurements, reports and test scripts;
they do not change the app. Nothing is live until it is published, and if a
published version misbehaves, the previous version can be published again.
