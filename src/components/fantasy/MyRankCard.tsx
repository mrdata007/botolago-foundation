import { Hourglass, Target, UserPlus } from "lucide-react";
import type { ReactNode } from "react";

import { RankOrdinal } from "@/components/fantasy-lists/RankOrdinal";
import { rankOrdinal } from "@/components/fantasy-lists/rank-ordinal";
import { ui, UiIconButton, UiLinkButton, UiRankMovement, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { LeagueStanding } from "@/types/fantasy";
import { selectMyRankState, type TeamPresence } from "./my-rank-state";

/**
 * "Your position" — the line above the rankings table (A-Rankings).
 *
 * The approved board draws it as a line, not a card: a 4px action-gradient
 * bar on the inline start, the kicker, the rank as a display figure with its
 * ordinal ("12 483ᵉ"), then "team · points · movement". The four states are
 * unchanged — `selectMyRankState` still decides which one shows, from team
 * ownership (`presence`) rather than from the missing standing — and each
 * keeps its `data-testid` wrapper and, for the pending shimmer, its busy
 * status role.
 *
 * "Go to my position" stays: it is a round control at the end of the line,
 * named by its label, rather than the full-width button it used to be.
 */
export function MyRankCard({
  standing,
  presence,
  onJump,
}: {
  standing?: LeagueStanding;
  /** Whether this visitor owns a team — see `selectTeamPresence`. */
  presence: TeamPresence;
  onJump?: () => void;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const state = selectMyRankState({ standing, presence });

  const kicker = (
    <p className={cn(ui.text.label, ui.tone.muted)}>{t("fantasy.rankings.my_rank")}</p>
  );

  if (state.kind === "pending") {
    return (
      <div
        data-testid="my-rank-card-pending"
        role="status"
        aria-busy="true"
        aria-label={t("state.loading")}
      >
        <PositionLine>
          {kicker}
          <UiSkeleton className="mt-2 h-8 w-36 max-w-full" />
          <UiSkeleton className="mt-2 h-4 w-52 max-w-full" />
        </PositionLine>
      </div>
    );
  }

  if (state.kind === "no_team") {
    return (
      <div data-testid="my-rank-card-no-team">
        <PositionLine>
          {kicker}
          <p className={cn("mt-1.5", ui.text.bodyStrong, ui.tone.default)}>
            {t("fantasy.rankings.no_team")}
          </p>
          <p className={cn(ui.text.secondary, ui.tone.muted)}>
            {t("fantasy.rankings.no_team_desc")}
          </p>
          <UiLinkButton to="/fantasy/create" size="sm" className="mt-3 self-start">
            <UserPlus className="h-4 w-4" aria-hidden />
            {t("fantasy.rankings.create_team")}
          </UiLinkButton>
        </PositionLine>
      </div>
    );
  }

  if (state.kind === "unranked") {
    return (
      <div data-testid="my-rank-card-unranked">
        <PositionLine>
          {kicker}
          {state.teamName ? (
            <p dir="auto" className={cn("mt-1.5 truncate", ui.text.bodyStrong, ui.tone.default)}>
              {state.teamName}
            </p>
          ) : null}
          <p className={cn("mt-1.5 flex items-start gap-2", ui.text.bodyStrong, ui.tone.default)}>
            <Hourglass className={cn("mt-1 h-4 w-4 shrink-0", ui.tone.muted)} aria-hidden />
            {t("fantasy.rankings.no_rank_yet")}
          </p>
          <p className={cn(ui.text.secondary, ui.tone.muted)}>
            {t("fantasy.rankings.no_rank_yet_desc")}
          </p>
        </PositionLine>
      </div>
    );
  }

  const ranked = state.standing;
  return (
    <div data-testid="my-rank-card">
      <PositionLine
        trailing={
          onJump ? (
            <UiIconButton aria-label={t("fantasy.rankings.jump_to_me")} onClick={onJump}>
              <Target aria-hidden />
            </UiIconButton>
          ) : null
        }
      >
        {kicker}
        <p className={cn("mt-2", ui.tone.default)}>
          <RankOrdinal
            size="hero"
            parts={rankOrdinal(ranked.rank, lang, t, (value) => nf.format(value))}
          />
        </p>
        <p
          className={cn(
            "mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1",
            ui.text.secondary,
            ui.tone.default,
          )}
        >
          <span dir="auto" className="min-w-0 truncate [font-weight:var(--ui-weight-strong)]">
            {ranked.teamName}
          </span>
          <span aria-hidden className={ui.tone.muted}>
            ·
          </span>
          <span className="whitespace-nowrap">
            <bdi className={cn(ui.text.tabular, "[font-weight:var(--ui-weight-strong)]")}>
              {nf.format(ranked.totalScore)}
            </bdi>{" "}
            <span className={ui.tone.muted}>{t("fantasy.points.abbr")}</span>
          </span>
          <span aria-hidden className={ui.tone.muted}>
            ·
          </span>
          <UiRankMovement
            variant="quiet"
            rank={ranked.rank}
            previousRank={ranked.previousRank}
            formatDelta={(places) => nf.format(places)}
            labels={{
              up: t("fantasy.rank.up"),
              down: t("fantasy.rank.down"),
              same: t("fantasy.rank.same"),
            }}
          />
        </p>
      </PositionLine>
    </div>
  );
}

/**
 * The line's frame: the gradient edge bar, the content, and an optional
 * control at the inline end. The bar is `ui.edge.bar` repainted with the
 * action gradient — a `to bottom` token, so it reads the same in Arabic.
 */
function PositionLine({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className={ui.edge.bar}
        style={{ backgroundImage: "var(--ui-grad-action)" }}
      />
      <div className="flex min-w-0 flex-1 flex-col py-1">{children}</div>
      {trailing ? <div className="shrink-0 self-center">{trailing}</div> : null}
    </div>
  );
}
