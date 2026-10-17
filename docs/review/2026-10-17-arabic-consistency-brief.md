# Arabic consistency changes: screen-work brief and evidence (2026-10-17)

This is the brief that `AGENTS.md` "Screen work" rule 3 asks for, with the
validation that rule 5 asks for.

**Honest timing note.** Rule 3 says the brief is written before the first edit.
This one is not. The edits it covers (commit `05743876`, PR 515) were text-only
copy decisions on Arabic strings, made on the owner's delegation, and the
brief was written afterwards, when the reviewer asked for it. Nothing about
layout, components, styles, routes or business logic changed. The acceptance
criteria below are therefore what was verified after the fact, not what was
planned before it. The "before" screenshots were produced by reverse-applying
only that commit's two source hunks (`src/i18n/dictionary-ar.ts`,
`src/components/admin/player-mappings/bulk-copy.ts`) onto the current branch,
so the only difference between "before" and "after" is those strings.

Scope of the change: `docs/review/2026-10-16-arabic-wording-review.md` Part 6 and
`src/i18n/arabic-consistency.test.ts`.

## 1. What must be preserved

- Every French string, and French layout. French is the source language and no
  French key was touched.
- Every business rule: Fantasy rules, scoring, the gameweek lifecycle, chips.
  Only the Arabic word used to name things changed.
- The brand wordmark treatment (`BrandedText` shows the logo image where a
  heading names the product) and the Latin spelling "BotolaGO" in running text.
- Layout and geometry on every screen: no new wrapping, truncation, overflow
  or direction change.
- Text direction: Arabic stays right-to-left, with Latin names (league names,
  "BotolaGO") and links isolated correctly inside it.
- The 129 owner-approved rows and the earlier Top-10, اشتراك, المواهب and
  الجاهزية decisions.

## 2. The specific improvements

| #   | Change                                                                                                                                                         | Why                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | `fantasy.leagues.manager` المدير to المدرب; `fantasy.leagues.search_manager` ابحث عن مدير to ابحث عن مدرب                                                      | The game calls a player's owner "مدرب" everywhere else; "مدير" read as "director" |
| 2   | `fantasy.points.free_hit_restored`, `fantasy.freehit.restored`: "Free Hit" in Latin to الضربة الحرة                                                            | Same chip name as the rest of the Arabic UI                                       |
| 3   | `fpl.substitute` تبديل to استبدال; `fantasy.scoring.incrementalPolicy` التبديلات التلقائية to الاستبدالات التلقائية                                            | One word for the substitution family (`fantasy.substitute` was already استبدال)   |
| 4   | Admin bulk-copy phase headings ١. ٢. ٣. to 1. 2. 3.                                                                                                            | The admin screen and its French source use Western digits                         |
| 5   | `home.explore` استكشف بوتولاجو to استكشف BotolaGO                                                                                                              | The brand is written in Latin in every other Arabic string                        |
| 6   | `fantasy.hub.invite_message`, `fantasy.hub.invite_ready`, `card.onboarding.m6.msg.league`, `card.onboarding.m6.msg.league_provisional`: « {name} » to «{name}» | No inner spaces in Arabic guillemets; the share sheet already isolates the name   |

## 3. Acceptance criteria

Visual:

- A. No element of an affected string leaves the viewport (left >= 0, right <=
  viewport width), measured from bounding boxes of every visible element, not
  from `scrollWidth`.
- B. No text is clipped: the text range of each affected element sits inside its
  box, and no `overflow: hidden/clip` element has content wider than itself.
- C. Direction is right-to-left for Arabic, left-to-right for French.
- D. Mixed-script strings read correctly: "BotolaGO" and league names are
  intact Latin runs, the guillemets stay on the correct sides of the name,
  and the digit run in the card number stays isolated.
- E. Geometry after equals geometry before (same boxes, same line count), or
  any difference is explained.
- F. French screens are unchanged (identical element boxes and identical
  screenshot bytes).

Functional:

- G. The changed strings are exactly the ones in Part 6, and
  `bun test src/i18n/arabic-consistency.test.ts` passes.
- H. The text the user shares (WhatsApp link text, share sheet message) carries
  the new quote spacing and still ends with the real link.

## How it was measured

Own dev server on port 4871 (this worktree only), mock data modes, signed in
through the mock auth's demo user in storage, headless Chromium 1194 driven by
Playwright, `reducedMotion: reduce`. Viewports 390x844 and 1440x900. Languages
`fr` and `ar` (`html[dir=rtl]`, confirmed in each run). For each affected
element the script records `getBoundingClientRect`, the text range's rect,
`direction`, clipping, and sweeps every visible element on the page against the
viewport width (the `sr-only` skip link, 1 px wide and parked off screen on
purpose, is excluded). Screenshots are PNG crops of the affected element.
The Card share sheet needs the Manager Card preview, so that screen was
captured from a second start of the same server with
`VITE_MANAGER_CARD_PREVIEW=1` and the mock data modes (the way `curva.e2e.ts`
documents); the other screens ran without it.

## Results

Screens measured, Arabic, before to after. "Same" means every box (left, right,
width, height) and the line count were equal.

| Screen (route)                                        | Key(s)                                       | 390x844                                                                                                                                                     | 1440x900                                             | Overflow / clipping / direction                      |
| ----------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Home, "Explore BotolaGO" heading (`/`)                | `home.explore`                               | Screenshot bytes identical before and after                                                                                                                 | Screenshot bytes identical before and after          | None; rtl                                            |
| Create a league, invitation ready (`/fantasy`)        | `fantasy.hub.invite_ready`, `invite_message` | Ready line: left 32, right 358, width 326, 1 line; same before and after. Text now `تم إنشاء الدوري «Atlas Cup».`                                           | Ready card left 416, right 1024, width 608; same     | None; rtl                                            |
| WhatsApp text of that invitation                      | `fantasy.hub.invite_message`                 | Decoded `wa.me` text: `انضم إلى دوريي «Atlas Cup» على BotolaGO: <link>` (before: `« Atlas Cup »`)                                                           | Same                                                 | The link is intact at the end                        |
| Player action sheet (`/fantasy/team`, tap a player)   | `fpl.substitute`                             | Row text: `استبدال` (was `تبديل`); row left 0, right 390, same box before and after; one line                                                               | Row left 384, right 1056, width 672, height 48; same | None; rtl                                            |
| Substitution cancel bar (same page, after tapping it) | `fpl.substitute` in `fpl.cancel — …`         | `إلغاء — استبدال`; left 16, right 374, width 358; same                                                                                                      | left 400, right 1040, width 640; same                | None; rtl                                            |
| Card share sheet (`/curva/carte?mc=rated`, Share)     | `card.onboarding.m6.msg.league`              | Message box left 35, right 355, width 320, height 74.1; same. Text `…دوريي «Casablanca Derby»: …`, the name isolated                                        | Same box; sheet 672 wide at left 384                 | None; rtl                                            |
| League table header and search box                    | `fantasy.leagues.manager`, `search_manager`  | Not reachable, see below. Isolated width of the new strings in the app font (14 px, 600): المدرب 43.6 px (was المدير 34.6), ابحث عن مدرب 93.6 px (was 85.3) | Same                                                 | A 9 px wider word in a header cell and a placeholder |
| Scoring policy line (`/fantasy/points`)               | `fantasy.scoring.incrementalPolicy`          | Not reachable, see below. String checked: `…تُطبَّق الاستبدالات التلقائية وانتقال شارة القيادة…`                                                            | n/a                                                  | n/a                                                  |
| Admin bulk-copy phase headings                        | `bulk-copy.ts`                               | Not rendered (admin). Unit check below                                                                                                                      | n/a                                                  | n/a                                                  |

French, same screens, both viewports: element boxes are equal before and after
for every measured element, and the PNG bytes are identical (sha256 prefix equal) for the home heading, the
invitation card, the player sheet, the cancel bar and the card share sheet,
at both widths.

Whole-page sweep: 0 offenders in all 16 French and Arabic runs of the four
page screens, before and after, plus the 4 runs of the card share sheet in each
state.

### Mixed-script checks

- Guillemets. In the screenshots the Arabic quote marks sit mirrored on the
  correct sides of the Latin name, as in `docs/review/evidence/…/invite-ar-390-after.png`.
  Before, the inner spaces left a visible gap (`« Atlas Cup »`); after,
  the marks hug the name (`«Atlas Cup»`). The code points confirm it:
  `ab 41 74 6c 61 73 20 43 75 70 bb` after versus `ab 20 41 … 70 20 bb` before.
- The card share sheet isolates the league name with U+2068/U+2069 and the
  link with U+2066/U+2069, so the Latin name and the slashes of the address do
  not reorder: the sheet reads `…دوريي «Casablanca Derby»: 127.0.0.1:…` in a single
  right-to-left paragraph.
- Home heading: `BrandedText` matches both "BotolaGO" and "بوتولاجو" and draws the
  wordmark image for either, so the visible heading was already the logo and
  stays byte-identical (alt text "BotolaGO" in both). The key change matters
  only where the plain string is shown, which this heading is not.
- Digits: the admin headings now start with U+0031, U+0032, U+0033 (Latin
  digits), checked below; the French headings use the same digits.

### Unit checks

- `bun test src/i18n/arabic-consistency.test.ts`: 12 pass, 0 fail (executed here).
- `getBulkCopy("ar").phases` headings: `1. اقتراح الدفعة المراجَعة`,
  `2. الموافقة على الدفعة المراجَعة`, `3. تنفيذ الدفعة الموافَق عليها`, first code
  points 0x31, 0x32, 0x33; French `1.`, `2.`, `3.` likewise (executed by a
  throwaway test, not committed).

### What was not reachable on a screen

- **Fantasy `LeagueTable`** (`src/components/fantasy/LeagueTable.tsx`, the only
  user of `fantasy.leagues.manager` and `fantasy.leagues.search_manager`): no
  route or component imports it today; only its own file uses these keys. No
  screen shows them, so there is no screenshot. The strings were measured in
  isolation, and the table sets `table-fixed`, so the column does not depend on
  the word's length.
- **`fantasy.scoring.incrementalPolicy`**: `/fantasy/points` shows it only when
  the result is `authoritative.incremental`, which the mock data never sets.
  Not rendered. The word is one letter longer, in a plain
  paragraph that wraps normally.
- **`fantasy.points.free_hit_restored`, `fantasy.freehit.restored`**: not used by
  any file under `src/` apart from the dictionaries and the test; nothing renders
  them.
- **Admin bulk-copy**: behind an admin sign-in; unit-checked above, not seen.
- **`card.onboarding.m6.msg.league_provisional`**: same sentence as `league`
  with a provisional rating; not separately rendered. It shares the template
  change and the share sheet's code path.
- **`fantasy.hub.invite_ready`/`invite_message` in the Curva "invite friends" moment
  and the Pronostics league invite** (`InviteFriends.tsx`, `InviteLinkShare.tsx`)
  were not opened; they use the same two keys through the same functions as
  the hub card that was.

Other observation, not related to this change: in the mock environment the
"وضع تجريبي" (mock mode) badge overlaps the player sheet's rows at 390 px. It is the same before and after.

## Evidence files

`docs/review/evidence/2026-10-17-arabic-consistency/`: 16 PNG crops, each under
50 KB, Arabic before and after, with the viewport in the name.

| File pair (`-before` / `-after`)          | What it shows                                            |
| ----------------------------------------- | -------------------------------------------------------- |
| `home-explore-ar-390`                     | "Explore BotolaGO" heading (identical bytes)             |
| `invite-ar-390`, `invite-ar-1440`         | Invitation ready card with the league name in guillemets |
| `substitute-ar-390`, `substitute-ar-1440` | Player action sheet with the substitute row              |
| `substitute-cancelbar-ar-390`             | Cancel-substitution bar                                  |
| `card-share-ar-390`, `card-share-ar-1440` | Card share sheet and its message                         |

French screenshots are not stored: the French renders are byte-identical before
and after (hash comparison above), so storing them would show the same image
twice.
