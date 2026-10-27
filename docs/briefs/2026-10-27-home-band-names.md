# Home band card: club names no longer run into the kickoff (screen brief)

Follow-up to the approved Home redesign (`docs/briefs/2026-10-27-home-redesign.md`),
asked for by the owner on 2026-10-27. Branch `claude/home-band-names`. Scope:
the match card in the gameweek band, `src/components/home/NextMatchPick.tsx`.

## What must be preserved

- The card's content: both crests, both club names (short name unless it is a
  code), the kickoff time and weekday, the link to the match page.
- "Qui va gagner ?" and its three buttons, their size, the held row while the
  votes are read, and the carousel's equal-height slides.
- Home on the start side, away on the end side (mirrored in Arabic).
- The band's "Journée N" label. It is correct as it is: Fantasy gameweek 5 runs
  until 30 October and Wednesday's and Thursday's matches are its catch-up
  fixtures (`app.fixtures.round_id` is round 5), so no change is made there.

## Improvements

1. Each club's side stacks the crest above the name, both centred. Beside the
   crest a phone left a name about 40px, so "Raja Casablanca" ran into
   "18:00 mer."; under it the name has the whole side. A single word longer than
   the side breaks instead of overflowing.

## Acceptance criteria

- At 320 and 360px, French and Arabic: no club name touches the kickoff block,
  no horizontal overflow.
- Desktop unchanged apart from the stacked crest.
- The Home tests pass.
