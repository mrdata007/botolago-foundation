import type { Match } from "@/types/domain";

/**
 * The matches the gameweek band shows (BG-0155): every match being played,
 * then the matches of the journée the band names that are still to come, by
 * kick-off. A swipe goes through the round the band's title announces.
 *
 * Live matches come first whatever their round, as the live card always did:
 * a match under way is the loudest thing on the page. A fixture whose round is
 * not known (`gameweek` 0) is kept rather than guessed away.
 *
 * When the journée has nothing live and nothing left to play, the band shows
 * what it showed before the carousel: the next match, whichever round it
 * belongs to. With no match to come at all, nothing.
 */
export function bandMatches(matches: readonly Match[], gameweek: number | undefined): Match[] {
  const live = matches.filter((match) => match.status === "live");
  const upcoming = matches
    .filter((match) => match.status === "scheduled")
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const ofRound = upcoming.filter(
    (match) => gameweek === undefined || match.gameweek <= 0 || match.gameweek === gameweek,
  );
  if (live.length > 0 || ofRound.length > 0) return [...live, ...ofRound];
  return upcoming.slice(0, 1);
}
