import { Link } from "@tanstack/react-router";
import { useEffect } from "react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { questionView } from "@/components/predictions/match-votes";
import { useMatchVotes } from "@/components/predictions/use-match-votes";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";
import type { MatchVoteChoice } from "@/backend/predictions/contracts";
import type { Club, Match } from "@/types/domain";
import { bandClubName } from "./band-matches";

const PANEL = "bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_10%,transparent)]";
const PICK_OUTLINE = "border-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_40%,transparent)]";
/** A blank capsule on the panel while the vote loads: a faint wash, no edge. */
const HOLD_FILL = "bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_8%,transparent)]";
/**
 * The shape of a vote button, shared by the hold that keeps its place. Every
 * state carries a 1px edge (transparent when chosen or held), so a button is
 * as tall chosen as not, and the hold as tall as the button it stands for.
 */
const PICK_SHELL = cn(
  "flex min-h-[var(--ui-tap-min)] items-center justify-center border px-2 py-1.5 text-center leading-tight",
  ui.radius.full,
  ui.text.meta,
  "[font-weight:var(--ui-weight-heavy)]",
);

/**
 * The next match, inside Home's navy band: the two clubs, the kickoff, and —
 * when fans can vote on it — "Qui va gagner ?" with one tap each for the home
 * side, the draw and the away side.
 *
 * The tap is the match page's own "who wins" vote (`useMatchVotes`): the same
 * record, the same cache, kept on the account when signed in and on the phone
 * for a visitor. It is not the score prediction of /pronostics, which needs
 * two figures. With no vote to cast (the game is off, the match is not
 * covered, kickoff has passed) the panel is the match alone.
 *
 * Home is the first button, so Arabic puts it on the right as the score
 * header does. A button is 44px tall at least and says what it picks.
 *
 * Until the votes are known (the server's render never has them) the vote
 * row's space is held, so the band does not grow when they arrive, but only
 * while a vote is expected (`holdVote`): the caller says no when the match
 * cannot have one (its journée unknown, its kick-off past) or when another
 * card has already found the game closed. The row then closes only if the
 * read finds no vote after all, which the server cannot know beforehand
 * (Pronostics off, or open to testers only).
 *
 * In the band's carousel (`fill`) the panel takes its slide's whole height,
 * the clubs centred in the space above the vote row, so the vote rows of the
 * cards side by side line up and no card is shorter than its neighbour.
 */
export function NextMatchPick({
  match,
  home,
  away,
  withVote,
  fill = false,
  votesEnabled = true,
  holdVote = true,
  onGameClosed,
}: {
  match: Match;
  home: Club;
  away: Club;
  /** Offer the vote: the caller's say, as it holds the Pronostics flag. */
  withVote: boolean;
  /** A slide of the band's carousel: no top margin, and the slide's full height. */
  fill?: boolean;
  /** Read the votes now; the carousel reads the card in view and its neighbours first. */
  votesEnabled?: boolean;
  /** Hold the vote row's place while the votes are read: a vote is expected. */
  holdVote?: boolean;
  /**
   * The read found the game closed to this reader, or failed: true of every
   * match, so the carousel stops holding the row on its other cards.
   */
  onGameClosed?: () => void;
}) {
  const { t, tr, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const kickoff = new Date(match.kickoff);
  const when = moroccoDateTimeFormat(locale, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(kickoff);
  const name = (club: Club) => bandClubName(club, tr);

  return (
    <div
      className={cn("p-3", fill ? "flex flex-1 flex-col" : "mt-5", ui.radius.card, PANEL)}
      data-testid="home-next-match"
    >
      <Link
        to="/matches/$matchId"
        params={{ matchId: match.id }}
        className={cn(
          "grid grid-cols-[1fr_auto_1fr] items-center gap-2",
          fill && "flex-1",
          ui.focusOnMesh,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ClubCrest club={home} size="md" tone="inverse" />
          <span
            className={cn("min-w-0", ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}
          >
            {name(home)}
          </span>
        </span>
        <span className="flex flex-col items-center text-center">
          <bdi className={cn(ui.score.row, ui.text.tabular)}>
            {moroccoDateTimeFormat(locale, {
              hour: "2-digit",
              minute: "2-digit",
            }).format(kickoff)}
          </bdi>
          <span className={cn(ui.text.micro, ui.tone.onInkMuted)}>{when.split(/[\s,]+/)[0]}</span>
        </span>
        <span className="flex min-w-0 flex-row-reverse items-center gap-2 text-end">
          <ClubCrest club={away} size="md" tone="inverse" />
          <span
            className={cn("min-w-0", ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}
          >
            {name(away)}
          </span>
        </span>
      </Link>

      {withVote ? (
        <WinnerPick
          match={match}
          home={home}
          away={away}
          name={name}
          enabled={votesEnabled}
          hold={holdVote}
          onGameClosed={onGameClosed}
        />
      ) : null}
    </div>
  );
}

/**
 * "Qui va gagner ?" and its three buttons; its space held while the votes are
 * read, if asked; nothing when there is no vote to cast.
 */
function WinnerPick({
  match,
  home,
  away,
  name,
  enabled,
  hold,
  onGameClosed,
}: {
  match: Match;
  home: Club;
  away: Club;
  name: (club: Club) => string;
  enabled: boolean;
  hold: boolean;
  onGameClosed?: () => void;
}) {
  const { t } = useI18n();
  const votes = useMatchVotes(match.id, { enabled });
  const dto = votes.votes;
  // Closed to this reader (or unreadable) is not this match's own state.
  const gameClosed = dto ? !dto.allowed : votes.failed;
  useEffect(() => {
    if (gameClosed) onGameClosed?.();
  }, [gameClosed, onGameClosed]);
  const winner =
    dto?.allowed && dto.covered && dto.open
      ? dto.questions.find((entry) => entry.question === "winner")
      : undefined;
  const view = winner
    ? questionView(winner, votes.uid ? null : (votes.phone.winner ?? null))
    : undefined;

  const choices: { choice: MatchVoteChoice; label: string }[] = [
    { choice: "home", label: name(home) },
    { choice: "draw", label: t("predictions.votes.draw") },
    { choice: "away", label: name(away) },
  ];
  if (!view) {
    return hold && votes.pending ? <WinnerPickHold labels={choices.map((c) => c.label)} /> : null;
  }
  return (
    <div className="mt-3">
      <p className={cn("mb-2 text-center", ui.text.label, ui.tone.onInkMuted)}>
        {t("predictions.votes.winner")}
      </p>
      <div
        role="group"
        aria-label={t("predictions.votes.winner")}
        className="grid grid-cols-3 gap-2"
      >
        {choices.map(({ choice, label }) => {
          const mine = view.options.find((option) => option.choice === choice)?.mine ?? false;
          return (
            <button
              key={choice}
              type="button"
              aria-pressed={mine}
              onClick={() => votes.cast("winner", choice)}
              className={cn(
                PICK_SHELL,
                ui.focusOnMesh,
                mine
                  ? "border-transparent bg-[color:var(--ui-surface)] text-[color:var(--ui-ink-fg)]"
                  : PICK_OUTLINE,
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The vote row's place while the votes are read: the question's line and the
 * three buttons' labels, kept invisible, in the buttons' own shape, so the
 * hold wraps where they will and is exactly as tall. What shows is three
 * blank capsules. Nothing to read or press, so hidden from assistive tech.
 */
function WinnerPickHold({ labels }: { labels: readonly string[] }) {
  const { t } = useI18n();
  return (
    <div className="mt-3" aria-hidden data-testid="home-vote-hold">
      <p className={cn("invisible mb-2 text-center", ui.text.label)}>
        {t("predictions.votes.winner")}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {labels.map((label, slot) => (
          <span key={slot} className={cn(PICK_SHELL, "border-transparent", HOLD_FILL)}>
            <span className="invisible">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
