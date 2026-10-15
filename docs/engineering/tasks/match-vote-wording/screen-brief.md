# Match page fan votes: names, not a betting slip — screen brief

Owner request, 2026-10-07: "go" on the critique plan
(`.impeccable/critique/2026-10-06T20-00-17Z__src-routes.md`, Priority Issue 3,
"Fan vote reads as a betting slip"). Impeccable command: `clarify`.
Branch `claude/match-vote-wording`, from `main` at `1c12b5b0`.

On the match page (`/matches/<id>`, Résumé tab on a phone, the right-hand column
on a desktop) one deck titled "VOTRE PRONOSTIC" holds the score prediction and
then the fan votes. The second card reads "Qui va gagner ? Votez !" over three
buttons: the home crest, "X", the away crest — the betting shop's 1 / X / 2.
PRODUCT.md: "Free to play. No purchase, no stake, no betting, and nothing that
looks like betting." Home's `NextMatchPick` already asks the same question
right: "UTS Rabat / Match nul / RSB Berkane".

Inspected before writing this, on untouched `main` (dev server on :5303, reads
only, no answer tapped: cards were reached with the deck's dots):
`src/components/predictions/MatchPredictionCard.tsx` (the deck and its heading),
`MatchVoteCard.tsx` (the vote card), `SwipeDeck.tsx`, `match-votes.ts`,
`use-match-votes.ts`, `src/components/home/NextMatchPick.tsx` and
`band-matches.ts`, the route `src/routes/matches.$matchId.tsx`, the vote keys in
both dictionaries, the e2e journey `tests/e2e/pronostics.e2e.ts` ("match votes,
Sofascore style"), and the runbook section "Match votes"
(`docs/backend/PREDICTIONS_OPERATIONS_RUNBOOK.md`).

Measured on main, upcoming match `ac95346b…` (UTS Rabat v RSB Berkane, Thu 8 Oct
16:00), 390x844 and 360x800 phones and 1440x900, French and Arabic, light and
dark:

- **One heading over everything.** The deck's only heading is the `h2`
  "VOTRE PRONOSTIC" / "توقعك", above all four cards: the score prediction, then
  "Qui va gagner ?", "Les deux équipes vont-elles marquer ?", "Qui marquera en
  premier ?". The carousel's accessible name is "Pronostics du match".
- **1 / X / 2.** The winner card's three buttons show a crest, the letter "X"
  and a crest, in French and in Arabic (105x44px each at 390px). Their
  accessible names are right ("Victoire de UTS Rabat", "Match nul", "Victoire de
  RSB Berkane"); what is seen is not. The first-goal card has the same shape:
  crest, a "no entry" icon for "Aucun but", crest. The both-score card reads
  "OUI" / "NON" (uppercase, the body step), not the 1X2 shape.
- **"Votez !"** / "صوّت!" is the line under every question until the reader
  votes. `MatchVoteCard.tsx:83` is the only place in `src/` that prints an "X"
  answer.
- **After full time** (`14e01965…`, Raja v RCA Zemamra): a phone shows the
  one-line "Votre pronostic · Pas de pronostic · Voir la journée"; a desktop
  shows the score card alone. Closed polls with fewer than 20 votes and no
  answer of the reader's own are not drawn (`voteCardWorthShowing`), so no
  closed vote card can be seen with today's data.
- **Home** (`NextMatchPick`): "Qui va gagner ?" over three text buttons, the
  names from `bandClubName` (the short name, or the full name when the short
  one is only a code), "Match nul" / "تعادل" from `predictions.votes.draw`. No
  change needed there.
- **Names.** The French short names include a code, "WCA"; the score card
  prints it, Home's band prints the full name instead. The Arabic short names
  are all words ("الجيش", "اتحاد تواركة", "الكوكب المراكشي").

## What must be preserved

- **The vote itself.** Same three questions, same answers in the same order
  (home first, so in Arabic it sits on the right), same tap
  (`votes.cast(question, choice)`), same pencil to change a vote until
  kick-off, same shares, total, 20-vote threshold, "Votes clos", "your vote"
  marking, phone-kept visitor votes and sign-up line. No change to
  `use-match-votes.ts`, `match-votes.ts`, the contracts, any RPC or migration.
- **One deck.** The owner's 2026-09-25 decision stays: the score card first,
  then the three votes, in one swipeable row with dots (four dots, "Carte n sur
  4"), as the runbook describes. The score card, its steppers and the
  "Pronostiquer toute la journée" link are untouched.
- **The look.** Kit tokens only: the answers stay fully round 44px pills, the
  card stays a `UiCard`, the reader's own answer keeps its ink wash, closed and
  revealed states keep their current colours, dark mode keeps its tokens. The
  trophy and pencil stay.
- **Accessible names** of the answers stay as they are and still contain what
  the button shows ("Victoire de UTS Rabat" contains "UTS Rabat").
- **Home's band** and the compact one-line card after full time are unchanged.

## Improvements being made

1. **Names, not 1 / X / 2.** The winner card's answers read the two clubs'
   names and "Match nul" / "تعادل" (the key Home already uses). The first-goal
   card's read the names and "Aucun but" / "بدون أهداف". The names are the ones
   Home's band uses for the same vote (`bandClubName`). No crest and no "X"
   inside an answer; the crests stay on the score card above. Every answer is
   set in one style, the kit's small-button label (13px at 800), so "Oui" /
   "Non" lose their uppercase to match.
2. **No "Votez !".** The line under an open question is dropped: the question
   stands alone ("Qui va gagner ?"). Once voted, or closed, the line still
   gives the total or "Votes clos". The key `predictions.votes.cta` is removed
   from both dictionaries.
3. **Their own heading.** Each card in the deck carries its group's heading
   above it, inside its slide, so the heading moves with its card: "Votre
   pronostic" / "توقعك" above the score card, "L'avis des supporters" /
   "رأي المشجعين" above each vote card (Arabic "المشجعين" is the word the
   Fantasy copy already uses for fans). In the markup the votes' heading is an
   `h2` before the first vote card; its repeats on the next cards are hidden
   from screen readers, which read one heading per group. The carousel's name
   becomes "Votre pronostic et l'avis des supporters" / "توقعك ورأي المشجعين".

## Acceptance criteria (visual and functional)

- On an upcoming match, at 360x800, 390x844 and 1440x900, French and Arabic:
  card 1 shows "VOTRE PRONOSTIC" / "توقعك" above it, exactly where the heading
  sits on main; cards 2, 3 and 4 show "L'AVIS DES SUPPORTERS" /
  "رأي المشجعين" in the same place and style.
- The winner card reads "UTS Rabat · Match nul · RSB Berkane" (Arabic: "اتحاد
  تواركة · تعادل · نهضة بركان", home on the right); the first-goal card "UTS
  Rabat · Aucun but · RSB Berkane"; the both-score card "Oui · Non". The text
  "X" and "Votez !" / "صوّت!" appear nowhere in the deck, in either language.
- Every answer button is at least 44px tall, nothing it holds spills outside
  it, and the page does not scroll sideways at 360px or 390px.
- With the votes revealed (a closed poll with shares, shown by replacing the
  read's numbers in the browser only), each pill shows the name and its share,
  nothing spills, the reader's own answer is washed in ink, in French and
  Arabic, light and dark.
- The accessible names of the answers are unchanged; the markup has one `h2`
  per group in reading order ("Votre pronostic", then "L'avis des
  supporters"), and each vote card keeps its `h3` question.
- Dark mode: heading, answers and shares use the same tokens as on main.
- Home's band pick card renders as on main.
- No file under `src/backend`, `supabase/` or `use-match-votes.ts` /
  `match-votes.ts` changes. Unit tests, typecheck, lint and the full
  `bun run test` pass; the e2e journey is updated where it asserted "Votez !".

## Validation (2026-10-07)

Dev server from this worktree on :5303 only (`vite dev --mode production`,
reading production through the public key). No answer was tapped and no
form submitted: cards were reached with the deck's dots, and the capture
scripts aborted any `cast_match_vote` or save request (none was attempted).
No database write of any kind.

**Commands**

- `bun test src/components/predictions/MatchVoteCard.test.tsx` (new, 10
  tests): pass. With the rest of `src/components/predictions/`,
  `src/components/home/` and `src/i18n/`: 268 pass, 0 fail.
- `bun run typecheck`: pass. `bun run lint`: exit 0, 0 errors (31 warnings,
  none in a changed file). `prettier --check` on every changed file: clean.
- `bun scripts/qa/i18n-gate.ts`: `RESULT: pass` (W1 to W4 at their
  baselines: `predictions.votes.cta` removed, `predictions.votes.heading`
  added and used).
- `bun run test` (full): 6,002 pass, 17 skip, **1 fail**:
  `src/backend/news/editorial-session.test.ts` "Morocco's Ramadan clock
  change" expects "(GMT)" and this machine's ICU prints "(GMT+0)"
  (`Intl.DateTimeFormat(..., { timeZoneName: "short" })` gives "UTC+0" here).
  Not touched by this branch (no file under `src/backend` changed, and the
  test imports none of the changed files).
- `impeccable detect --json` on `MatchVoteCard.tsx` and
  `MatchPredictionCard.tsx`: exit 0, `[]`.

**Measured** (Playwright, Chromium, upcoming match `ac95346b…`; 360x800,
390x844 and 1440x900; French and Arabic; light and dark)

- Text of every card, before then after: winner "UTS · X · RSB" (the crests'
  initials) → "UTS Rabat · Match nul · RSB Berkane", Arabic "اتحاد تواركة ·
  تعادل · نهضة بركان"; first goal crest, icon, crest → "UTS Rabat · Aucun but ·
  RSB Berkane" / "اتحاد تواركة · بدون أهداف · نهضة بركان"; both score "OUI ·
  NON" → "Oui · Non". "X" as an answer: present on main in all 7 variants,
  absent after in all 7. "Votez !" / "صوّت!": absent after.
- Headings in the deck after: `h2` "Votre pronostic", `h2` "L'avis des
  supporters" (Arabic "توقعك", "رأي المشجعين"), then the three `h3` questions;
  the heading over cards 3 and 4 is `aria-hidden`.
- Answer buttons: never under 44px tall. 105x44 at 390px (one-line names),
  95x52 at 360px and 88x52 in the desktop column, where "RSB Berkane" takes
  two lines and the row's three buttons keep one height. No element spills
  out of its pill, and no element outside the swipe row crosses the
  viewport's edge (bounding boxes, since `scrollWidth` alone misses overflow
  under `overflow-x: clip`), in any variant.
- Revealed answers, with the `match_votes` read answered in the browser
  (897 made-up votes; open with the reader's own answer, and closed): every
  pill shows the name over its share, nothing spills, the reader's answer is
  washed. Pills 56px tall at 390px, 76px where a name takes two lines (360px
  and the desktop column), 65px in Arabic. On main the same read showed
  "UTS 46 % · X 22 % · RSB 32 %".
- Contrast of the answer labels, from rasterised sRGB pixels at 2x (fill =
  most common colour, ink = the pixel farthest from it): light 19.44:1 open,
  18.1:1 revealed, 9.28:1 on the reader's own answer; dark 15.89:1, 18.07:1
  and 8.32:1.
- Home's band (`NextMatchPick`): same text before and after ("Qui va gagner ?
  UTS Rabat · Match nul · RSB Berkane"). Home logs a hydration-text mismatch
  in every variant, before and after: the news-dates item another lane owns.
- Finished match `14e01965…`: unchanged (the one-line card on a phone, the
  score card alone on a desktop; its polls have under 20 votes).

**Evidence** (`shots/`, each `__before` and `__after`)

- `deck-winner__m-fr-light`: the phone page on card 2, heading and answers.
- `deck-winner__m-ar-light`: card 2 in Arabic, home on the right.
- `deck-first-goal__s-fr-light`: card 4 at 360px, a name on two lines.
- `deck-results-winner__s-fr-light`: card 2 revealed with the reader's own
  answer, 360px (replaced read).
- `deck-results-first-goal__m-ar-dark`: card 4 closed, Arabic, dark (replaced
  read).
- `match-page__d-ar-light`: the desktop page in Arabic, the deck's column on
  the left.

**Decided while measuring**

- Revealed answers always stack the name over the share. Left to wrap as on
  main, Arabic set "تعادل 22%" on one line beside two stacked neighbours.
- The deck is about 24px shorter at rest (no "Votez !" line). When results
  appear (a vote, or the pencil closed) the card grows by the total line and
  the taller pills, so what is under the deck moves down then, on the tap.

**Not verified**

- The e2e journey (`tests/e2e/pronostics.e2e.ts`, "match votes, Sofascore
  style") was updated but not run: it casts votes and signs in. CI is the
  authority.
- Signed-in voting, a real closed poll with 20 votes or more (none exists
  today: shown only with the replaced read), live matches, WebKit and real
  phones.
