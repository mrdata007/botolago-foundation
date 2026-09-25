import { Ban, Trophy } from "lucide-react";
import { useId, type ReactNode } from "react";

import type { MatchVoteChoice, PredictionFixtureDto } from "@/backend/predictions/contracts";
import { ClubCrest } from "@/components/common/ClubCrest";
import { ui, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { presentFootballClub } from "@/services/football";
import { formatShare, type VoteQuestionView } from "./match-votes";
import { formatNumber } from "./predictions-copy";

/**
 * One fan vote on a match page (owner decision 2026-09-25): Sofascore's card
 * drawn with BotolaGO's kit. The question, a trophy, and two or three answer
 * pills: the clubs' crests, X for a draw, yes and no.
 *
 * Before the player votes, every pill is outlined in ink. Once they have
 * voted, or the match has kicked off, each pill carries its share of the votes
 * as a fill from the start side (the right, in Arabic) and the player's answer
 * keeps the ink outline. The home answer comes first in the markup, so in
 * Arabic it sits on the right, as in the score header above.
 */
export function MatchVoteCard({
  fixture,
  view,
  open,
  onVote,
}: {
  fixture: PredictionFixtureDto;
  view: VoteQuestionView;
  /** Votes can still change: the match has not kicked off. */
  open: boolean;
  onVote: (choice: MatchVoteChoice) => void;
}) {
  const { t, lang } = useI18n();
  const titleId = useId();
  const home = presentFootballClub(fixture.home);
  const away = presentFootballClub(fixture.away);
  const homeName = fixture.home.shortName || fixture.home.name;
  const awayName = fixture.away.shortName || fixture.away.name;
  const revealed = view.mine !== null || !open;
  const total = t("predictions.votes.total").replace("{n}", formatNumber(view.total, lang));

  const label = (choice: MatchVoteChoice): string => {
    const team = choice === "home" ? homeName : awayName;
    if (view.question === "winner")
      return choice === "draw"
        ? t("predictions.votes.draw")
        : t("predictions.votes.team_wins").replace("{team}", team);
    if (view.question === "first_goal")
      return choice === "none"
        ? t("predictions.votes.no_goal")
        : t("predictions.votes.team_first").replace("{team}", team);
    return choice === "yes" ? t("predictions.votes.yes") : t("predictions.votes.no");
  };

  const face = (choice: MatchVoteChoice): ReactNode => {
    // Smaller once the share sits beside it: three pills fit 360px.
    if (choice === "home") return <ClubCrest club={home} size={revealed ? "xs" : "sm"} />;
    if (choice === "away") return <ClubCrest club={away} size={revealed ? "xs" : "sm"} />;
    if (choice === "none") return <Ban className="h-5 w-5 shrink-0" aria-hidden />;
    return (
      <span className={ui.text.bodyStrong}>
        {choice === "draw"
          ? "X"
          : choice === "yes"
            ? t("predictions.votes.yes")
            : t("predictions.votes.no")}
      </span>
    );
  };

  return (
    <UiCard
      padding="md"
      testId={`match-vote-${view.question}`}
      className="flex h-full w-full flex-col justify-between gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={titleId} className={ui.text.subtitle}>
            {view.question === "winner"
              ? t("predictions.votes.winner")
              : view.question === "both_score"
                ? t("predictions.votes.both_score")
                : t("predictions.votes.first_goal")}
          </h3>
          <p className={cn(ui.text.meta, ui.tone.muted)}>
            {!open
              ? `${t("predictions.votes.closed")} · ${total}`
              : view.mine
                ? total
                : t("predictions.votes.cta")}
          </p>
        </div>
        <Trophy className={cn("h-6 w-6 shrink-0", ui.tone.ink)} aria-hidden />
      </div>

      <div
        role="group"
        aria-labelledby={titleId}
        className={cn("grid gap-2", view.options.length === 3 ? "grid-cols-3" : "grid-cols-2")}
      >
        {view.options.map((option) => {
          const share = formatShare(option.percent, lang);
          return (
            <button
              key={option.choice}
              type="button"
              disabled={!open}
              aria-pressed={option.mine}
              aria-label={
                revealed
                  ? t("predictions.votes.answer_share")
                      .replace("{answer}", label(option.choice))
                      .replace("{share}", share)
                  : label(option.choice)
              }
              data-choice={option.choice}
              onClick={() => onVote(option.choice)}
              className={cn(
                "relative isolate flex min-h-[var(--ui-tap-min)] min-w-0 items-center justify-center gap-1 overflow-hidden rounded-full border-2 px-1.5",
                option.mine || !revealed
                  ? "border-[color:var(--ui-ink-fg)]"
                  : "border-[color:var(--ui-rule-strong)]",
                "disabled:cursor-default",
                ui.focus,
              )}
            >
              {revealed ? (
                <span
                  aria-hidden
                  className="absolute inset-y-0 start-0 -z-10 bg-[color:var(--ui-surface-sunken)]"
                  style={{ width: `${option.percent}%` }}
                />
              ) : null}
              {face(option.choice)}
              {revealed ? (
                <span
                  aria-hidden
                  className={cn(
                    ui.text.meta,
                    ui.text.tabular,
                    "whitespace-nowrap",
                    option.mine && "[font-weight:var(--ui-weight-heavy)]",
                  )}
                >
                  <bdi>{share}</bdi>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </UiCard>
  );
}
