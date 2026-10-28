import { Hourglass, Search, Target, UserPlus } from "lucide-react";
import { lazy, Suspense, type ReactNode } from "react";

import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { rankOrdinal } from "@/components/fantasy-lists/rank-ordinal";
import { MovementPill, RankHeroCard } from "@/components/fantasy-lists/standings-flair";
import { ui, UiIconButton, UiLinkButton, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { LeagueStanding } from "@/types/fantasy";
import { selectMyRankState, type TeamPresence } from "./my-rank-state";
import { pointsUnit } from "@/lib/points-unit";
import { fantasyNextAction } from "@/services/fantasy-next-action";
import { useManagerCardLive } from "@/services/manager-card-status";
import { useFantasyAvailability } from "@/services/use-fantasy-availability";

// The card's token is its own chunk, requested only while the section is live: with the switch
// off this line imports nothing of the Manager Card.
const RankCardToken = lazy(() =>
  import("@/components/manager-card/inline/curva-inline").then((module) => ({
    default: module.RankCardToken,
  })),
);

/**
 * "Your position" — above the rankings table (A-Rankings).
 *
 * Ranked, it is a card (brief 2026-10-28 "more life"): the kicker and the
 * rank, large, with its ordinal ("12 483ᵉ"), on the header gradient, then a
 * strip with "team · points" and the movement as a coloured pill
 * (`RankHeroCard`, `MovementPill`). The other three states keep the line with
 * its action-gradient edge. The four states are
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
  const cardLive = useManagerCardLive();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const state = selectMyRankState({ standing, presence });
  // The card's token, at the end of the line, while live (plan M3c). Display only.
  const cardToken = cardLive ? (
    <Suspense fallback={null}>
      <RankCardToken />
    </Suspense>
  ) : null;

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
          <NoTeamAction />
        </PositionLine>
      </div>
    );
  }

  if (state.kind === "unranked") {
    return (
      <div data-testid="my-rank-card-unranked">
        <PositionLine trailing={cardToken}>
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
  const jump = onJump ? (
    <UiIconButton variant="ink" aria-label={t("fantasy.rankings.jump_to_me")} onClick={onJump}>
      <Target aria-hidden />
    </UiIconButton>
  ) : null;
  return (
    <div data-testid="my-rank-card">
      <RankHeroCard
        kicker={t("fantasy.rankings.my_rank")}
        rank={ranked.rank}
        parts={rankOrdinal(ranked.rank, lang, t, (value) => nf.format(value))}
        trailing={
          cardToken ? (
            <div className="flex items-center gap-1">
              {cardToken}
              {jump}
            </div>
          ) : (
            jump
          )
        }
      >
        <span dir="auto" className="min-w-0 truncate [font-weight:var(--ui-weight-strong)]">
          {ranked.teamName}
        </span>
        <span aria-hidden className={ui.tone.muted}>
          ·
        </span>
        <span className="whitespace-nowrap">
          <bdi className={cn(ui.stat.md, ui.tone.default)}>
            <AnimatedNumber value={ranked.totalScore} format={nf.format} />
          </bdi>{" "}
          <span className={ui.tone.muted}>{pointsUnit(ranked.totalScore, t)}</span>
        </span>
        <MovementPill
          rank={ranked.rank}
          previousRank={ranked.previousRank}
          formatDelta={(places) => nf.format(places)}
          labels={{
            up: t("fantasy.rank.up"),
            down: t("fantasy.rank.down"),
            same: t("fantasy.rank.same"),
            unknown: t("fantasy.rank.unknown"),
          }}
        />
      </RankHeroCard>
    </div>
  );
}

/**
 * The no-team line's action, from the shared next-action model: "Créer mon
 * équipe" only while a team can really be created, otherwise the player list,
 * so the button never leads into a closed builder. Nothing while the
 * availability probe is still answering; a failed probe keeps the create
 * link, as the builder runs its own checks.
 */
function NoTeamAction() {
  const { t } = useI18n();
  const availability = useFantasyAvailability();
  const action = fantasyNextAction({
    availability: availability.view,
    hasTeam: false,
    now: Date.now(),
  });
  if (action.kind === "pending") return null;
  if (action.kind === "explore") {
    return (
      <UiLinkButton to={action.to} size="sm" variant="soft" className="mt-3 self-start">
        <Search className="h-4 w-4" aria-hidden />
        {t("fantasy.next.explore")}
      </UiLinkButton>
    );
  }
  return (
    <UiLinkButton to="/fantasy/create" size="sm" className="mt-3 self-start">
      <UserPlus className="h-4 w-4" aria-hidden />
      {t("fantasy.rankings.create_team")}
    </UiLinkButton>
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
