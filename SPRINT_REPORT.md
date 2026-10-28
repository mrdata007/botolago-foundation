# Sprint report

Sprint 1 (speed and stability) is finished, on the branch `sprint-1-performance`
(pull request #573). Sprint 2 (installable app, Arabic first, accessibility) is
finished, on the branch `sprint-2-installable` (pull request #578), which is built on
top of Sprint 1.
**Nothing is live yet.** The live site is unchanged until you approve and publish.

## Results

All numbers are for the home page on a phone-sized screen (375 px wide). "Before" is
the code as it was on `main` (commit `9d2f38e`); "After S1" and "After S2" are the two
branches. All were built and measured the same way on the same test machine, so they
can be compared with each other. The raw reports are in `audit/before/`,
`audit/after-sprint-1/` and `audit/after-sprint-2/`.

| Measure                     | Before | After S1 | After S2 | Target |
| --------------------------- | ------ | -------- | -------- | ------ |
| Requests (home, first load) | 157    | 119      | 119      | < 50   |
| JS files (home, first load) | 123    | 85       | 85       | < 20   |
| Load time (mobile, slow 4G) | 6.6 s  | 5.9 s    | 5.9 s    | ~3 s   |
| Layout shift (CLS), French  | 0.009  | 0.009    | 0.009    | < 0.1  |
| Layout shift (CLS), Arabic  | 0.90   | 0.90     | **0.02** | < 0.1  |
| Lighthouse performance      | 29     | 31       | 32       |        |
| Lighthouse accessibility    | 100    | 100      | 100      |        |
| Lighthouse best practices   |        |          | 100      |        |
| Lighthouse SEO              |        |          | 100      |        |
| Installable                 | No     | No       | **Yes**  | Yes    |

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
- **CLS** measures how much the page jumps while it loads. Under 0.1 is good. The
  Arabic figure is for a returning Arabic reader (their choice saved on the phone).
- **Installable** is Chrome's own check that the site can be added to a phone's home
  screen like an app. Lighthouse no longer has a separate "PWA" score, so I used
  Chrome's check directly. Best practices and SEO were measured in Sprint 2 only (the
  full pass the plan asks for), in French and in Arabic: 100 both times.

**The speed targets are not reached.** I explain why below, and what would get closer.
The Arabic page jump and installability targets are reached.

## What was done in Sprint 1 (one line per item, plain words)

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
  development and the automatic tests use them. Note: while this was waiting, another
  piece of work (pull request #575) removed the same sample data from Football, News,
  Pronostics and Pépites (and also Prizes, Notifications and the sample login) in a
  simpler way, and was merged into `main` first. I merged `main` in and kept its
  version for those sections; my Fantasy change is the part #575 did not cover.
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

## What was done in Sprint 2 (one line per item, plain words)

- **FE-H1 (Arabic readers see Arabic first): done.** The server now sends an Arabic
  reader's page in Arabic, right to left, from the very first moment, instead of
  French that then flips. The language is remembered in a small cookie (the switcher
  and the first-visit chooser write it; anyone who chose Arabic before gets it on
  their next visit). On a first visit, a phone set to Arabic gets Arabic, and the
  language chooser still opens, with Arabic already selected. The pages also load
  their content in the reader's language on the server, so an Arabic page arrives
  complete. Result: the Arabic home page's jump went from 0.90 to 0.02. French is
  unchanged, and search engines still get French. Before/after picture:
  `audit/after-sprint-2/first-html-ar-before-and-after.png`.
- **FE-H2 (installable app): done.** The site can now be added to a phone's home
  screen like an app, with the BotolaGO "GO" icon (made from your existing store
  icons, not a new design). A second visit loads the site's files from the phone
  instead of downloading them again (289 files, none downloaded). With no internet, a
  page shows a French and Arabic "No connection" message instead of the browser's
  error page. Login, scores and anything personal are never kept on the phone: they
  always come fresh. Each new release replaces the old saved files automatically.
  Inside the phone app, none of this runs.
- **ST-2 (links open the app): done, waiting for your app IDs.** The two files phones
  check are in place (served correctly, no redirect), the Android app and the iPhone
  app are set to accept botolago.com links, and the app opens the right page when a
  link starts it. Three values only you can give are marked `TODO_OWNER` (see below).
- **FE-M4 (image descriptions): already right, nothing to change.** Every picture that
  carries meaning (club crests, player photos, news photos) sits next to text that
  already says it (the club name, the player name, the headline), so screen readers
  read it once. Adding a description to the picture would make them read it twice.
  I checked 11 pages in French and Arabic: no link or button is left without a name,
  and Lighthouse finds no image problem.
- **FE-L1 (pages start loading on touch): done, code only.** When a finger touches a
  link (or the mouse rests on it), that page's code starts downloading, so it opens
  faster. I first tried the router's built-in setting, but it also asked the database
  for the page's data: pointing at one match made 7 database requests, and moving the
  mouse across the home page made 24. As the plan says for that case, I limited it to
  code: now no database request at all.
- **Phone app shell:** `npx cap sync` runs for both Android and iPhone, and the deep
  link settings appear in both projects. (The final iPhone build needs a Mac, so it
  happens in the cloud build.)
- **Brief:** this repository asks for a short written plan before any visible change;
  it is in `docs/briefs/2026-10-28-sprint-2-installable.md`.

After every item: type check, code-style check, all 11,099 automatic tests (11,075 pass, 23
are skipped as written, and 1 fails: the same date test that fails without my changes) and a
production build. At the end, the same browser test suites the GitHub checks run: 105
pass (1 skipped, as written in the tests), the Pépites suite 26 pass, and the built-site
check 3 pass. Main pages opened at phone size in French (light) and Arabic (dark): no
errors (`audit/after-sprint-2/smoke/`).

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
3. **Three pages still load their Arabic content in the browser, not on the server**
   (Sprint 2): the news archive, a Fantasy player page and Pronostics. They show no
   French flash (the page itself is Arabic); their content just arrives a moment later,
   as before. I left them because each would need its pages reshaped (the archive's
   numbering is built per language, the other two are in areas this plan protects).
   The news article page is in the same situation for the same reason.
4. **The match page jumps a little in both languages** (0.16 French, 0.18 Arabic, on a
   slow phone network). It was like that before Sprint 2 and is not about language; it
   needs its own small fix.
5. **Preloading the Arabic font.** Not done: the Arabic fonts move the page by only
   about 0.02, so it would add a download for almost no gain.
6. **Pre-existing problem, not caused by this sprint:** one automatic test fails on
   this test machine, the same with or without my changes. It expects a time written
   as "(GMT)" and this machine's date library writes "(GMT+0)". It is about the news
   scheduling screen, not about speed.

## What I need from the owner

Your answers on 28 October: yes to changing how Fantasy loads its test data (done),
keep the background downloads (kept), and open a pull request for a preview (done).

Still needed:

1. **Before the next iPhone build (important):** in Apple Developer, go to
   Certificates, Identifiers & Profiles > Identifiers > `botolago.com`, tick
   **Associated Domains**, and save. Sprint 2 adds this setting to the iPhone app; if
   it is not ticked on Apple's side, the next iPhone cloud build will fail at the
   signing step. (Android has no such step.)
2. **Android deep links:** the SHA-256 fingerprint of the app signing key. Google Play
   Console > BotolaGO > Test and release > App integrity > App signing: copy "SHA-256
   certificate fingerprint" of the **app signing key**. Send it to me.
3. **iPhone deep links:** your Apple **Team ID** (Apple Developer > Membership details,
   10 characters). The bundle ID is already known from the app settings:
   `botolago.com`. Please confirm that is the one registered with Apple.
4. **How you want to try the changes before they go live** (see the next section), then
   **approval to publish** Sprint 1 (pull request #573), then Sprint 2 (#578).

The step-by-step for 1–3 is also in `docs/mobile/PHONE_APP.md`, section "Links to
botolago.com open the app".

## What to test yourself on your phone (simple step-by-step checklist)

Nothing here is live yet. There is no automatic preview link for this repository at the
moment: the Vercel previews stopped working (they answer "payment required", already
noted in `docs/production/2026-10-19-go-live-pack.md`), so no pull request gets one. To
try these changes on a phone before they go live, the Vercel account needs its plan
sorted out, or another way to put a branch online has to be chosen. Once there is a
link, or after publishing, check the following with your phone:

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

Sprint 2 (pull request #578, which includes Sprint 1 too):

10. Set your phone to Arabic (or choose Arabic once), close the browser, and open the
    site again: the page should appear in Arabic straight away, with no French
    first and no jump.
11. On a phone that has never visited, set to Arabic: the page is Arabic, the
    language chooser opens with **العربية** selected. Choose **Français**: it switches
    and stays French after a reload.
12. Android (Chrome): menu ⋮ > **Install app** (or "Add to Home screen"). On iPhone
    (Safari): Share > **Add to Home Screen**. The BotolaGO icon appears; opening it
    shows the site full screen.
13. Visit two or three pages, turn on airplane mode, and open a page you have not
    visited: you should see "Connexion impossible / تعذّر الاتصال", not a browser
    error. Turn airplane mode off and tap the button: the page loads.
14. Log in, check your Fantasy team and a live score: all as before.

## How to undo a change if something breaks

Each change is a separate saved step ("commit") on the branch, so any one can be
removed without touching the others. Give me the item code and I will undo it, or
a developer can run `git revert <code>` with the code from this list:

| Item  | What it changed                          | Commit    |
| ----- | ---------------------------------------- | --------- |
| FE-C2 | Grouped the libraries into a few files   | `a2521bf` |
| FE-C3 | Fantasy test data loads only when needed | `bd5ed75` |
| FE-M1 | Backup source for the version number     | `0f14902` |

Sprint 2 (branch `sprint-2-installable`):

| Item  | What it changed                                    | Commit    |
| ----- | -------------------------------------------------- | --------- |
| FE-H1 | The server draws the page in the reader's language | `0511414` |
| FE-L1 | Page code starts loading on touch or hover         | `5827927` |
| FE-H2 | Installable app, saved files, offline page         | `128d456` |
| ST-2  | Links open the phone app                           | `cbd070f` |

Undoing FE-H2
is safe too: once its commit is removed and published, phones that installed the
helper that saves files ask for it again, find it gone, and remove it by themselves.

The other commits on the branch only add measurements, reports and test scripts;
they do not change the app. Nothing is live until it is published, and if a
published version misbehaves, the previous version can be published again.
