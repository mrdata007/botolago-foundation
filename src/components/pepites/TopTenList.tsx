import { Link } from "@tanstack/react-router";

import type { RankingRow } from "@/backend/pepites/contracts";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle } from "@/lib/club-palette";
import { staggerStyle } from "@/lib/motion";
import { cn } from "@/lib/utils";

import {
  type ListedClub,
  playerFiguresLine,
  playerMetaLine,
  scoreText,
  teamAsClub,
  type TopTenItem,
} from "./pepites-format";
import {
  MovementMark,
  PepitesIdentityDisc,
  PepitesName,
  RankPlate,
  Seg10Bar,
} from "./PepitesVisuals";
import { useClubCatalogue } from "./use-club-catalogue";

/** Holds an empty line's height. */
const NBSP = "\u00a0";

/** What the ranking knows about a player that the edition does not carry. */
export type PlayerStats = Pick<RankingRow, "minutes" | "goals" | "assists" | "ratingAvg" | "ga90">;

/**
 * A Pépites score standing alone: the score ramp (Changa digits) in the
 * brand foreground. A player without a score prints the "unranked" word,
 * which is letters, not digits, so it takes the stat ramp the score ramp's
 * figure leading cannot cut (BG-0124).
 */
function ScoreFigure({ score, ramp }: { score: number | null; ramp: string }) {
  const { t, lang } = useI18n();
  const ranked = typeof score === "number" && Number.isFinite(score);
  return (
    <bdi className={cn(ranked ? ramp : ui.stat.md, ui.tone.ink)}>
      {scoreText(score, lang, t("pepites.unranked"))}
    </bdi>
  );
}

/**
 * A Top 10 row: an interactive card with the club's colour on the inline
 * start edge, the rank (1 to 3 on the white plate), the player's photo or
 * the club's crest, the name and last week's movement, the meta line, the
 * ten-segment score bar, and the score; the editor's line under it when
 * there is one.
 */
export function LeaderboardRow({
  item,
  stats,
  figures = true,
  listed,
}: {
  item: TopTenItem;
  stats: PlayerStats | undefined;
  /**
   * Whether the row has a figures line (minutes, goals and assists). While
   * the figures load the line holds its place with a no-break space, so the
   * row does not grow when they land. A past week prints none.
   */
  figures?: boolean;
  /** The player's club in the app's club catalogue: its crest. */
  listed?: ListedClub;
}) {
  const { t, tr, lang } = useI18n();
  const player = item.player;
  const reason = lang === "ar" ? item.reasonAr : item.reasonFr;
  const colours = clubStyle(teamAsClub(player.team));
  return (
    <Link
      to="/pepites/joueur/$playerId"
      params={{ playerId: player.id }}
      data-testid="pepites-top-entry"
      data-club={colours["data-club"]}
      style={colours.style}
      className={cn(
        ui.surface.card,
        ui.edge.start,
        ui.space.row,
        "press-tile flex flex-col gap-2 py-3 pe-3 ps-3",
        ui.focus,
      )}
    >
      <div className="flex items-center gap-3">
        <RankPlate rank={item.rank} size="md" />
        <PepitesIdentityDisc player={player} listed={listed} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            {/* Wraps (two lines at most) rather than cutting the name beside
                the movement mark. */}
            <PepitesName
              as="p"
              name={player.name}
              className={cn(
                "line-clamp-2 min-w-0 text-balance break-words",
                ui.text.bodyStrong,
                ui.tone.default,
              )}
            />
            <MovementMark movement={item.movement ?? null} />
          </div>
          <p className={cn(ui.text.meta, ui.tone.muted, "[overflow-wrap:anywhere]")}>
            {playerMetaLine(player, null, { t, tr, lang })}
          </p>
          {figures ? (
            <p className={cn("-mt-1", ui.text.meta, ui.tone.muted)}>
              {stats ? playerFiguresLine(stats, { t, lang }) : NBSP}
            </p>
          ) : null}
          <Seg10Bar value={item.score} className="mt-1" />
        </div>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <ScoreFigure score={item.score} ramp={ui.score.sm} />
          <span className={cn(ui.text.label, ui.tone.muted)}>{t("pepites.score_name")}</span>
        </span>
      </div>
      {reason ? <p className={cn("ps-12", ui.text.secondary, ui.tone.muted)}>{reason}</p> : null}
    </Link>
  );
}

/** The rows after the leader: #2 to #10 (or #1 to #10 when there is no hero). */
export function TopTenList({
  items,
  stats,
  figures = true,
  testId,
}: {
  items: readonly TopTenItem[];
  stats: ReadonlyMap<string, PlayerStats>;
  /** Rows with a figures line (`LeaderboardRow`); none on a past week. */
  figures?: boolean;
  testId?: string;
}) {
  const catalogue = useClubCatalogue();
  return (
    <ol className="flex flex-col gap-2.5" data-testid={testId} start={items[0]?.rank}>
      {items.map((item, index) => (
        <li key={item.player.id} className="enter-rise stagger" style={staggerStyle(index)}>
          <LeaderboardRow
            item={item}
            stats={stats.get(item.player.id)}
            figures={figures}
            listed={item.player.team ? catalogue.get(item.player.team.id) : undefined}
          />
        </li>
      ))}
    </ol>
  );
}
