import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import type { Movement, PepitesPlayerCard } from "@/backend/pepites/contracts";
import stadiumBand from "@/assets/brand/home-band-stadium.webp";
import stadiumBandSmall from "@/assets/brand/home-band-stadium-800.webp";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import {
  COMPONENTS,
  formatCount,
  formatNumber,
  playerMetaLine,
  playerPhotoUrl,
  scoreText,
} from "./pepites-format";
import { teamKit } from "./pepites-design";
import { MovementMark, PepitesIdentityDisc, RankPlate } from "./PepitesVisuals";
import { PercentileLegend, PercentileWheel } from "./PepitesWheel";
import { SHARE_PALETTE, shareClubColours } from "./share-image";
import type { PlayerStats } from "./TopTenList";
import { useClubCatalogue } from "./use-club-catalogue";
import { playerQueryOptions, usePepitesViewer } from "./use-pepites";

/** The band's photo `sizes`, for the reading column and for the desktop canvas. */
const PHOTO_SIZES = {
  content: "(min-width: 640px) 672px, 100vw",
  desktop: "(min-width: 1024px) 1320px, (min-width: 768px) 896px, 100vw",
} as const;

/**
 * The featured N°1 (BG-0156): the top of a Top 10 or of the ranking, on the
 * app's stadium photo band.
 *
 * The band is Home's (the floodlit crowd photograph, `home-band-stadium`,
 * 800w/1600w) on a Tunnel Navy ground under a flat navy veil, full-bleed on
 * a phone and a 16px panel from 640px, as Home and Matches put a photo band
 * right under their header. It is dark in both themes, so everything on it
 * takes the on-ink foregrounds, and the club's edge is the story card's.
 *
 * On it, as the redrawn story card sets a player (BG-0153): the club colour
 * down the inline-start edge, the rank on the white plate, the name in
 * Changa, club · position · age, last week's movement, the score on the
 * white score plate; the percentile wheel with the player's photo (or the
 * club crest) at its centre and its legend; on `/pepites` the editor's line
 * and four figures. The whole band is the link to the player.
 *
 * The wheel reads `pepites_player` for this player at the page's `version`
 * (the read and cache key of the player page, so opening the player after
 * is instant). Without a version (an earlier week, whose percentiles are not
 * today's) there is no wheel. Until the read lands the wheel shows its
 * empty track and the legend dashes, in the same box, so nothing moves.
 */
export function PepitesFeature({
  player,
  rank,
  score,
  movement,
  reason,
  facts = false,
  stats,
  version,
  width = "content",
  testId,
  scoreTestId,
}: {
  player: PepitesPlayerCard;
  rank: number | null;
  score: number | null;
  movement?: Movement;
  /** The editor's line, in the reader's language. */
  reason?: string | null;
  /**
   * Four figures under the name (`facts`); while they load the row holds
   * its place with dashes. None on the ranking, whose table prints them,
   * nor on a past week.
   */
  facts?: boolean;
  stats?: PlayerStats;
  /** The version the page shows; null for no wheel. */
  version: string | null;
  /** The column the band spans, for its photo's `sizes`. */
  width?: keyof typeof PHOTO_SIZES;
  testId?: string;
  scoreTestId?: string;
}) {
  const { t, tr, lang } = useI18n();
  const viewer = usePepitesViewer();
  const catalogue = useClubCatalogue();
  const detail = useQuery({
    ...playerQueryOptions(viewer, version, player.id),
    enabled: version !== null,
  });
  const loaded = detail.data?.available && detail.data.found ? (detail.data.score ?? null) : null;
  const percentiles = COMPONENTS.map((key) => loaded?.percentiles[key] ?? null);
  const listed = player.team ? catalogue.get(player.team.id) : undefined;
  // The club's edge as the story card paints it on the same Tunnel Navy
  // ground: the palette's dark edge, lifted toward white until it clears
  // 3:1 against the band (the dark-theme edge alone fell to 2.89:1 for seven
  // kits on the light theme's navy). No club, no edge.
  const edge = player.team
    ? shareClubColours(teamKit(player.team).primary, SHARE_PALETTE.ground).edge
    : null;
  const ranked = typeof score === "number" && Number.isFinite(score);
  const wheel = version !== null;
  const dash = "–";
  const disc = (
    <span className="block" data-testid={playerPhotoUrl(player) ? "pepites-hero-photo" : undefined}>
      <PepitesIdentityDisc player={player} listed={listed} size="lg" loading="eager" />
    </span>
  );

  return (
    <section
      data-testid={testId}
      className={cn(
        "@container relative isolate overflow-hidden",
        // Full-bleed on a phone, a rounded panel from `sm`, as Home's band.
        "-mx-[var(--ui-gutter)] sm:mx-0 sm:rounded-[var(--ui-radius-sheet)]",
        ui.tone.onInkPlain,
        "bg-[color:var(--ui-ink-deep)]",
      )}
    >
      {/* The stands under floodlights. Decorative; in the first screen, so
          fetched eagerly. Not mirrored in Arabic: the veil is flat and the
          band's content covers it edge to edge. */}
      <img
        src={stadiumBand}
        srcSet={`${stadiumBandSmall} 800w, ${stadiumBand} 1600w`}
        sizes={PHOTO_SIZES[width]}
        alt=""
        aria-hidden
        decoding="async"
        fetchPriority="high"
        className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_62%]"
      />
      {/* A flat navy veil, not a gradient: text sits from the top of the
          band to its foot, so every point needs the same cover. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[color:color-mix(in_oklab,var(--ui-ink-deep)_80%,transparent)]"
      />
      {edge ? (
        <span
          aria-hidden
          className="absolute inset-y-0 start-0 w-1"
          style={{ backgroundColor: edge }}
        />
      ) : null}
      <Link
        to="/pepites/joueur/$playerId"
        params={{ playerId: player.id }}
        data-testid="pepites-top-entry"
        className={cn(
          "press-tile grid gap-4 px-[var(--ui-gutter)] pb-5 pt-5 sm:px-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] @3xl:gap-x-8",
          ui.focusOnMesh,
          "focus-visible:ring-inset focus-visible:ring-offset-0",
        )}
      >
        <div className="flex items-start gap-3 @3xl:col-start-1">
          <RankPlate rank={rank} size="lg" onBand />
          {/* Without a wheel the disc joins the header. */}
          {wheel ? null : disc}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p
              className={cn(
                ui.display.section,
                ui.tone.onInkPlain,
                "text-balance [overflow-wrap:anywhere]",
              )}
            >
              <bdi>{player.name}</bdi>
            </p>
            <p className={cn(ui.text.meta, ui.tone.onInkMuted)}>
              {playerMetaLine(player, null, { t, tr, lang, long: true })}
            </p>
            {movement ? <MovementMark movement={movement} onBand /> : null}
          </div>
          <span className="flex shrink-0 flex-col items-center gap-1">
            <span
              data-testid={scoreTestId}
              className={cn(
                "inline-flex h-14 min-w-16 items-center justify-center px-2",
                ui.radius.card,
                ui.surface.scorebox,
                ui.shadow.lifted,
              )}
            >
              {/* The "unranked" word is letters: the stat ramp, not the
                  digits-only score ramp (BG-0124). */}
              <bdi className={ranked ? ui.score.md : ui.stat.md}>
                {scoreText(score, lang, t("pepites.unranked"))}
              </bdi>
            </span>
            <span className={cn(ui.text.label, ui.tone.onInkMuted)}>{t("pepites.score_name")}</span>
          </span>
        </div>
        {wheel ? (
          // On a phone under the header; from a 768px band, the second
          // column, beside the header, the line and the figures.
          <div className="flex min-w-0 items-center gap-4 @3xl:col-start-2 @3xl:row-span-3 @3xl:row-start-1 @3xl:self-center">
            <PercentileWheel percentiles={percentiles} className="size-33 @sm:size-40">
              {disc}
            </PercentileWheel>
            <PercentileLegend percentiles={percentiles} className="flex-1" />
          </div>
        ) : null}
        {reason ? (
          <p className={cn("@3xl:col-start-1", ui.text.secondary, ui.tone.onInkMuted)}>
            «&nbsp;{reason}&nbsp;»
          </p>
        ) : null}
        {facts ? (
          <dl
            data-testid="pepites-hero-facts"
            className="grid grid-cols-4 gap-2 border-t border-[color:var(--ui-mesh-rule)] pt-3 @3xl:col-start-1"
          >
            <BandFact
              label={t("pepites.fact.goals")}
              value={stats ? formatNumber(stats.goals, lang) : dash}
            />
            <BandFact
              label={t("pepites.fact.minutes")}
              value={stats ? formatCount(stats.minutes, lang) : dash}
            />
            <BandFact
              label={t("pepites.fact.rating")}
              value={
                stats && stats.ratingAvg !== null ? formatNumber(stats.ratingAvg, lang, 2) : dash
              }
            />
            <BandFact
              label={t("pepites.fact.ga90")}
              value={stats && stats.ga90 !== null ? formatNumber(stats.ga90, lang, 2) : dash}
            />
          </dl>
        ) : null}
      </Link>
    </section>
  );
}

/** A figure on the band: its label over it, centred, in the on-ink foregrounds. */
function BandFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
      <dt className={cn("max-w-full text-balance", ui.text.label, ui.tone.onInkMuted)}>{label}</dt>
      {/* Full width, so the box does not move when a dash becomes a figure. */}
      <dd className={cn("w-full", ui.stat.md, ui.tone.onInkPlain)}>
        <bdi>{value}</bdi>
      </dd>
    </div>
  );
}
