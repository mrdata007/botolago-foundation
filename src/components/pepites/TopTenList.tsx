import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { Movement, RankingRow } from "@/backend/pepites/contracts";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { pp, teamKit } from "./pepites-design";
import {
  formatCount,
  formatNumber,
  playerMetaLine,
  playerPhotoUrl,
  scoreText,
  type TopTenItem,
} from "./pepites-format";
import {
  EnergyStreak,
  FactsStrip,
  Headshot,
  MonoLine,
  NightBand,
  PepitesShirt,
  Seg10Bar,
} from "./PepitesVisuals";

/** What the ranking knows about a player that the edition does not carry. */
export type PlayerStats = Pick<RankingRow, "minutes" | "goals" | "assists" | "ratingAvg" | "ga90">;

function movementLabel(movement: NonNullable<Movement>, t: (key: TranslationKey) => string) {
  switch (movement.kind) {
    case "new":
      return t("pepites.movement.new");
    case "up":
      return t("pepites.movement.up");
    case "down":
      return t("pepites.movement.down");
    case "same":
      return t("pepites.movement.same");
  }
}

/** Last week's arrow, small: ▲2, ▼1, =, NEW. */
export function MovementMark({ movement, onNight }: { movement: Movement; onNight?: boolean }) {
  const { t, lang } = useI18n();
  if (!movement) return null;
  const label = movementLabel(movement, t);
  const text =
    movement.kind === "new"
      ? t("pepites.movement.new_short")
      : movement.kind === "same"
        ? "="
        : `${movement.kind === "up" ? "▲" : "▼"}${formatNumber(movement.by ?? 1, lang)}`;
  return (
    <span
      title={label}
      data-testid="pepites-movement"
      className={cn(
        "inline-flex items-center text-[9px] leading-none",
        pp.monoStrong,
        movement.kind === "up" || movement.kind === "new"
          ? onNight
            ? pp.spring
            : "text-[color:var(--ui-positive)]"
          : movement.kind === "down"
            ? "text-[color:var(--ui-negative)]"
            : onNight
              ? pp.onNightMeta
              : pp.muted,
      )}
    >
      <span aria-hidden>
        <bdi>{text}</bdi>
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The number one, on the night band (Figma 01): the score in the energy
 * gradient, the name leaning forward, club · position · age, the photo or
 * the club shirt with the rank on it, and four figures.
 */
export function TopTenHero({
  item,
  stats,
  kicker,
  title,
  titleId,
  action,
}: {
  item: TopTenItem;
  stats: PlayerStats | undefined;
  kicker: string;
  title: ReactNode;
  titleId: string;
  action?: ReactNode;
}) {
  const { t, tr, lang } = useI18n();
  const player = item.player;
  const kit = teamKit(player.team);
  const photoUrl = playerPhotoUrl(player);
  const reason = lang === "ar" ? item.reasonAr : item.reasonFr;
  const dash = "–";
  return (
    <NightBand
      glow={kit.primary}
      ghost={String(item.rank).padStart(2, "0")}
      cut={32}
      testId="pepites-hero"
    >
      <div className="flex flex-col pb-14 pt-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <MonoLine>{kicker}</MonoLine>
            <h2
              id={titleId}
              data-testid="pepites-edition-title"
              className={cn(
                pp.monoStrong,
                "text-[11px] leading-[1.4] text-white ltr:tracking-[0.06em]",
              )}
            >
              {title}
            </h2>
          </div>
          {action}
        </div>
        <Link
          to="/pepites/joueur/$playerId"
          params={{ playerId: player.id }}
          data-testid="pepites-top-entry"
          className="mt-4 flex flex-col gap-3 rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <div className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-2">
                <MonoLine tone="spring">
                  {t("pepites.hero.rank_line").replace("{n}", formatNumber(item.rank, lang))}
                </MonoLine>
                <MovementMark movement={item.movement ?? null} onNight />
              </div>
              <span
                dir="ltr"
                className={cn(
                  pp.display,
                  pp.lean,
                  pp.energyText,
                  "mt-1 self-start pe-2 text-[78px] leading-[0.95]",
                )}
                data-testid="pepites-hero-score"
              >
                {scoreText(item.score, lang, t("pepites.unranked"))}
              </span>
              <p
                className={cn(
                  pp.display,
                  pp.lean,
                  "mt-1 text-[26px] leading-[1.1] text-white [overflow-wrap:anywhere]",
                )}
              >
                <bdi>{player.name}</bdi>
              </p>
              <MonoLine tone="sub" className="mt-2">
                {playerMetaLine(player, null, { t, tr, lang, long: true })}
              </MonoLine>
            </div>
            <div className="-mb-1 shrink-0">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt=""
                  loading="eager"
                  decoding="async"
                  className="size-[120px] rounded-[20px] object-cover shadow-[0_10px_16px_rgb(0_0_0/0.45)]"
                  data-testid="pepites-hero-photo"
                />
              ) : (
                <PepitesShirt player={player} number={item.rank} />
              )}
            </div>
          </div>
          {reason ? (
            <p className="text-[13px] leading-[1.5] text-[color:var(--pepites-on-night-sub)]">
              «&nbsp;{reason}&nbsp;»
            </p>
          ) : null}
          {stats ? (
            <FactsStrip
              testId="pepites-hero-facts"
              facts={[
                {
                  label: t("pepites.fact.goals"),
                  value: formatNumber(stats.goals, lang),
                },
                {
                  label: t("pepites.fact.minutes"),
                  value: formatCount(stats.minutes, lang),
                },
                {
                  label: t("pepites.fact.rating"),
                  value: stats.ratingAvg !== null ? formatNumber(stats.ratingAvg, lang, 2) : dash,
                },
                {
                  label: t("pepites.fact.ga90"),
                  value: stats.ga90 !== null ? formatNumber(stats.ga90, lang, 2) : dash,
                },
              ]}
            />
          ) : null}
        </Link>
        <div className="mt-4">
          <EnergyStreak />
        </div>
      </div>
    </NightBand>
  );
}

/**
 * LeaderboardRow (Figma 4:48): the club's colour on the edge, the rank, the
 * headshot, the name, the mono meta line, the ten-segment score bar and the
 * score; the editor's line under it when there is one.
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
  const kit = teamKit(player.team);
  const reason = lang === "ar" ? item.reasonAr : item.reasonFr;
  return (
    <Link
      to="/pepites/joueur/$playerId"
      params={{ playerId: player.id }}
      data-testid="pepites-top-entry"
      className={cn(
        "relative flex flex-col gap-2 overflow-hidden rounded-[14px] py-[9px] pe-3 ps-4",
        pp.row,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--pepites-violet)]",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 start-0 w-1"
        style={{ backgroundColor: kit.primary }}
      />
      <div className="flex items-center gap-2.5">
        <span className="flex w-[22px] shrink-0 flex-col items-center gap-0.5">
          <bdi className={cn(pp.display, pp.ink, "text-[20px]")} aria-label={`#${item.rank}`}>
            {formatNumber(item.rank, lang)}
          </bdi>
          <MovementMark movement={item.movement ?? null} />
        </span>
        <Headshot player={player} size={36} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className={cn(pp.heavy, pp.text, "truncate text-[13px] leading-tight")}>
            <bdi>{player.name}</bdi>
          </p>
          <p
            className={cn(pp.mono, pp.muted, "text-[11px] leading-[1.4] [overflow-wrap:anywhere]")}
          >
            {playerMetaLine(player, stats, { t, tr, lang })}
          </p>
          <Seg10Bar value={item.score} />
        </div>
        <span className="flex shrink-0 flex-col items-end gap-px">
          <bdi className={cn(pp.display, pp.ink, "text-[22px]")}>
            {scoreText(item.score, lang, t("pepites.unranked"))}
          </bdi>
          <span
            className={cn(
              pp.monoStrong,
              pp.muted,
              "text-[10px] leading-[1.4] ltr:tracking-[0.04em]",
            )}
          >
            {t("pepites.score_name")}
          </span>
        </span>
      </div>
      {reason ? <p className={cn(pp.muted, "ps-8 text-[13px] leading-[1.5]")}>{reason}</p> : null}
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
    <ol className="flex flex-col gap-2" data-testid={testId} start={items[0]?.rank}>
      {items.map((item) => (
        <li key={item.player.id}>
          <LeaderboardRow item={item} stats={stats.get(item.player.id)} />
        </li>
      ))}
    </ol>
  );
}
