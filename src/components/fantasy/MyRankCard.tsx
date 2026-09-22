import { Hourglass, Target, UserPlus } from "lucide-react";

import { ui, UiButton, UiCard, UiLinkButton, UiSkeleton, UiStatBlock } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { LeagueStanding } from "@/types/fantasy";
import { RankChangeIndicator } from "./RankChangeIndicator";
import { selectMyRankState, type TeamPresence } from "./my-rank-state";

/**
 * "My rank" summary card, on the kit.
 *
 * The card still takes team ownership (`presence`) separately from the
 * standing, and `selectMyRankState` still decides which of the four states is
 * shown — that logic is untouched. What changed is how each state is drawn:
 * `UiCard` for the surface, `UiStatBlock` for the three figures (so they are
 * tabular and line up with every other figure in Fantasy), `UiSkeleton` for
 * the pending shimmer, and kit buttons for the two actions.
 *
 * The literal `bg-white` is gone from all four branches. On a themed page it
 * was an un-themed surface: in dark mode the card stayed white while the text
 * token went light, which is the 1.09:1 measurement this work exists to fix.
 *
 * `UiCard` deliberately takes no arbitrary DOM props, so the `data-testid`
 * hooks and the live-region roles sit on a style-free wrapper rather than
 * being dropped.
 */

/** A stat tile inside the card: the sunken plate plus a tabular figure. */
const TILE = "px-2 py-2";

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

  const kicker = <p className={cn(ui.text.label, ui.tone.ink)}>{t("fantasy.rankings.my_rank")}</p>;

  if (state.kind === "pending") {
    return (
      <div
        data-testid="my-rank-card-pending"
        role="status"
        aria-busy="true"
        aria-label={t("state.loading")}
      >
        <UiCard>
          {kicker}
          <UiSkeleton className="mt-2 h-4 w-32 max-w-full" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <UiSkeleton className="h-12" />
            <UiSkeleton className="h-12" />
            <UiSkeleton className="h-12" />
          </div>
        </UiCard>
      </div>
    );
  }

  if (state.kind === "no_team") {
    return (
      <div data-testid="my-rank-card-no-team">
        <UiCard className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
              {t("fantasy.rankings.no_team")}
            </p>
            <p className={cn(ui.text.secondary, ui.tone.muted)}>
              {t("fantasy.rankings.no_team_desc")}
            </p>
          </div>
          <UiLinkButton to="/fantasy/create" size="sm" className="shrink-0">
            <UserPlus className="h-4 w-4" aria-hidden />
            {t("fantasy.rankings.create_team")}
          </UiLinkButton>
        </UiCard>
      </div>
    );
  }

  if (state.kind === "unranked") {
    return (
      <div data-testid="my-rank-card-unranked">
        <UiCard>
          {kicker}
          {state.teamName ? (
            <p dir="auto" className={cn("truncate", ui.text.bodyStrong, ui.tone.default)}>
              {state.teamName}
            </p>
          ) : null}
          <p className={cn("mt-2 flex items-start gap-2", ui.text.bodyStrong, ui.tone.default)}>
            <Hourglass className={cn("mt-0.5 h-4 w-4 shrink-0", ui.tone.muted)} aria-hidden />
            {t("fantasy.rankings.no_rank_yet")}
          </p>
          <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>
            {t("fantasy.rankings.no_rank_yet_desc")}
          </p>
        </UiCard>
      </div>
    );
  }

  const ranked = state.standing;
  return (
    <div data-testid="my-rank-card">
      <UiCard>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {kicker}
            <p dir="auto" className={cn("truncate", ui.text.bodyStrong, ui.tone.default)}>
              {ranked.teamName}
            </p>
          </div>
          <RankChangeIndicator rank={ranked.rank} previousRank={ranked.previousRank} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <UiStatBlock
            align="center"
            tone="ink"
            label={t("fantasy.overall_rank")}
            value={nf.format(ranked.rank)}
            className={cn(TILE, ui.radius.control, ui.surface.sunken)}
          />
          <UiStatBlock
            align="center"
            label={t("fantasy.total_points")}
            value={nf.format(ranked.totalScore)}
            className={cn(TILE, ui.radius.control, ui.surface.sunken)}
          />
          <UiStatBlock
            align="center"
            label={t("fantasy.gw_points")}
            value={nf.format(ranked.gameweekScore)}
            className={cn(TILE, ui.radius.control, ui.surface.sunken)}
          />
        </div>
        {onJump ? (
          <UiButton variant="outline" className="mt-3" onClick={onJump}>
            <Target className="h-4 w-4" aria-hidden />
            {t("fantasy.rankings.jump_to_me")}
          </UiButton>
        ) : null}
      </UiCard>
    </div>
  );
}
