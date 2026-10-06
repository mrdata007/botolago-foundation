import type { Match } from "@/types/domain";

/**
 * The matches the gameweek band shows (BG-0155): every match being played,
 * then the next match to be played and the rest of its round, by kick-off. A
 * swipe goes through that round.
 *
 * The round is read from the payload alone: the round of the next match to be
 * played whose round is known. It is never Fantasy's open gameweek, which is
 * read in the browser only: a card set that followed it would render one way
 * on the server and change shape after load, and could leave out the very
 * next match to be played (a rescheduled match of an earlier round, say). The
 * band's title can name Fantasy's gameweek while the cards are the round
 * still being finished; the single card before the carousel showed that same
 * next match under that same title.
 *
 * Live matches come first whatever their round, as the live card always did:
 * a match under way is the loudest thing on the page. A fixture whose round is
 * not known (`gameweek` 0) is kept rather than guessed away. With no match to
 * come at all, nothing.
 */
export function bandMatches(matches: readonly Match[]): Match[] {
  const live = matches.filter((match) => match.status === "live");
  const upcoming = matches
    .filter((match) => match.status === "scheduled")
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const round = upcoming.find((match) => match.gameweek > 0)?.gameweek;
  const ofRound = upcoming.filter(
    (match) => round === undefined || match.gameweek <= 0 || match.gameweek === round,
  );
  return [...live, ...ofRound];
}

/**
 * Whether a card can expect a vote to cast, from what the server knows too:
 * the match is still to be played, its journée is known (the vote covers only
 * matches with one), and its kick-off was still ahead at `at`, the moment the
 * page was rendered. Only then does the card hold the vote row's place while
 * the votes are read, so it does not close (and shift what is under it) when
 * a vote turns out not to exist. Whether the game is open at all (Pronostics
 * off or testers only) is known only from the read itself.
 */
export function voteMayOpen(match: Match, at: number): boolean {
  return match.status === "scheduled" && match.gameweek > 0 && Date.parse(match.kickoff) > at;
}
