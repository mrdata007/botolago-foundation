import { Link } from "@tanstack/react-router";
import type { LeagueStanding } from "@/types/fantasy";
import { useI18n } from "@/i18n/provider";
import { RankChangeIndicator } from "./RankChangeIndicator";
import { Target, UserPlus } from "lucide-react";

/**
 * "My rank" summary card, ported onto the Fantasy `--fpl-*` tokens: an ink
 * card with a cyan kicker, the same family as `FplStatBar`/`FplKeyValueRow`.
 */
export function MyRankCard({
  standing,
  onJump,
}: {
  standing?: LeagueStanding;
  onJump?: () => void;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");

  if (!standing) {
    return (
      <div className="flex flex-col gap-3 rounded-[10px] border border-[color:var(--fpl-grey)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
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

  return (
    <div className="rounded-[10px] border border-[color:var(--fpl-grey)] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--fpl-ink)]">
            {t("fantasy.rankings.my_rank")}
          </p>
          <p className="truncate text-sm font-bold text-[color:var(--fpl-ink-deep)]">
            {standing.teamName}
          </p>
        </div>
        <RankChangeIndicator rank={standing.rank} previousRank={standing.previousRank} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={t("fantasy.overall_rank")} value={nf.format(standing.rank)} accent />
        <Stat label={t("fantasy.total_points")} value={nf.format(standing.totalScore)} />
        <Stat label={t("fantasy.gw_points")} value={nf.format(standing.gameweekScore)} />
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
