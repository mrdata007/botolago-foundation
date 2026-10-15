# Audit remediation, Phase C: what was fixed and what is still open

Date: 2026-10-15. Branch `claude/friendly-turing-ry5fcs`. Source audit: commit
`a5df7b9` (NO-GO for broad public launch, no confirmed P0). Phases A and B are
merged (pull requests 489 and 490, see `2026-10-14-audit-remediation-phase-a.md`
and `2026-10-15-audit-remediation-phase-b.md`); this is Phase C, "premium UI/UX
and localization refinement". Nothing is merged to `main`, deployed, or applied
to any database. No production data, job or setting was touched. No migration
was added. No lane wrote to a database (one-writer rule respected).

Screen brief: [`docs/briefs/2026-10-15-audit-phase-c-remediation.md`](../briefs/2026-10-15-audit-phase-c-remediation.md).

## How it was done

Five implementation lanes ran in separate worktrees, one topic each. Every
finding was checked against the current code first and got a regression test.
Every lane was then reviewed by an independent reviewer who had the diff and the
audit record, not the lane's conclusions; every reviewer asked for changes and
every required change was made. Reviewers found real defects the lanes' own
tests had missed, among them: a skip link that jumped past the page title and
the page's own filters on eight hub pages, a search-box test that passed only
because it faked the Escape key, a "form" label that clipped in the player-sort
dropdown, Arabic count wording that was wrong from 100 upwards, a profile
language step that would have shown the phone's language as the account's
notification language, an admin preview that would not match the reader's
Arabic typography, and a heading fix that made the Pépites hub worse when text
is enlarged. A final review of the combined branch then checked cross-lane
problems and the owner's invariants.

## Status of each finding

| ID      | Priority | Status              | What changed (short)                                                                                                                                                                                                                                                            |
| ------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01   | P2       | Closed              | French "non aligné" reasons now read "n'a pas joué" (goalkeeper and outfield). Arabic was already right and is untouched.                                                                                                                                                       |
| FR-02   | P2       | Closed              | Fantasy "Top 5" and "best player" say "de la journée", not "de la semaine". Genuinely weekly Pépites strings keep "semaine".                                                                                                                                                    |
| FR-03   | P3       | Closed              | "ré-essayé", "ré-essayée", "re-vérifiée" are now "réessayé", "réessayée", "revérifiée" (admin queue and news edition screens). No other hyphenated spelling remains in the repository.                                                                                          |
| LOC-02  | P2       | Closed              | The username error message now describes the real rule (3 to 20 characters, Latin letters, digits, "-" and "\_", starting with a letter or digit). The validator itself is NOT widened. Latin fragments inside the Arabic message are isolated.                                 |
| LOC-10  | P3       | Closed              | The unsubscribe confirmation says it stops notification e-mails and that account-security messages remain available; the "already unsubscribed" line has the same scope.                                                                                                        |
| LOC-11  | P3       | Closed              | Small French and Arabic inconsistencies from the register: "Matchs" everywhere in French, "Moyenne"/"Forte", "Heureux de vous revoir", the vice-captain takeover line, the prize "no winners" filter line, the delayed-match badge.                                             |
| LOC-03  | P2       | Closed              | Arabic counts use the right form (none, one, two, 3 to 10, 11 to 99, 100 and over) on the transfer confirmation headline and the player picker's "view" button; the player counts no longer put a fixed noun after a number. French was already correct.                        |
| LOC-04  | P2       | Closed              | One Arabic Fantasy glossary: transfers = الانتقالات, form = المستوى الأخير, chips = الجوكر. The captain's armband and availability words are unchanged. A test scans the Fantasy Arabic keys so the old words cannot come back.                                                 |
| LOC-06  | P2       | Closed (wording)    | The Profile language row now says it changes the language on this device; a signed-in reader is told notifications use the account's saved language. The profile editor's language step has a neutral label and says exactly what saving does. No behaviour was changed.        |
| LOC-07  | P3       | Closed              | The two-factor "activated on" date follows the chosen language (Latin digits in Arabic) and Morocco's calendar day. Other older date formatters still use the browser's time zone (see risks).                                                                                  |
| LOC-08  | P2       | Closed (code)       | Arabic article text keeps the Arabic font and upright emphasis (also in an Arabic edition shown inside the French shell, and in the admin preview). Latin italics are untouched. Measured in Chromium with a substituted article body; not seen on a real staging article.      |
| LOC-05  | P3       | Evaluated, no code  | Written evaluation of the Arabic first-paint flash (`docs/engineering/ARABIC_FIRST_PAINT.md`): why it happens, measurements (dev server only), five options, recommendation to keep today's behaviour until the owner decides on `/ar` URLs. No safe small code fix exists.     |
| MOB-02  | P2       | Closed              | Search results are exposed as a proper list to assistive technology (option ids, active option, live announcements of result count, failure and partial results). Verified in Chromium; not with a real screen reader.                                                          |
| MOB-03  | P2       | Closed              | Carousel dots (Pronostics deck, news carousel) are 44 by 44 targets; the painted dot is unchanged. Dot centres are now 44 px apart.                                                                                                                                             |
| MOB-04  | P3       | Closed              | The Pronostics deck's role descriptions are French/Arabic ("carrousel", "diapositive" / "عرض دوّار", "شريحة") instead of English.                                                                                                                                               |
| MOB-05  | P2       | Closed              | A "skip to content" link is the first Tab stop in the main, Fantasy and sign-in layouts; it lands on the page's own content including the page title and filters. Not added to the Plus pages, landing, welcome, splash, language chooser, OAuth consent page (see risks).      |
| VIS-001 | P3       | Closed (large text) | At normal text size nothing was cut off (0 of 160 combinations). With text enlarged to 200% the route name was cut off on six hub pages (39 of 160); the title row now wraps and the control drops to its own line (0 of 160). The Pépites hub heading got the same protection. |
| SOL-04  | P3       | Closed              | The bare `/auth` address redirects to `/auth/login`, passing a safe `next` through the existing checks (off-site, `//`, `/\`, `javascript:` and encoded variants all end on a bare sign-in page).                                                                               |

Not part of this work (owner decisions or later phases): MOB-01, LOC-09,
VIS-002 to VIS-005, PRO-05, PRO-06, UX-011 and all Phase D items.

## What was run

On the final merged tree: `bun run typecheck` clean; full `bun test` 10124 pass,
23 skip, 1 fail; i18n gate pass (W1 10, W2 10, W3 244, W4 68, each at baseline);
`backend:migrations:check` pass (230, none added); `bun run build` passes;
eslint 0 errors and prettier clean on every touched file except
`docs/engineering/LANGUAGE_URLS.md`, which was already not prettier-formatted
before this work and received only a one-line "See also" link. The one failing
test is "Morocco's Ramadan clock change" (a time-zone format difference in this
environment); it fails the same way on untouched `main` and is unrelated.

Browser checks (real Chromium, each lane on its own dev server and port, mock
data, no database): skip link and prediction-deck dots (320, 360, 390, 1440 px,
French and Arabic, element bounds not `scrollWidth`); search combobox behaviour
and announcements; 8 hub pages checked 48 ways before/after the skip-target
change (identical within 1 px); hub headings at normal and 200% text (160
combinations); Pépites headings (36 combinations); profile language row and
editor step; Arabic article typography on a substituted article body; the
Playwright accessibility spec (14 of 14 passed). Screenshots and measurement
scripts are in the session scratchpad; they are not committed.

## Not verified (read this before trusting the table)

- **No native Arabic read.** Every new or changed Arabic string needs a native
  reader before release. The highest-risk ones are listed below.
- **No screen reader, no physical device, no WebKit.** The search announcements,
  skip link and carousel behaviour were checked in Chromium only.
- **Light/dark contrast was not measured** on the new skip link or the new help
  lines (they use existing colour tokens).
- **Real data:** the real news carousel does not appear in mock mode (a replica
  with the same classes was measured); a real Arabic article with emphasis and
  quotations was not seen on staging; the real `/fantasy/points` substitution
  and vice-captain rows were measured on a copy of the layout, not the live
  screen (it needs sign-in and live data).
- **"200% text" is emulated** (root font size and type tokens doubled), not a
  real operating-system text scale.
- **Arabic first-paint timings** come from the development server and are not
  production figures; only the order of events is reliable.
- No end-to-end suite was run beyond the new accessibility spec.

## Owner decisions

1. **MOB-01, pinch zoom.** The viewport tag caps zoom (`maximum-scale=1`). The
   cap exists to stop iOS from zooming into small fields. Sign-in fields are
   15 px and the phone search field is 13 px, so lifting the cap first needs
   all editable fields at 16 px or more, plus iOS device testing. Not changed.
2. **LOC-09, Pépites Arabic name** is still unsettled in `PRODUCT.md`. The
   Fantasy glossary now uses "الجاهزية" for availability while Pépites uses it
   for form; that clash waits on this decision.
3. **VIS-003, VIS-004, VIS-005** (desktop Fantasy layout, editorial imagery,
   home fixture hierarchy) need product input and image rights.
4. **LOC-05, Arabic first paint:** keep today's behaviour, or plan `/ar` URLs
   (`docs/engineering/LANGUAGE_URLS.md`).
5. **Legal text** (`src/content/legal/documents.ts`) still says الرقاقات for
   chips in the Terms and Privacy text, while the Fantasy screens now say
   الجوكر. It is generated owner/counsel text and was not edited; the owner
   should align it in the next legal version.
6. **Account notification language** has no standalone setting. It can only be
   changed by saving the profile editor, and that save also switches the app
   language on the device. Separating them needs a storage design.
7. **Skip link coverage:** not added to the Plus pages, landing, welcome,
   splash, first-launch language chooser, OAuth consent page or admin.
8. **SEO title** "Matches Botola Pro — scores en direct" (`matches.index.tsx`
   and the SEO operating-system doc) still says "Matches"; changing a title is
   an SEO decision.

## Remaining risks

1. **Reserved usernames** (such as "admin", "support") show the username
   message, which now describes the alphabet rule precisely and so does not
   explain a reserved name. Needs its own message key (existing behaviour made
   more visible).
2. **Frozen demo build** `public/demo/app.html` still contains old wording
   ("non aligné", "Vice a pris le relais", "Matches", التحويلات, الرقاقة). It
   needs regenerating separately.
3. **Database notification templates** (`supabase/migrations/20260720141854_…`)
   hold older Arabic wording ("الشريحة" for chip, no plural forms in
   "{{transfer_count}} انتقال"). Fixing them needs a migration, so not in this
   phase; nothing sends the chip notification today.
4. **Free-transfer phrases** (`fpl.pick.transfer_cost_*`,
   `fantasy.deadline_card.transfers_*`) have only one/two/few/other forms; free
   transfers are capped at 2, so larger counts cannot occur.
5. **Other date formatters** (`formatFullDate`, `formatRelativeTime`, the
   suspension date on the sign-in page) still use the browser's time zone.
6. **Remaining sub-44 px controls:** squad-page chip buttons ("JOUER", about
   64 by 32) and the "Signaler" report buttons (32 by 32). Not in MOB-03's
   scope; reported, not fixed.
7. **Arabic "عرض لاعبين"** (two players) is written without vowel marks and
   reads as both "two players" and "players"; the native reader should decide.
8. **Admin SofaScore queue copy** has hand-made "n === 1" count handling and
   was not in the register.
9. **Unused Latin "Free Hit" keys** remain in three unused Arabic keys and would
   contradict the approved chip name if they returned to use.
10. **Search field in Chromium and WebKit** empties itself on Escape (browser
    behaviour for search fields); not changed.
11. **Wrapped headings at 320 px with 200% text** can split a long Arabic word;
    accepted over overflowing.
12. Phase A and B risks and migrations still stand (see their reports),
    including migrations `20261014180100`, `20261015120200`, `20261015120300`
    applied nowhere.

## Arabic strings that most need a native reader

Ranked by risk, from the final combined-branch review:

1. `fpl.about_to_transfer_*`, the transfer confirmation headline. Watch
   "ستُجري {n} انتقال." from 100 upwards and "ستُجري انتقالين.".
2. `fpl.pick.filters_apply_two` "عرض لاعبين" (without vowel marks it reads as
   "two players" and as "players"), and `_other` "عرض {n} لاعب".
3. The glossary as a whole: الجوكر / الجوكرات for chips and المستوى الأخير for
   form, across about 40 keys and the meta titles (clashes with Pépites using
   الجاهزية for form, LOC-09).
4. `auth.error.username_invalid`: the direction isolates around a–z, "-" and
   "\_", and whether the sentence reads naturally.
5. `unsubscribe.done_title`, `already_title`, `reenable_hint`: the promise about
   scope ("تبقى رسائل أمان الحساب الضرورية متاحة").
6. `auth.setup.language_hint`, `profile.language.help`,
   `profile.language.help_guest`: exact claims about what changes notifications
   versus this device.
7. `predictions.votes.role` "عرض دوّار" and `slide_role` "شريحة".
8. `nav.skip_to_content` "انتقل إلى المحتوى".
9. `fantasy.points.vice_takeover` "تسلّم نائب القائد الشارة" and
   `matches.status.delayed` "تأخر الانطلاق".
10. Count labels: `fantasy.players.showing`, `pepites.ranking.count_short`,
    `nav.search.results_*` (11 to 99 results read "{n} نتيجة", acceptable in
    written Arabic; the reader should confirm).

Also noted by the final review: `tests/e2e/curva-off.e2e.ts` fails against the
default dev server because the bar shows "Curva" rather than "Pépites"; Phase C
only changed "Matches" to "Matchs" in it, so the spec looks out of date for an
older reason (not confirmed at the base).

## Launch blockers, updated

The audit verdict stays **NO-GO for broad public launch** until the items below
are closed. Phase C removes the source-supported localization and accessibility
defects; it does not by itself certify launch.

Still blocking, unchanged from Phases A and B:

- **A8, release and capacity evidence (SEC-02, FANT-11).**
- **SEC-01 outside the lease** (calendar syncs, ingestion, prize call).
- **The owner's database statement-limit check** for the lease extension.
- **Real-state checks** on staging or a real signed-in account, French and
  Arabic, for states mock mode cannot show.
- **CI `database-quality`** for the Phase A and B migrations.
- **Native Arabic review** of all new wording (now Phases A, B and C).

New for Phase C:

- A native Arabic read of the Phase C strings, and one human look at a real
  Arabic article (with emphasis and a quotation) and at the transfer screens in
  Arabic on a phone.
- A screen-reader pass (VoiceOver, TalkBack, NVDA) over the search box, skip
  link and carousel.

No longer blocking from the audit's Phase C list: the findings marked Closed
above. Phase D is not started.
