import { Link } from "@tanstack/react-router";
import type { LeagueStanding } from "@/types/fantasy";
import { useI18n } from "@/i18n/provider";
import { RankChangeIndicator } from "./RankChangeIndicator";
import { selectMyRankState, type TeamPresence } from "./my-rank-state";
import { Hourglass, Target, UserPlus } from "lucide-react";

/**
 * "My rank" summary card, ported onto the Fantasy `--fpl-*` tokens: an ink
 * card with a cyan kicker, the same family as `FplStatBar`/`FplKeyValueRow`.
 *
 * The card takes team ownership (`presence`) separately from the standing on
 * purpose: a missing standing only means nobody has been ranked yet, which is
 * the normal state of every manager until the first gameweek is scored.
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

  if (state.kind === "pending") {
    return (
      <div
        data-testid="my-rank-card-pending"
        role="status"
        aria-busy="true"
        aria-label={t("state.loading")}
        className="rounded-[10px] border border-[color:var(--fpl-grey)] bg-white p-4"
      >
        <p className="text-[10px] font-black uppercase text-[color:var(--fpl-ink)] ltr:tracking-[0.14em]">
          {t("fantasy.rankings.my_rank")}
        </p>
        <div className="mt-2 h-4 w-32 max-w-full rounded-[4px] bg-[color:var(--fpl-grey)]" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="h-12 rounded-[8px] bg-[color:var(--fpl-grey)]" />
          <div className="h-12 rounded-[8px] bg-[color:var(--fpl-grey)]" />
          <div className="h-12 rounded-[8px] bg-[color:var(--fpl-grey)]" />
        </div>
      </div>
    );
  }

  if (state.kind === "no_team") {
    return (
      <div
        data-testid="my-rank-card-no-team"
        className="flex flex-col gap-3 rounded-[10px] border border-[color:var(--fpl-grey)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-black text-[color:var(--fpl-ink-deep)]">
            {t("fantasy.rankings.no_team")}
          </p>
          <p className="text-xs text-[color:var(--fpl-grey-text)]">
            {t("fantasy.rankings.no_team_desc")}
          </p>
        </div>
        <Link
          to="/fantasy/create"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[6px] px-4 text-sm font-extrabold text-[color:var(--fpl-ink)]"
          style={{ backgroundImage: "var(--fpl-grad)" }}
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          {t("fantasy.rankings.create_team")}
        </Link>
      </div>
    );
  }

  if (state.kind === "unranked") {
    return (
      <div
        data-testid="my-rank-card-unranked"
        className="rounded-[10px] border border-[color:var(--fpl-grey)] bg-white p-4"
      >
        <p className="text-[10px] font-black uppercase text-[color:var(--fpl-ink)] ltr:tracking-[0.14em]">
          {t("fantasy.rankings.my_rank")}
        </p>
        {state.teamName && (
          <p className="truncate text-sm font-bold text-[color:var(--fpl-ink-deep)]">
            <bdi>{state.teamName}</bdi>
          </p>
        )}
        <p className="mt-2 flex items-start gap-2 text-sm font-black text-[color:var(--fpl-ink-deep)]">
          <Hourglass
            className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--fpl-grey-text)]"
            aria-hidden
          />
          {t("fantasy.rankings.no_rank_yet")}
        </p>
        <p className="mt-1 text-xs text-[color:var(--fpl-grey-text)]">
          {t("fantasy.rankings.no_rank_yet_desc")}
        </p>
      </div>
    );
  }

  const ranked = state.standing;
  return (
    <div
      data-testid="my-rank-card"
      className="rounded-[10px] border border-[color:var(--fpl-grey)] bg-white p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--fpl-ink)]">
            {t("fantasy.rankings.my_rank")}
          </p>
          <p className="truncate text-sm font-bold text-[color:var(--fpl-ink-deep)]">
            {ranked.teamName}
          </p>
        </div>
        <RankChangeIndicator rank={ranked.rank} previousRank={ranked.previousRank} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={t("fantasy.overall_rank")} value={nf.format(ranked.rank)} accent />
        <Stat label={t("fantasy.total_points")} value={nf.format(ranked.totalScore)} />
        <Stat label={t("fantasy.gw_points")} value={nf.format(ranked.gameweekScore)} />
      </div>
      {onJump && (
        <button
          type="button"
          onClick={onJump}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[6px] border border-[color:var(--fpl-grey)] bg-white px-4 text-sm font-bold text-[color:var(--fpl-ink-deep)] transition-colors hover:bg-[color:var(--fpl-grey)]"
        >
          <Target className="h-4 w-4" aria-hidden />
          {t("fantasy.rankings.jump_to_me")}
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[8px] bg-[color:var(--fpl-grey)] px-2 py-2 text-center">
      <div className="text-[9px] font-black uppercase tracking-wider text-[color:var(--fpl-grey-text)]">
        {label}
      </div>
      <div
        className={
          accent
            ? "text-base font-black tabular-nums text-[color:var(--fpl-ink)]"
            : "text-base font-black tabular-nums text-[color:var(--fpl-ink-deep)]"
        }
      >
        {value}
      </div>
    </div>
  );
}
