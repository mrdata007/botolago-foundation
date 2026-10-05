import { Link } from "@tanstack/react-router";

import type { RankingRow } from "@/backend/pepites/contracts";
import { ui, UiStatBlock } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle } from "@/lib/club-palette";
import { staggerStyle } from "@/lib/motion";
import { cn } from "@/lib/utils";

import {
  formatCount,
  formatNumber,
  playerMetaLine,
  playerPhotoUrl,
  scoreText,
  teamAsClub,
  type TopTenItem,
} from "./pepites-format";
import {
  MovementMark,
  PepitesName,
  PepitesPlayerPhoto,
  PepitesShirt,
  Seg10Bar,
} from "./PepitesVisuals";

/** What the ranking knows about a player that the edition does not carry. */
export type PlayerStats = Pick<RankingRow, "minutes" | "goals" | "assists" | "ratingAvg" | "ga90">;

/**
 * A Pépites score standing alone: the score ramp (Changa digits) in the
 * brand foreground. A player without a score prints the "unranked" word,
 * which is letters, not digits, so it takes the stat ramp the score ramp's
 * figure leading cannot cut (BG-0124).
 */
function ScoreFigure({
  score,
  ramp,
  testId,
}: {
  score: number | null;
  ramp: string;
  testId?: string;
}) {
  const { t, lang } = useI18n();
  const ranked = typeof score === "number" && Number.isFinite(score);
  return (
    <bdi data-testid={testId} className={cn(ranked ? ramp : ui.stat.md, ui.tone.ink)}>
      {scoreText(score, lang, t("pepites.unranked"))}
    </bdi>
  );
}

/**
 * The number one, as the page's feature card: the club's edge at the inline
 * start, the rank and last week's movement, the score in the score ramp, the
 * name, club · position · age, the photo (or the club shirt with the rank on
 * it), the editor's line, and four figures. The whole card is the link to
 * the player.
 */
export function TopTenHero({ item, stats }: { item: TopTenItem; stats: PlayerStats | undefined }) {
  const { t, tr, lang } = useI18n();
  const player = item.player;
  const photoUrl = playerPhotoUrl(player);
  const reason = lang === "ar" ? item.reasonAr : item.reasonFr;
  const dash = "–";
  const colours = clubStyle(teamAsClub(player.team));
  return (
    <div data-testid="pepites-hero">
      <Link
        to="/pepites/joueur/$playerId"
        params={{ playerId: player.id }}
        data-testid="pepites-top-entry"
        data-club={colours["data-club"]}
        style={colours.style}
        className={cn(
          ui.surface.card,
          ui.radius.sheet,
          ui.shadow.lifted,
          ui.edge.start,
          "press-tile flex flex-col gap-4 p-4 md:p-5",
          ui.focus,
        )}
      >
        <div className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(ui.text.label, ui.tone.muted)}>
                {t("pepites.hero.rank_line").replace("{n}", formatNumber(item.rank, lang))}
              </span>
              <MovementMark movement={item.movement ?? null} />
            </div>
            <ScoreFigure score={item.score} ramp={ui.score.hero} testId="pepites-hero-score" />
            <p className={cn(ui.display.section, ui.tone.default, "[overflow-wrap:anywhere]")}>
              <bdi>{player.name}</bdi>
            </p>
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {playerMetaLine(player, null, { t, tr, lang, long: true })}
            </p>
          </div>
          <div className="shrink-0">
            {photoUrl ? (
              <span className="block" data-testid="pepites-hero-photo">
                <PepitesPlayerPhoto player={player} size="xl" loading="eager" />
              </span>
            ) : (
              <PepitesShirt
                player={player}
                number={item.rank}
                className="h-24 w-24 md:h-30 md:w-32"
              />
            )}
          </div>
        </div>
        {reason ? (
          <p className={cn(ui.text.secondary, ui.tone.muted)}>«&nbsp;{reason}&nbsp;»</p>
        ) : null}
        {stats ? (
          <div
            data-testid="pepites-hero-facts"
            className={cn("grid grid-cols-4 gap-2 pt-3", ui.rule.blockStart)}
          >
            <UiStatBlock
              size="sm"
              align="center"
              label={t("pepites.fact.goals")}
              value={<bdi>{formatNumber(stats.goals, lang)}</bdi>}
            />
            <UiStatBlock
              size="sm"
              align="center"
              label={t("pepites.fact.minutes")}
              value={<bdi>{formatCount(stats.minutes, lang)}</bdi>}
            />
            <UiStatBlock
              size="sm"
              align="center"
              label={t("pepites.fact.rating")}
              value={
                <bdi>
                  {stats.ratingAvg !== null ? formatNumber(stats.ratingAvg, lang, 2) : dash}
                </bdi>
              }
            />
            <UiStatBlock
              size="sm"
              align="center"
              label={t("pepites.fact.ga90")}
              value={<bdi>{stats.ga90 !== null ? formatNumber(stats.ga90, lang, 2) : dash}</bdi>}
            />
          </div>
        ) : null}
      </Link>
    </div>
  );
}

/**
 * A Top 10 row: an interactive card with the club's colour on the inline
 * start edge, the rank, the photo, the name and last week's movement, the
 * meta line, the ten-segment score bar, and the score; the editor's line
 * under it when there is one.
 */
export function LeaderboardRow({
  item,
  stats,
}: {
  item: TopTenItem;
  stats: PlayerStats | undefined;
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
        <bdi className={cn("w-7 shrink-0 text-center", ui.score.row, ui.tone.ink)}>
          {formatNumber(item.rank, lang)}
        </bdi>
        <PepitesPlayerPhoto player={player} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <PepitesName
              as="p"
              name={player.name}
              className={cn("min-w-0 truncate", ui.text.bodyStrong, ui.tone.default)}
            />
            <MovementMark movement={item.movement ?? null} />
          </div>
          <p className={cn(ui.text.meta, ui.tone.muted, "[overflow-wrap:anywhere]")}>
            {playerMetaLine(player, stats, { t, tr, lang })}
          </p>
          <Seg10Bar value={item.score} className="mt-1" />
        </div>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <ScoreFigure score={item.score} ramp={ui.score.sm} />
          <span className={cn(ui.text.label, ui.tone.muted)}>{t("pepites.score_name")}</span>
        </span>
      </div>
      {reason ? <p className={cn("ps-10", ui.text.secondary, ui.tone.muted)}>{reason}</p> : null}
    </Link>
  );
}

/** The rows after the leader: #2 to #10 (or #1 to #10 when there is no hero). */
export function TopTenList({
  items,
  stats,
  testId,
}: {
  items: readonly TopTenItem[];
  stats: ReadonlyMap<string, PlayerStats>;
  testId?: string;
}) {
  return (
    <ol className="flex flex-col gap-2.5" data-testid={testId} start={items[0]?.rank}>
      {items.map((item, index) => (
        <li key={item.player.id} className="enter-rise stagger" style={staggerStyle(index)}>
          <LeaderboardRow item={item} stats={stats.get(item.player.id)} />
        </li>
      ))}
    </ol>
  );
}
