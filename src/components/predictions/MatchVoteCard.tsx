import { Check, Pencil, Trophy } from "lucide-react";
import { useId, useState } from "react";

import type { MatchVoteChoice, PredictionFixtureDto } from "@/backend/predictions/contracts";
import { bandClubName } from "@/components/home/band-matches";
import { ui, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { presentFootballClub } from "@/services/football";
import { formatShare, formatVoteTotal, sharesVisible, type VoteQuestionView } from "./match-votes";

/** The player's own answer: an ink outline over a wash of ink, as Sofascore marks it. */
const MINE = cn(
  "border-[color:var(--ui-ink-fg)] text-[color:var(--ui-ink-fg)]",
  "bg-[color:color-mix(in_oklab,var(--ui-ink-fg)_16%,var(--ui-surface))]",
);

/**
 * One fan vote on a match page (owner decision 2026-09-25): Sofascore's card
 * drawn with BotolaGO's kit. The question, a trophy, and two or three answer
 * pills, each one written out: the clubs' names, "Match nul", "Aucun but",
 * "Oui", "Non". Never a crest for a club or an "X" for a draw: three pills
 * reading crest, X, crest are a betting slip's 1 / X / 2, and BotolaGO looks
 * nothing like betting (PRODUCT.md, critique of 2026-10-06). The names are the
 * ones Home's band uses for the same vote (`bandClubName`).
 *
 * Before the player votes, every pill is outlined in ink and the question
 * stands alone. Once they have voted, or the match has kicked off, each pill
 * shows its answer and its share of the votes; the player's own answer is
 * washed and outlined in ink, the others stay plain, and the card gives the
 * total. While the match is still open, the pencil beside the trophy brings
 * the choice back, to change the vote. The home answer comes first in the
 * markup, so in Arabic it sits on the right, as in the score header above.
 */
export function MatchVoteCard({
  fixture,
  view,
  open,
  onVote,
  className,
}: {
  fixture: PredictionFixtureDto;
  view: VoteQuestionView;
  /** Votes can still change: the match has not kicked off. */
  open: boolean;
  onVote: (choice: MatchVoteChoice) => void;
  /** Extra layout from the host, e.g. filling what its slide leaves under the heading. */
  className?: string;
}) {
  const { t, tr, lang } = useI18n();
  const titleId = useId();
  const [editing, setEditing] = useState(false);
  const homeName = bandClubName(presentFootballClub(fixture.home), tr);
  const awayName = bandClubName(presentFootballClub(fixture.away), tr);
  const voted = view.mine !== null;
  const revealed = !open || (voted && !editing);
  const showShares = sharesVisible(view.total);
  // Under the threshold neither the shares nor the count are shown ("0 % ·
  // 0 votes" tells a reader nothing), only that more votes are needed.
  const total = showShares
    ? t("predictions.votes.total").replace("{n}", formatVoteTotal(view.total, lang))
    : t("predictions.votes.too_few");

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

  // What a pill shows: the answer in words, as short as it reads. A club is
  // its name; the other answers are their own words.
  const face = (choice: MatchVoteChoice): string => {
    if (choice === "home") return homeName;
    if (choice === "away") return awayName;
    if (choice === "draw") return t("predictions.votes.draw");
    if (choice === "none") return t("predictions.votes.no_goal");
    return choice === "yes" ? t("predictions.votes.yes") : t("predictions.votes.no");
  };
  // The kit's small-button label (13px at 800), centred, wrapping onto a
  // second line rather than cut when a name is long ("Kawkab Marrakech" in a
  // third of a 360px phone).
  const faceText = cn(
    "min-w-0 text-center [overflow-wrap:anywhere]",
    ui.text.meta,
    "[font-weight:var(--ui-weight-heavy)]",
  );

  const pill = "flex min-h-[var(--ui-tap-min)] min-w-0 items-center gap-1 rounded-full border-2";

  return (
    <UiCard
      padding="md"
      testId={`match-vote-${view.question}`}
      className={cn("flex w-full flex-col justify-between gap-4", className ?? "h-full")}
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
          {/* Nothing under an open question: it asks on its own. Once
              answered, or closed, the line gives the count. */}
          {revealed ? (
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {open ? total : `${t("predictions.votes.closed")} · ${total}`}
            </p>
          ) : null}
        </div>
        <div className={cn("flex shrink-0 items-center gap-1", ui.tone.ink)}>
          {open && voted ? (
            <>
              <button
                type="button"
                aria-pressed={editing}
                aria-label={t("predictions.votes.edit")}
                onClick={() => setEditing((current) => !current)}
                className={cn(
                  "-my-2.5 grid size-11 place-items-center rounded-full",
                  editing && "bg-[color:color-mix(in_oklab,var(--ui-ink-fg)_16%,transparent)]",
                  ui.focus,
                )}
              >
                <Pencil className="h-5 w-5" aria-hidden />
              </button>
              <span aria-hidden className="me-2 h-6 w-px bg-[color:var(--ui-rule-strong)]" />
            </>
          ) : null}
          <Trophy className="h-6 w-6" aria-hidden />
        </div>
      </div>

      {revealed ? (
        <ul
          aria-labelledby={titleId}
          className={cn("grid gap-1.5", view.options.length === 3 ? "grid-cols-3" : "grid-cols-2")}
        >
          {view.options.map((option) => {
            const share = formatShare(option.percent, lang);
            return (
              // The answer, and its share under it, both centred: in a third
              // of a phone a club's name and "42 %" do not fit side by side,
              // and every pill of every card reads the same way.
              <li
                key={option.choice}
                data-choice={option.choice}
                data-mine={option.mine}
                className={cn(
                  pill,
                  "relative flex-col justify-center gap-0.5 px-1.5 py-1",
                  option.mine
                    ? MINE
                    : "border-[color:var(--ui-rule)] bg-[color:var(--ui-page)] text-[color:var(--ui-on-surface)]",
                )}
              >
                {/* Pinned inside the pill: left to find its own place, the
                    browser can put it past the card's edge. */}
                <span className="sr-only start-0 top-0">
                  {showShares
                    ? (option.mine
                        ? t("predictions.votes.answer_share_mine")
                        : t("predictions.votes.answer_share")
                      )
                        .replace("{answer}", label(option.choice))
                        .replace("{share}", share)
                    : label(option.choice)}
                </span>
                <span aria-hidden className={cn("mx-auto", faceText)}>
                  {face(option.choice)}
                </span>
                {showShares || option.mine ? (
                  <span
                    aria-hidden
                    className={cn(
                      ui.text.secondary,
                      ui.text.tabular,
                      "mx-auto shrink-0 whitespace-nowrap [font-weight:var(--ui-weight-heavy)]",
                    )}
                  >
                    {showShares ? <bdi>{share}</bdi> : <Check className="h-4 w-4" />}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div
          role="group"
          aria-labelledby={titleId}
          className={cn("grid gap-1.5", view.options.length === 3 ? "grid-cols-3" : "grid-cols-2")}
        >
          {view.options.map((option) => (
            <button
              key={option.choice}
              type="button"
              aria-pressed={option.mine}
              aria-label={label(option.choice)}
              data-choice={option.choice}
              data-mine={option.mine}
              onClick={() => {
                setEditing(false);
                onVote(option.choice);
              }}
              className={cn(
                pill,
                "justify-center px-1.5 py-1",
                option.mine ? MINE : "border-[color:var(--ui-ink-fg)]",
                ui.focus,
              )}
            >
              <span className={faceText}>{face(option.choice)}</span>
            </button>
          ))}
        </div>
      )}
    </UiCard>
  );
}
