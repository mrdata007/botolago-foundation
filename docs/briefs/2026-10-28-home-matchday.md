# Home band: a matchday card, not a betting slip (screen brief)

Design-critique fix, approved by the owner on 2026-10-28 ("everything listed",
matchday first). Branch `claude/dc-home-matchday`. Scope: the Home band's match
card (`src/components/home/NextMatchPick.tsx`, `HomeMatchCarousel.tsx`), the
Home story captions (`HomeStories.tsx`) and `src/routes/index.tsx` only where it
feeds them.

## Owner decision 2026-10-28 (supersedes two earlier briefs)

`docs/briefs/2026-10-27-home-band-names.md` preserved "Qui va gagner ? and its
three buttons, their size, the held row…". The owner reversed that on
2026-10-28: three equal outlined pills (team / Match nul / team) read as a 1X2
betting slip, which BotolaGO must never look like. The three-pill row is
retired. Everything else that brief and
`docs/briefs/2026-10-27-home-redesign.md` preserved still stands.

## Checked against main and the open pull requests

- #541 (home spacing) changes the stories rail's spacing and the header logo
  link; it does not touch the band card. Not duplicated.
- #373 (match page fan votes: club names and "Match nul", not a 1X2 slip) is the
  same intent on the match page (`MatchVoteCard`, dictionaries). Its wording of
  the draw choice is reused as it is: this brief adds no new wording for it.
- #578 (Arabic first, installable app…) touches the language default, not the
  Home components.

## What must be preserved

- The band's card content: both crests, both club names (short name unless it is
  a code: `bandClubName`), the kickoff time and weekday, the link to the match
  page, the "Journée N" label.
- Home on the start side, away on the end side (mirrored in Arabic).
- Equal-height carousel slides; the live match card (`MatchCard` hero) and the
  freshness line under it; the carousel's keyboard, skip link, announcements.
- The vote itself: `useMatchVotes`, the "who wins" record (same cache, kept on
  the account or on the phone for a visitor), its rules (only a match still to
  be played, journée known, kick-off ahead; game off, not covered or closed means
  no vote), and the held row while the votes are read, so the band does not grow
  when they arrive. No server change, no new vote option.
- The match page's reveal rule: results are shown only after the reader has
  voted, and only with at least `MIN_VOTES_FOR_SHARES` (20) votes
  (`sharesVisible`); below that no percentage is shown.
- Fantasy rules, scoring, lifecycle; brand (navy band, Changa and Manrope,
  tokens and the ui-kit); no player photos; Latin digits.

## Improvements

1. **No 1/N/2 row.** The card asks "Votre favori ?" and the two clubs are the
   two vote targets: each club's crest and name is one tap (at least 44px high),
   home on the start side, away on the end side. "Match nul" stays available as a
   quiet text button under the clubs, never a third equal pill.
2. **Result as a bar.** Once the reader has voted (and there are enough votes),
   the split shows as a bar in the two clubs' own colours with their percentages
   at its ends; the draw share is a thin neutral part of the bar and a quiet
   "Match nul 12 %" figure. Colours come from `clubMatchPalettes` (the clash
   rule, the measured edge and fill contrast). The vote can still be changed.
3. **Kick-off countdown in Morocco time.** A line on the card reads "Coup
   d'envoi dans 1 h 45" (Arabic equivalent), under a day it counts hours and
   minutes, beyond a day days and hours; the weekday under the time reads
   "Aujourd'hui" or "Demain" when the kickoff is today or tomorrow on the
   Morocco calendar (`moroccoParts`, the same clock as every kickoff on the
   page), so a matchday is obvious. It follows the clock without a reload (one
   shared 15 second tick), the line's height is held so nothing moves, a match
   past its kick-off that the data still calls scheduled says "En attente du
   coup d'envoi" rather than a countdown, and a live or finished match shows
   its score (and "Terminé") from the data the card already has.
4. **Story captions.** In Arabic the captions on Home's story rail no longer use
   a Latin "V": the two codes are written with an en dash, and each is shown as
   the club's short name from the app's club helper when the club is known. The
   story images are fixed pictures and are not touched.

## Owner direction 2026-10-28: "not too pale, more alive, on brand" (applied)

Only existing tokens, fonts and kit; no new section.

- **Navy stays the stage.** The "Journée" band is the one dark anchor; the card
  inside it carries the matchday.
- **The countdown is the loudest thing on the card.** "Coup d'envoi dans" in the
  small label style, then the time left ("1 h 13") in the Changa score style
  (`ui.score.md`) in Fresh Turf (`--ui-accent-spring`, on navy, text on the
  band only, never the gradient). A live or finished card says "En direct" /
  "Terminé" in the same style.
- **The result bar is in full club colours**, 16px tall on a surface plate (the
  palette's edge colours are measured against it), and the two clubs' shares are
  in the display face (`ui.score.row`); the draw stays a quiet line.
- **The white sections below get life without a new section.** On the "À venir"
  list, today's group leads with a Fresh Turf dot, a navy title and a 3px Fresh
  Turf top edge on its card; the rows keep their club-colour edge bars. The
  earned gradient stays on the Fantasy invitation's button, the one on the
  screen: no second gradient is added.
- Dark theme stays calm: the same navy band, the same measured club fills.

## Acceptance criteria

- No row of three equal pills (1 / N / 2) anywhere on Home, in either language,
  in either theme.
- Visual, 320, 390 and 1440 px wide, French and Arabic (RTL), light and dark: no
  horizontal overflow (measured with element boxes), every vote target at least
  44px, new text at least 12px, equal-height slides, home on the start side.
- The countdown is right in Morocco time, updates without a reload, shifts
  nothing when it first appears (the server renders the line's space only).
- Functional (component tests, mocked votes; nothing is voted against
  production): the hold while votes load, two club targets plus a quiet draw,
  the pressed state, the bar with percentages after a vote, no percentages under
  20 votes, nothing when the game is closed.
- Tests: the countdown and day-word helper, the story caption helper, the
  updated NextMatchPick and carousel tests, i18n keys in both dictionaries.
