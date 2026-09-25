import { Ban, Pencil, Trophy } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import type { MatchVoteChoice, PredictionFixtureDto } from "@/backend/predictions/contracts";
import { ClubCrest } from "@/components/common/ClubCrest";
import { ui, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { presentFootballClub } from "@/services/football";
import { formatShare, formatVoteTotal, type VoteQuestionView } from "./match-votes";

/** The player's own answer: an ink outline over a wash of ink, as Sofascore marks it. */
const MINE = cn(
  "border-[color:var(--ui-ink-fg)] text-[color:var(--ui-ink-fg)]",
  "bg-[color:color-mix(in_oklab,var(--ui-ink-fg)_16%,var(--ui-surface))]",
);

/**
 * One fan vote on a match page (owner decision 2026-09-25): Sofascore's card
 * drawn with BotolaGO's kit. The question, a trophy, and two or three answer
 * pills: the clubs' crests, X for a draw, yes and no.
 *
 * Before the player votes, every pill is outlined in ink and the card asks for
 * a vote. Once they have voted, or the match has kicked off, each pill shows
 * its answer at the start and its share of the votes at the end; the player's
 * own answer is washed and outlined in ink, the others stay plain, and the
 * card gives the total. While the match is still open, the pencil beside the
 * trophy brings the choice back, to change the vote. The home answer comes
 * first in the markup, so in Arabic it sits on the right, as in the score
 * header above.
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
  const [editing, setEditing] = useState(false);
  const home = presentFootballClub(fixture.home);
  const away = presentFootballClub(fixture.away);
  const homeName = fixture.home.shortName || fixture.home.name;
  const awayName = fixture.away.shortName || fixture.away.name;
  const voted = view.mine !== null;
  const revealed = !open || (voted && !editing);
  const total = t("predictions.votes.total").replace("{n}", formatVoteTotal(view.total, lang));

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
    // 24px once the share sits beside it: crest and "42 %" then fit side by
    // side in each of three pills on a 360px phone.
    const crest = revealed ? "h-6 w-6" : undefined;
    if (choice === "home") return <ClubCrest club={home} size="sm" className={crest} />;
    if (choice === "away") return <ClubCrest club={away} size="sm" className={crest} />;
    if (choice === "none") return <Ban className="h-5 w-5 shrink-0" aria-hidden />;
    return (
      <span className={cn(ui.text.bodyStrong, "uppercase")}>
        {choice === "draw"
          ? "X"
          : choice === "yes"
            ? t("predictions.votes.yes")
            : t("predictions.votes.no")}
      </span>
    );
  };

  const pill = "flex min-h-[var(--ui-tap-min)] min-w-0 items-center gap-1 rounded-full border-2";

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
              : revealed
                ? total
                : t("predictions.votes.cta")}
          </p>
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
              // The answer at the start, the share at the end. The two share
              // the free space as margins, so when they cannot sit side by
              // side (three answers, "100 %", a 360px phone) the share wraps
              // under the answer, both centred, instead of being cut.
              <li
                key={option.choice}
                data-choice={option.choice}
                data-mine={option.mine}
                className={cn(
                  pill,
                  "relative flex-wrap content-center gap-y-0.5 px-1.5 py-1",
                  option.mine
                    ? MINE
                    : "border-[color:var(--ui-rule)] bg-[color:var(--ui-page)] text-[color:var(--ui-on-surface)]",
                )}
              >
                {/* Pinned inside the pill: left to find its own place in a
                    wrapping row, the browser puts it past the card's edge. */}
                <span className="sr-only start-0 top-0">
                  {(option.mine
                    ? t("predictions.votes.answer_share_mine")
                    : t("predictions.votes.answer_share")
                  )
                    .replace("{answer}", label(option.choice))
                    .replace("{share}", share)}
                </span>
                <span aria-hidden className="mx-auto flex shrink-0 items-center">
                  {face(option.choice)}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    ui.text.secondary,
                    ui.text.tabular,
                    "mx-auto shrink-0 whitespace-nowrap [font-weight:var(--ui-weight-heavy)]",
                  )}
                >
                  <bdi>{share}</bdi>
                </span>
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
                "justify-center px-1.5",
                option.mine ? MINE : "border-[color:var(--ui-ink-fg)]",
                ui.focus,
              )}
            >
              {face(option.choice)}
            </button>
          ))}
        </div>
      )}
    </UiCard>
  );
}
