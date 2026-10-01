import { Link } from "@tanstack/react-router";

import { ClubCrest } from "@/components/common/ClubCrest";
import { questionView } from "@/components/predictions/match-votes";
import { useMatchVotes } from "@/components/predictions/use-match-votes";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";
import { cn } from "@/lib/utils";
import type { MatchVoteChoice } from "@/backend/predictions/contracts";
import type { Club, Match } from "@/types/domain";

const PANEL = "bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_10%,transparent)]";
const PICK_OUTLINE =
  "border border-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_40%,transparent)]";

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
 */
export function NextMatchPick({
  match,
  home,
  away,
  withVote,
}: {
  match: Match;
  home: Club;
  away: Club;
  /** Offer the vote: the caller's say, as it holds the Pronostics flag. */
  withVote: boolean;
}) {
  const { t, tr, lang } = useI18n();
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  const kickoff = new Date(match.kickoff);
  const when = new Intl.DateTimeFormat(locale, {
    timeZone: MATCH_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(kickoff);
  const name = (club: Club) => {
    const short = tr(club.shortName);
    return /^[A-Z0-9]{2,6}$/.test(short.trim()) ? tr(club.name) : short;
  };

  return (
    <div className={cn("mt-5 p-3", ui.radius.card, PANEL)} data-testid="home-next-match">
      <Link
        to="/matches/$matchId"
        params={{ matchId: match.id }}
        className={cn("grid grid-cols-[1fr_auto_1fr] items-center gap-2", ui.focusOnMesh)}
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
            {new Intl.DateTimeFormat(locale, {
              timeZone: MATCH_TIME_ZONE,
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

      {withVote ? <WinnerPick match={match} home={home} away={away} name={name} /> : null}
    </div>
  );
}

/** "Qui va gagner ?" and its three buttons; nothing when there is no vote to cast. */
function WinnerPick({
  match,
  home,
  away,
  name,
}: {
  match: Match;
  home: Club;
  away: Club;
  name: (club: Club) => string;
}) {
  const { t } = useI18n();
  const votes = useMatchVotes(match.id);
  const dto = votes.votes;
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
  if (!view) return null;
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
                "flex min-h-[var(--ui-tap-min)] items-center justify-center px-2 py-1.5 text-center leading-tight",
                ui.radius.full,
                ui.text.meta,
                "[font-weight:var(--ui-weight-heavy)]",
                ui.focusOnMesh,
                mine ? "bg-[color:var(--ui-surface)] text-[color:var(--ui-ink-fg)]" : PICK_OUTLINE,
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
