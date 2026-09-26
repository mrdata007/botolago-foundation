import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import type {
  MinutesSplit,
  PlayerMatch,
  PlayerResponse,
  SeasonStats,
} from "@/backend/pepites/contracts";
import type { TranslationKey } from "@/i18n/dictionaries";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { pp, ratingBand, teamKit } from "./pepites-design";
import {
  COMPONENTS,
  componentLabel,
  formatCount,
  formatNumber,
  playerPhotoUrl,
  positionLabel,
  positionShort,
  scoreText,
} from "./pepites-format";
import {
  PepitesCard,
  PepitesComingSoon,
  PepitesErrorState,
  PepitesLoadingState,
  PepitesPreviewBanner,
} from "./PepitesParts";
import { PepitesPlayerShareButton } from "./PepitesPlayerShareButton";
import { PepitesFollowButton } from "./PepitesFollowButton";
import { PepitesShell } from "./PepitesShell";
import {
  FactsStrip,
  GoMark,
  Headshot,
  MonoLine,
  NightBand,
  PepitesShirt,
  RatingChip,
  ScoreRing,
  Seg10Bar,
} from "./PepitesVisuals";
import { ReportIssueButton } from "./ReportIssueSheet";
import {
  playerMatchesQueryOptions,
  playerQueryOptions,
  playerStatsQueryOptions,
  pointerVersion,
  usePepitesViewer,
  useVersionPointer,
} from "./use-pepites";

export type PlayerTab = "overview" | "matches" | "stats";

type LoadedPlayer = Extract<PlayerResponse, { available: true }>;
type Player = NonNullable<LoadedPlayer["player"]>;

/** Why a player has no score, from the engine's flags (architecture §4.2). */
function unrankedReason(flags: readonly string[], t: (key: TranslationKey) => string): string {
  if (flags.includes("below_minutes_floor")) return t("pepites.player.unranked_minutes");
  if (flags.includes("insufficient_data")) return t("pepites.player.unranked_data");
  return t("pepites.player.unranked_other");
}

/** The provider's detailed position, as a word; an unknown code stays as it is. */
function detailedPositionLabel(code: string, t: (key: TranslationKey) => string): string {
  switch (code) {
    case "gk":
      return t("pepites.detailed.gk");
    case "cb":
      return t("pepites.detailed.cb");
    case "lb":
      return t("pepites.detailed.lb");
    case "rb":
      return t("pepites.detailed.rb");
    case "dm":
      return t("pepites.detailed.dm");
    case "cm":
      return t("pepites.detailed.cm");
    case "am":
      return t("pepites.detailed.am");
    case "lw":
      return t("pepites.detailed.lw");
    case "rw":
      return t("pepites.detailed.rw");
    case "cf":
      return t("pepites.detailed.cf");
    default:
      return code;
  }
}

function footLabel(foot: string | null, t: (key: TranslationKey) => string): string | null {
  switch (foot) {
    case "left":
      return t("pepites.player.foot_left");
    case "right":
      return t("pepites.player.foot_right");
    case "both":
      return t("pepites.player.foot_both");
    default:
      return null;
  }
}

/** "Non renseigné", in the Figma's orange: a missing attribute says so. */
function NotSet({ short = false }: { short?: boolean }) {
  const { t } = useI18n();
  return (
    <span className="text-[color:var(--pepites-missing)]">
      {short ? t("pepites.player.not_set_short") : t("pepites.player.not_set")}
    </span>
  );
}

/**
 * `/pepites/joueur/$playerId` (Figma 03 and 04): who the player is, where he
 * stands in the current version, what makes up his score, and his last
 * matches. Missing attributes say so and can be reported.
 */
export function PepitesPlayerPage({
  playerId,
  tab,
  onTabChange,
}: {
  playerId: string;
  tab: PlayerTab;
  onTabChange: (tab: PlayerTab) => void;
}) {
  const { t } = useI18n();
  const viewer = usePepitesViewer();
  const pointerQuery = useVersionPointer(viewer);
  const pointer = pointerQuery.data;
  const version = pointerVersion(pointer);
  const player = useQuery({
    ...playerQueryOptions(viewer, version, playerId),
    enabled: pointer?.available === true && version !== null,
    placeholderData: (previous) => previous,
  });
  const playerStats = useQuery({
    ...playerStatsQueryOptions(viewer, version, playerId),
    enabled: pointer?.available === true && version !== null,
  });
  const matches = useQuery({
    ...playerMatchesQueryOptions(viewer, playerId),
    enabled: pointer?.available === true && (tab === "matches" || tab === "overview"),
  });

  if (pointerQuery.isPending || (player.isPending && pointer?.available && version !== null)) {
    return (
      <PepitesLoadingState
        onRetry={() => void (pointerQuery.isPending ? pointerQuery.refetch() : player.refetch())}
      />
    );
  }
  if (!pointer?.available) {
    return pointerQuery.isError ? (
      <PepitesErrorState onRetry={() => void pointerQuery.refetch()} />
    ) : (
      <PepitesShell>
        <PepitesComingSoon />
      </PepitesShell>
    );
  }
  const data = player.data;
  if (player.isError && !data) return <PepitesErrorState onRetry={() => void player.refetch()} />;
  if (!data?.available || !data.found || !data.player) {
    return (
      <PepitesShell>
        <PepitesCard testId="pepites-player-missing" className="mt-6 text-center">
          <p className={cn(pp.heavy, pp.ink, "text-[16px]")}>{t("pepites.player.not_found")}</p>
          <Link
            to="/pepites"
            className={cn("mt-2 inline-block text-[13px] underline", pp.ink, ui.focus)}
          >
            {t("pepites.player.back")}
          </Link>
        </PepitesCard>
      </PepitesShell>
    );
  }

  const fantasyPlayerId =
    playerStats.data?.available && playerStats.data.found ? playerStats.data.fantasyPlayerId : null;
  const stats =
    playerStats.data?.available && playerStats.data.found ? playerStats.data.stats : undefined;
  const split =
    playerStats.data?.available && playerStats.data.found ? playerStats.data.split : undefined;
  const tabs = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <PlayerTabs tab={tab} onTabChange={onTabChange} dark={tab === "matches"} />
      {tab !== "matches" && fantasyPlayerId ? (
        <Link
          to="/fantasy/transfers"
          search={{ player: fantasyPlayerId }}
          data-testid="pepites-fantasy-link"
          className={cn(
            "inline-flex min-h-[38px] items-center rounded-full px-4 text-[12px]",
            pp.energyFill,
            pp.heavy,
            pp.ink,
            ui.focus,
          )}
        >
          {t("pepites.player.fantasy_button")}
        </Link>
      ) : null}
    </div>
  );

  if (tab === "matches") {
    return (
      <PepitesShell tone="night" hero={<MatchesHeader data={data} />}>
        {data.preview ? <PepitesPreviewBanner /> : null}
        {tabs}
        <PlayerMatches
          loading={matches.isPending}
          failed={matches.isError}
          onRetry={() => void matches.refetch()}
          matches={
            matches.data?.available && matches.data.found ? (matches.data.matches ?? []) : []
          }
          seasonAverage={data.score?.ratingAvg ?? null}
        />
      </PepitesShell>
    );
  }

  return (
    <PepitesShell hero={<PlayerHero data={data} fantasyPlayerId={fantasyPlayerId} />} wide>
      {data.preview ? <PepitesPreviewBanner /> : null}
      {tabs}
      {tab === "stats" ? (
        playerStats.isError ? (
          <PepitesErrorState inline onRetry={() => void playerStats.refetch()} />
        ) : (
          <PlayerStats
            stats={stats}
            position={data.player.positionGroup}
            loading={playerStats.isPending}
          />
        )
      ) : (
        <PlayerOverview
          data={data}
          split={split}
          splitLoading={playerStats.isPending}
          matches={
            matches.data?.available && matches.data.found ? (matches.data.matches ?? []) : []
          }
        />
      )}
      <ReportIssueButton playerId={playerId} />
    </PepitesShell>
  );
}

function BackToPepites({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <Link
      to="/pepites"
      className={cn(
        "inline-flex min-h-[var(--ui-tap-min)] items-center gap-0.5 text-[13px] text-white",
        pp.heavy,
        ui.focusOnMesh,
        className,
      )}
      data-testid="pepites-back"
    >
      <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
      {t("pepites.player.back")}
    </Link>
  );
}

/** "ITTIHAD TANGER · DÉFENSEUR · 22 ANS · PIED : N.R." */
function HeroMeta({ player }: { player: Player }) {
  const { t, tr, lang } = useI18n();
  const missing = new Set(player.missing);
  const foot = footLabel(player.preferredFoot, t);
  const parts: ReactNode[] = [];
  if (player.team) parts.push(tr(player.team.name));
  if (player.positionGroup) parts.push(positionLabel(player.positionGroup, t));
  if (typeof player.age === "number") {
    parts.push(t("pepites.meta.age_long").replace("{n}", formatNumber(player.age, lang)));
  }
  parts.push(
    <>
      {t("pepites.player.foot_short")}{" "}
      {foot && !missing.has("preferred_foot") ? foot : <NotSet short />}
    </>,
  );
  return (
    <MonoLine tone="sub" className="mt-2">
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 ? " · " : null}
          {part}
        </span>
      ))}
    </MonoLine>
  );
}

function PlayerHero({
  data,
  fantasyPlayerId,
}: {
  data: LoadedPlayer;
  fantasyPlayerId: string | null | undefined;
}) {
  const { t, lang } = useI18n();
  const player = data.player!;
  const score = data.score ?? null;
  const kit = teamKit(player.team);
  const photoUrl = playerPhotoUrl(player);
  const rank = score?.rank ?? null;
  const dash = "–";
  return (
    <NightBand
      glow={kit.primary}
      ghost={rank !== null ? String(rank).padStart(2, "0") : null}
      cut={24}
      testId="pepites-player-header"
      wide
    >
      <div className="flex flex-col pb-9 md:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BackToPepites className="-ms-1" />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PepitesFollowButton playerId={player.id} playerName={player.name} />
            <Link
              to="/pepites/comparer"
              search={{ a: player.id }}
              className={cn(
                "inline-flex min-h-[38px] items-center rounded-full border border-white/20 bg-white/[0.08] px-3 text-[12px] text-white",
                pp.heavy,
                ui.focusOnMesh,
              )}
              data-testid="pepites-player-compare"
            >
              {t("pepites.compare.action")}
            </Link>
            <PepitesPlayerShareButton data={data} />
          </div>
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              loading="eager"
              decoding="async"
              className="size-[150px] rounded-[20px] object-cover"
              data-testid="pepites-player-photo"
            />
          ) : (
            <PepitesShirt player={player} number={rank} className="h-[140px] w-[150px]" />
          )}
          <div className="flex flex-col items-center gap-2 pb-2">
            <ScoreRing
              score={score?.score ?? null}
              label={t("pepites.score_name")}
              testId="pepites-player-score-value"
            />
            {rank !== null ? (
              <MonoLine tone="spring" testId="pepites-player-rank">
                {t("pepites.player.rank_line").replace("{n}", formatNumber(rank, lang))}
              </MonoLine>
            ) : null}
          </div>
        </div>
        {photoUrl && (player.photo?.credit || player.photo?.copyrightOwner) ? (
          <p
            className="mt-1 text-[11px] leading-[1.4] text-white/55"
            data-testid="pepites-photo-credit"
          >
            {t("pepites.player.photo_credit").replace(
              "{credit}",
              player.photo.credit ?? player.photo.copyrightOwner ?? "",
            )}
          </p>
        ) : null}
        <h1
          className={cn(
            pp.display,
            pp.lean,
            "mt-3 text-[28px] leading-[1.1] text-white [overflow-wrap:anywhere]",
          )}
          data-testid="pepites-player-name"
        >
          <bdi>{player.name}</bdi>
        </h1>
        <HeroMeta player={player} />
        {score ? (
          <div className="mt-3">
            <FactsStrip
              testId="pepites-player-facts"
              facts={[
                { label: t("pepites.fact.apps"), value: formatNumber(score.apps, lang) },
                { label: t("pepites.fact.starts"), value: formatNumber(score.starts, lang) },
                { label: t("pepites.fact.minutes"), value: formatCount(score.minutes, lang) },
                {
                  label: t("pepites.fact.rating"),
                  value: score.ratingAvg === null ? dash : formatNumber(score.ratingAvg, lang, 2),
                },
              ]}
            />
          </div>
        ) : null}
      </div>
      <div
        className="hidden min-h-[365px] grid-cols-[290px_minmax(0,1fr)_165px] items-center gap-8 pb-12 pt-6 md:grid"
        data-testid="pepites-desktop-player-hero"
      >
        <div className="self-stretch">
          <BackToPepites className="mb-3" />
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-[290px] w-[280px] rounded-2xl object-cover" />
          ) : (
            <PepitesShirt player={player} number={rank} className="h-[290px] w-[280px]" />
          )}
          <div className={cn("mt-1 h-1.5 w-[250px] skew-x-[-8deg]", pp.energyFill)} />
        </div>
        <div className="min-w-0 self-center">
          <GoMark />
          <MonoLine tone="spring" className="mt-5">
            #{rank ?? "–"} · {t("pepites.score_name")} · U23
          </MonoLine>
          <h1
            className={cn(
              pp.display,
              pp.lean,
              "mt-3 text-[clamp(38px,4.5vw,66px)] leading-[1.05] text-white",
            )}
            data-testid="pepites-desktop-player-name"
          >
            <bdi>{player.name}</bdi>
          </h1>
          <HeroMeta player={player} />
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <PepitesFollowButton
              playerId={player.id}
              playerName={player.name}
              testId="pepites-desktop-follow"
            />
            <Link
              to="/pepites/comparer"
              search={{ a: player.id }}
              className={cn(
                "inline-flex min-h-10 items-center rounded-full border border-white/20 px-4 text-[12px] text-white",
                pp.heavy,
                ui.focusOnMesh,
              )}
            >
              {t("pepites.compare.action")}
            </Link>
            {fantasyPlayerId ? (
              <Link
                to="/fantasy/transfers"
                search={{ player: fantasyPlayerId }}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-full border border-white/20 px-4 text-[12px] text-white",
                  pp.heavy,
                  ui.focusOnMesh,
                )}
              >
                {t("pepites.player.fantasy_button")}
              </Link>
            ) : null}
            <PepitesPlayerShareButton data={data} testId="pepites-desktop-player-share" />
          </div>
          {score ? (
            <div className="mt-5">
              <FactsStrip
                facts={[
                  {
                    label: t("pepites.fact.rating"),
                    value: score.ratingAvg === null ? dash : formatNumber(score.ratingAvg, lang, 2),
                  },
                  { label: t("pepites.fact.minutes"), value: formatCount(score.minutes, lang) },
                  { label: t("pepites.fact.apps"), value: formatNumber(score.apps, lang) },
                  { label: t("pepites.fact.starts"), value: formatNumber(score.starts, lang) },
                  {
                    label: t("pepites.table.goals_assists"),
                    value: `${formatNumber(score.goals, lang)} + ${formatNumber(score.assists, lang)}`,
                  },
                ]}
              />
            </div>
          ) : null}
        </div>
        <div className="self-start pt-6 text-center">
          <ScoreRing score={score?.score ?? null} label={t("pepites.score_name")} />
          <p className={cn(pp.heavy, "mt-5 text-[15px] text-white")}>
            {rank !== null
              ? t("pepites.player.rank_line").replace("{n}", formatNumber(rank, lang))
              : "–"}
          </p>
        </div>
      </div>
    </NightBand>
  );
}

/** The matches tab's compact header, on the night page (Figma 04). */
function MatchesHeader({ data }: { data: LoadedPlayer }) {
  const { t, tr, lang } = useI18n();
  const player = data.player!;
  const score = data.score ?? null;
  const meta = [
    player.team ? tr(player.team.shortName) : null,
    player.positionGroup ? positionShort(player.positionGroup, t) : null,
    score?.rank
      ? t("pepites.matches.rank_short").replace("{n}", formatNumber(score.rank, lang))
      : null,
    score?.score !== null && score?.score !== undefined
      ? `${t("pepites.sort.score_short")} ${scoreText(score.score, lang, "")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={cn(pp.night)}>
      <div className="mx-auto flex w-full flex-col gap-2 px-4 pt-1 md:max-w-[var(--ui-content-max)]">
        <BackToPepites className="-ms-1 self-start" />
        <div className="flex items-center gap-3">
          <Headshot player={player} size={44} missingDot={false} />
          <div className="min-w-0">
            <h1
              className={cn(pp.display, "truncate text-[20px] text-white")}
              data-testid="pepites-player-name"
            >
              <bdi>{player.name}</bdi>
            </h1>
            <MonoLine className="mt-1">
              <bdi>{meta}</bdi>
            </MonoLine>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Aperçu · Matchs, as route tabs (Figma 03/04). */
function PlayerTabs({
  tab,
  onTabChange,
  dark,
}: {
  tab: PlayerTab;
  onTabChange: (tab: PlayerTab) => void;
  dark: boolean;
}) {
  const { t } = useI18n();
  const options: Array<{ value: PlayerTab; label: string }> = [
    { value: "overview", label: t("pepites.player.tab_overview") },
    { value: "matches", label: t("pepites.player.tab_matches") },
    { value: "stats", label: t("pepites.player.tab_stats") },
  ];
  return (
    <div
      role="tablist"
      aria-label={t("pepites.player.tabs")}
      className={cn("flex gap-5 border-b", dark ? "border-white/10" : pp.line)}
    >
      {options.map((option) => {
        const active = option.value === tab;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(option.value)}
            className={cn(
              "relative min-h-[var(--ui-tap-min)] text-[14px]",
              pp.heavy,
              dark ? ui.focusOnMesh : ui.focus,
              active
                ? dark
                  ? "text-white"
                  : pp.ink
                : dark
                  ? "text-white/55"
                  : "text-[color:var(--pepites-muted)]",
            )}
          >
            {option.label}
            {active ? (
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0 -bottom-px h-[3px] rounded-full",
                  dark ? pp.energyFill : "bg-[color:var(--pepites-ink)]",
                )}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function CardHeading({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className={cn(pp.monoStrong, pp.text, "text-[12px] leading-[1.4] ltr:tracking-[0.06em]")}>
        {title}
      </h2>
      {aside ? (
        <span className={cn(pp.mono, pp.muted, "text-[11px] leading-[1.4] normal-case")}>
          {aside}
        </span>
      ) : null}
    </div>
  );
}

function PlayerOverview({
  data,
  split,
  splitLoading,
  matches,
}: {
  data: LoadedPlayer;
  split: MinutesSplit | null | undefined;
  splitLoading: boolean;
  matches: readonly PlayerMatch[];
}) {
  const { t, lang } = useI18n();
  const score = data.score ?? null;
  const player = data.player!;
  const missing = new Set(player.missing);
  const foot = footLabel(player.preferredFoot, t);
  return (
    <div
      className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-start md:gap-6"
      data-testid="pepites-desktop-player-body"
    >
      <div className="contents md:flex md:flex-col md:gap-5">
        <PepitesCard testId="pepites-player-score">
          {score && score.score !== null ? (
            <div data-testid="pepites-player-components">
              <CardHeading
                title={t("pepites.player.percentiles")}
                aside={t("pepites.player.percentiles_scope")}
              />
              <ul className="flex flex-col gap-2.5">
                {COMPONENTS.map((key) => {
                  const value = score.percentiles[key];
                  return (
                    <li
                      key={key}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_28px] items-center gap-3 md:grid-cols-[230px_minmax(0,1fr)_50px] md:py-2"
                    >
                      <span className={cn(pp.bold, pp.text, "truncate text-[12px]")}>
                        {componentLabel(key, t)}
                      </span>
                      <Seg10Bar
                        value={typeof value === "number" ? value : null}
                        className="md:h-3 md:gap-1"
                      />
                      <bdi className={cn(pp.heavy, pp.text, "text-end text-[12px] tabular-nums")}>
                        {typeof value === "number" ? formatNumber(Math.round(value), lang) : "–"}
                      </bdi>
                    </li>
                  );
                })}
              </ul>
              <p className={cn(pp.muted, "mt-3 text-[13px] leading-[1.5]")}>
                {t("pepites.player.components_hint")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1" data-testid="pepites-player-unranked">
              <p className={cn(pp.heavy, pp.ink, "text-[15px]")}>
                {t("pepites.player.unranked_title")}
              </p>
              <p className={cn(pp.muted, "text-[13px]")}>
                {score ? unrankedReason(score.flags, t) : t("pepites.player.unranked_other")}
              </p>
            </div>
          )}
        </PepitesCard>

        <DesktopRatingCard matches={matches} average={score?.ratingAvg ?? null} />
        <DesktopMatchesCard matches={matches} />

        {data.editions && data.editions.length > 0 ? (
          <PepitesCard testId="pepites-player-editions" className="order-4 md:order-none">
            <CardHeading title={t("pepites.player.editions")} />
            <ul className="flex flex-wrap gap-2">
              {data.editions.map((entry) => (
                <li key={entry.editionId}>
                  <Link
                    to="/pepites/semaine/$n"
                    params={{ n: String(entry.week) }}
                    className={cn(
                      "inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-[12px]",
                      pp.line,
                      pp.text,
                      pp.bold,
                      ui.focus,
                    )}
                  >
                    {t("pepites.player.edition_week").replace(
                      "{n}",
                      formatNumber(entry.week, lang),
                    )}
                    <bdi className={cn(pp.display, pp.ink, "text-[14px]")}>
                      #{formatNumber(entry.rank, lang)}
                    </bdi>
                  </Link>
                </li>
              ))}
            </ul>
          </PepitesCard>
        ) : null}
      </div>

      <div className="contents md:flex md:flex-col md:gap-5">
        <BreakthroughCard split={split} loading={splitLoading} />

        <PepitesCard testId="pepites-player-profile">
          <CardHeading title={t("pepites.player.profile")} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <ProfileItem label={t("pepites.player.age")}>
              {typeof player.age === "number" ? (
                <bdi>
                  {t("pepites.meta.age_long").replace("{n}", formatNumber(player.age, lang))}
                </bdi>
              ) : (
                <NotSet />
              )}
            </ProfileItem>
            <ProfileItem label={t("pepites.player.nationality")}>
              {player.nationality && !missing.has("nationality") ? player.nationality : <NotSet />}
            </ProfileItem>
            <ProfileItem label={t("pepites.player.position")}>
              {player.detailedPosition && !missing.has("detailed_position") ? (
                detailedPositionLabel(player.detailedPosition, t)
              ) : (
                <NotSet />
              )}
            </ProfileItem>
            <ProfileItem label={t("pepites.player.foot")}>
              {foot && !missing.has("preferred_foot") ? foot : <NotSet />}
            </ProfileItem>
            <ProfileItem label={t("pepites.player.height")}>
              {player.heightCm && !missing.has("height_cm") ? (
                <bdi>{`${formatNumber(player.heightCm, lang)} cm`}</bdi>
              ) : (
                <NotSet />
              )}
            </ProfileItem>
            {score ? (
              <ProfileItem label={t("pepites.player.goals_assists")}>
                <bdi>{`${formatNumber(score.goals, lang)} / ${formatNumber(score.assists, lang)}`}</bdi>
              </ProfileItem>
            ) : null}
          </dl>
        </PepitesCard>
        <PepitesCard className="hidden md:block" testId="pepites-desktop-face-to-face">
          <CardHeading title={t("pepites.compare.title")} aside={t("pepites.compare.scope")} />
          <p className={cn(pp.muted, "text-[13px]")}>{t("pepites.compare.choose_prompt")}</p>
          <Link
            to="/pepites/comparer"
            search={{ a: player.id }}
            className={cn(
              "mt-4 flex min-h-10 items-center justify-center rounded-full",
              pp.ink,
              pp.heavy,
              ui.focus,
              "bg-[#1b2a6b] text-white",
            )}
          >
            {t("pepites.compare.action")} →
          </Link>
        </PepitesCard>
      </div>
    </div>
  );
}

function DesktopRatingCard({
  matches,
  average,
}: {
  matches: readonly PlayerMatch[];
  average: number | null;
}) {
  const { t, lang } = useI18n();
  const rated = [...matches].reverse().filter((match) => match.rating !== null);
  const values = rated.map((match) => match.rating as number);
  const low = Math.min(5.5, ...values);
  const high = Math.max(8.2, ...values);
  const y = (value: number) => 118 - ((value - low) / (high - low || 1)) * 100;
  const x = (index: number) => 16 + index * (668 / Math.max(1, values.length - 1));
  return (
    <PepitesCard className="hidden md:block" testId="pepites-desktop-rating-trend">
      <CardHeading
        title={t("pepites.matches.trend_title")}
        aside={
          average === null
            ? undefined
            : t("pepites.matches.season_average").replace("{n}", formatNumber(average, lang, 2))
        }
      />
      {values.length ? (
        <svg
          viewBox="0 0 700 150"
          className="h-[200px] w-full"
          role="img"
          aria-label={t("pepites.matches.trend_title")}
          preserveAspectRatio="none"
        >
          {[6, 7, 8].map((mark) => (
            <g key={mark}>
              <line x1="16" x2="684" y1={y(mark)} y2={y(mark)} stroke="#eef0f6" />
              <text x="0" y={y(mark) + 4} fill="#8b96b4" fontSize="9">
                {formatNumber(mark, lang, 1)}
              </text>
            </g>
          ))}
          {average !== null ? (
            <line
              x1="16"
              x2="684"
              y1={y(average)}
              y2={y(average)}
              stroke="#7c6cf0"
              strokeDasharray="4 4"
            />
          ) : null}
          <polyline
            points={values.map((value, index) => `${x(index)},${y(value)}`).join(" ")}
            fill="none"
            stroke="#65d6d4"
            strokeWidth="2"
          />
          {values.map((value, index) => (
            <g key={rated[index]!.fixtureId}>
              <circle cx={x(index)} cy={y(value)} r="5" fill="#27b36b" />
              <text x={x(index)} y={y(value) - 10} textAnchor="middle" fill="#0b1330" fontSize="10">
                {formatNumber(value, lang, 1)}
              </text>
            </g>
          ))}
        </svg>
      ) : (
        <p className={cn(pp.muted, "text-[13px]")}>{t("pepites.matches.no_ratings")}</p>
      )}
    </PepitesCard>
  );
}

function DesktopMatchesCard({ matches }: { matches: readonly PlayerMatch[] }) {
  const { t, tr, lang } = useI18n();
  return (
    <PepitesCard className="hidden md:block" testId="pepites-desktop-matches">
      <CardHeading
        title={t("pepites.player.tab_matches")}
        aside={t("pepites.matches.trend_title")}
      />
      <div className="grid grid-cols-[60px_minmax(0,1fr)_80px_55px_55px_55px_50px] gap-2 border-b pb-2 text-[11px] text-[color:var(--pepites-muted)]">
        <span>{t("pepites.matches.date")}</span>
        <span>{t("pepites.matches.opponent")}</span>
        <span>{t("pepites.matches.location")}</span>
        <span>{t("pepites.matches.score")}</span>
        <span>{t("pepites.table.minutes")}</span>
        <span>{t("pepites.table.goals_assists")}</span>
        <span>{t("pepites.table.rating")}</span>
      </div>
      {matches.map((match) => (
        <div
          key={match.fixtureId}
          className="grid min-h-10 grid-cols-[60px_minmax(0,1fr)_80px_55px_55px_55px_50px] items-center gap-2 border-b text-[12px] last:border-0"
        >
          <bdi className={pp.muted}>
            {new Date(match.kickoffAt).toLocaleDateString(
              lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR",
              { day: "2-digit", month: "2-digit" },
            )}
          </bdi>
          <span className={cn(pp.bold, pp.text, "truncate")}>
            {match.opponent ? tr(match.opponent.shortName) : "–"}
          </span>
          <span className={pp.muted}>
            {match.home ? t("pepites.matches.home_long") : t("pepites.matches.away_long")}
          </span>
          <bdi>
            {match.teamScore === null || match.opponentScore === null
              ? "–"
              : `${match.teamScore}-${match.opponentScore}`}
          </bdi>
          <bdi>{formatNumber(match.minutes, lang)}′</bdi>
          <bdi>
            {match.goals || match.assists
              ? `${formatNumber(match.goals, lang)}/${formatNumber(match.assists, lang)}`
              : "–"}
          </bdi>
          <RatingChip rating={match.rating} />
        </div>
      ))}
    </PepitesCard>
  );
}

/** The run's defined halfway point, with a safe empty state before two rounds. */
function BreakthroughCard({
  split,
  loading,
}: {
  split: MinutesSplit | null | undefined;
  loading: boolean;
}) {
  const { t, lang } = useI18n();
  const usable = split && split.firstMinutes > 0;
  const maximum = usable ? Math.max(split.firstMinutes, split.secondMinutes, 1) : 1;
  return (
    <PepitesCard testId="pepites-breakthrough">
      <CardHeading
        title={t("pepites.player.breakthrough_title")}
        aside={t("pepites.player.breakthrough_subtitle")}
      />
      {loading ? (
        <div
          className="h-16 animate-pulse rounded-lg bg-[color:var(--pepites-seg-empty)]"
          aria-busy="true"
        />
      ) : usable ? (
        <div className="flex items-end gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            {(
              [
                [t("pepites.player.breakthrough_half1"), split.firstMinutes, false],
                [t("pepites.player.breakthrough_half2"), split.secondMinutes, true],
              ] as const
            ).map(([label, minutes, energy]) => (
              <div key={label}>
                <div className={cn("mb-1 flex justify-between text-[11px]", pp.bold, pp.muted)}>
                  <span>{label}</span>
                  <bdi>
                    {formatCount(minutes, lang)} {lang === "ar" ? "د" : "′"}
                  </bdi>
                </div>
                <div className="h-2.5 rounded bg-[color:var(--pepites-seg-empty)]">
                  <div
                    className={cn(
                      "h-full rounded",
                      energy ? pp.energyFill : "bg-[color:var(--pepites-muted)]",
                    )}
                    style={{ width: `${(minutes / maximum) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="text-center">
            <bdi className={cn(pp.display, pp.energyText, "text-[30px]")}>
              ×{formatNumber(split.secondMinutes / split.firstMinutes, lang, 1)}
            </bdi>
            <p className={cn(pp.monoStrong, pp.muted, "text-[10px] leading-[1.4]")}>
              {t("pepites.player.breakthrough_playing_time")}
            </p>
          </div>
        </div>
      ) : (
        <p className={cn(pp.muted, "text-[13px]")}>
          {t("pepites.player.breakthrough_unavailable")}
        </p>
      )}
    </PepitesCard>
  );
}

function PlayerStats({
  stats,
  position,
  loading,
}: {
  stats: SeasonStats | undefined;
  position: Player["positionGroup"];
  loading: boolean;
}) {
  const { t, lang } = useI18n();
  const fields: Array<{ key: keyof SeasonStats; label: string }> = [
    { key: "apps", label: t("pepites.stats.apps") },
    { key: "starts", label: t("pepites.stats.starts") },
    { key: "minutes", label: t("pepites.stats.minutes") },
    { key: "goals", label: t("pepites.stats.goals") },
    { key: "assists", label: t("pepites.stats.assists") },
    { key: "penaltiesMissed", label: t("pepites.stats.penalties_missed") },
    { key: "yellowCards", label: t("pepites.stats.yellow_cards") },
    { key: "redCards", label: t("pepites.stats.red_cards") },
    { key: "ownGoals", label: t("pepites.stats.own_goals") },
  ];
  if (position === "GK" || position === "DEF") {
    fields.push(
      { key: "cleanSheets", label: t("pepites.stats.clean_sheets") },
      { key: "goalsConceded", label: t("pepites.stats.goals_conceded") },
    );
  }
  if (position === "GK") {
    fields.push(
      { key: "saves", label: t("pepites.stats.saves") },
      { key: "penaltiesSaved", label: t("pepites.stats.penalties_saved") },
    );
  }
  return (
    <PepitesCard testId="pepites-player-stats">
      <CardHeading title={t("pepites.stats.title")} aside={t("pepites.stats.subtitle")} />
      {loading ? (
        <div
          className="h-28 animate-pulse rounded-lg bg-[color:var(--pepites-seg-empty)]"
          aria-busy="true"
        />
      ) : stats ? (
        <dl className="grid grid-cols-2 gap-x-5 gap-y-4 md:grid-cols-3">
          {fields.map(({ key, label }) => (
            <ProfileItem key={key} label={label}>
              <bdi>
                {stats[key] === null
                  ? t("pepites.stats.not_applicable")
                  : formatCount(stats[key], lang)}
              </bdi>
            </ProfileItem>
          ))}
        </dl>
      ) : (
        <p className={cn(pp.muted, "text-[13px]")}>{t("pepites.stats.not_applicable")}</p>
      )}
    </PepitesCard>
  );
}

function ProfileItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className={cn(pp.mono, pp.muted, "text-[11px] leading-[1.4] ltr:tracking-[0.04em]")}>
        {label}
      </dt>
      <dd className={cn(pp.bold, pp.text, "text-[13px]")}>{children}</dd>
    </div>
  );
}

/**
 * The rating over the last ten matches (Figma 04): the line in the energy
 * gradient, a dot per match in its rating colour, the season average dashed.
 */
function RatingTrend({
  matches,
  average,
}: {
  matches: readonly PlayerMatch[];
  average: number | null;
}) {
  const { t, lang } = useI18n();
  const rated = [...matches].reverse().filter((match) => typeof match.rating === "number");
  const width = 322;
  const height = 64;
  const pad = 6;
  const values = rated.map((match) => match.rating as number);
  const all = average !== null ? [...values, average] : values;
  const low = Math.min(...all, 6) - 0.2;
  const high = Math.max(...all, 7.5) + 0.2;
  const y = (value: number) => pad + ((high - value) / (high - low)) * (height - pad * 2);
  const x = (index: number) =>
    rated.length > 1 ? pad + (index * (width - pad * 2)) / (rated.length - 1) : width / 2;
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const dotColour = ["", "#e5484d", "#f0a020", "#9bc53d", "#22b573", "#1b9dc0"];
  return (
    <div
      className="rounded-[14px] border border-white/10 bg-white/[0.04] p-3"
      data-testid="pepites-rating-trend"
    >
      <div className="mb-2 flex items-baseline justify-between">
        <p
          className={cn(
            pp.monoStrong,
            "text-[12px] leading-[1.4] text-white ltr:tracking-[0.06em]",
          )}
        >
          {t("pepites.matches.trend_title")}
        </p>
      </div>
      {rated.length === 0 ? (
        <p className="text-[13px] leading-[1.5] text-white/60">{t("pepites.matches.no_ratings")}</p>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[70px] w-full rtl:-scale-x-100"
          role="img"
          aria-label={t("pepites.matches.trend_title")}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="pepites-trend" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#5de39b" />
              <stop offset="0.45" stopColor="#7fd6f0" />
              <stop offset="1" stopColor="#7c6cf0" />
            </linearGradient>
          </defs>
          {average !== null ? (
            <line
              x1="0"
              x2={width}
              y1={y(average)}
              y2={y(average)}
              stroke="rgb(255 255 255 / 0.2)"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          <polyline
            points={points}
            fill="none"
            stroke="url(#pepites-trend)"
            strokeWidth="2.4"
            vectorEffect="non-scaling-stroke"
          />
          {values.map((value, index) => (
            <circle
              key={index}
              cx={x(index)}
              cy={y(value)}
              r="3.25"
              fill={dotColour[ratingBand(value)]}
              stroke="#070d24"
              strokeWidth="1.5"
            />
          ))}
        </svg>
      )}
      {average !== null ? (
        <p className={cn(pp.mono, "mt-1 text-end text-[12px] leading-[1.4] text-white/60")}>
          {t("pepites.matches.season_average").replace("{n}", formatNumber(average, lang, 2))}
        </p>
      ) : null}
    </div>
  );
}

const MATCH_COLUMNS =
  "grid grid-cols-[38px_minmax(0,1fr)_30px_34px_34px_34px] items-center gap-1.5";

function PlayerMatches({
  matches,
  loading,
  failed,
  onRetry,
  seasonAverage,
}: {
  matches: readonly PlayerMatch[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  seasonAverage: number | null;
}) {
  const { t, tr, lang } = useI18n();
  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" data-testid="pepites-matches-loading">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} className="h-8 rounded-[8px] bg-white/[0.06]" />
        ))}
      </div>
    );
  }
  if (failed) return <PepitesErrorState inline onRetry={onRetry} />;
  if (matches.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-white/70">{t("pepites.player.no_matches")}</p>
    );
  }
  const head = cn(pp.monoStrong, "text-[10px] leading-[1.4] text-white/45 ltr:tracking-[0.04em]");
  return (
    <div className="flex flex-col gap-4">
      <RatingTrend matches={matches} average={seasonAverage} />
      <div>
        <div className={cn(MATCH_COLUMNS, "border-b border-white/10 pb-2")} aria-hidden>
          <span className={head}>{t("pepites.matches.date")}</span>
          <span className={head}>{t("pepites.matches.opponent")}</span>
          <span className={cn(head, "text-end")}>{t("pepites.matches.score")}</span>
          <span className={cn(head, "text-end")}>{t("pepites.table.minutes")}</span>
          <span className={cn(head, "text-end")}>{t("pepites.table.goals_assists")}</span>
          <span className={cn(head, "text-end")}>{t("pepites.table.rating")}</span>
        </div>
        <ul data-testid="pepites-player-matches">
          {matches.map((match) => {
            const score =
              match.teamScore !== null && match.opponentScore !== null
                ? `${formatNumber(match.teamScore, lang)}-${formatNumber(match.opponentScore, lang)}`
                : "–";
            const involvement = [
              match.goals > 0
                ? t("pepites.matches.goals_short").replace("{n}", formatNumber(match.goals, lang))
                : null,
              match.assists > 0
                ? t("pepites.matches.assists_short").replace(
                    "{n}",
                    formatNumber(match.assists, lang),
                  )
                : null,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li
                key={match.fixtureId}
                className={cn(MATCH_COLUMNS, "border-b border-white/10 py-2.5")}
              >
                <bdi className={cn(pp.mono, "text-[11px] leading-[1.4] text-white/55")}>
                  {matchDate(match.kickoffAt)}
                </bdi>
                <span className={cn(pp.bold, "truncate text-[12px] text-white")}>
                  {match.home ? t("pepites.matches.home_short") : t("pepites.matches.away_short")}
                  {" · "}
                  {match.opponent ? tr(match.opponent.name) : "–"}
                </span>
                <bdi dir="ltr" className={cn(pp.bold, "text-end text-[12px] text-white")}>
                  {score}
                </bdi>
                <bdi className={cn(pp.bold, "text-end text-[12px] text-white")}>
                  {`${formatNumber(match.minutes, lang)}’`}
                  {!match.started ? (
                    <span className="text-white/55"> {t("pepites.matches.sub_short")}</span>
                  ) : null}
                </bdi>
                <span
                  className={cn(
                    pp.heavy,
                    "text-end text-[12px]",
                    involvement ? pp.spring : "text-white/45",
                  )}
                >
                  {involvement || "–"}
                </span>
                <span className="flex justify-end">
                  <RatingChip rating={match.rating} />
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** "05.07": day and month in Morocco time. */
function matchDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Casablanca",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}`;
}
