import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import type { PlayerMatch, PlayerResponse } from "@/backend/pepites/contracts";
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
import { PepitesShell } from "./PepitesShell";
import {
  FactsStrip,
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
  pointerVersion,
  usePepitesViewer,
  useVersionPointer,
} from "./use-pepites";

export type PlayerTab = "overview" | "matches";

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
  const matches = useQuery({
    ...playerMatchesQueryOptions(viewer, playerId),
    enabled: pointer?.available === true && tab === "matches",
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
            to="/pepites/classement"
            className={cn("mt-2 inline-block text-[13px] underline", pp.ink, ui.focus)}
          >
            {t("pepites.player.back")}
          </Link>
        </PepitesCard>
      </PepitesShell>
    );
  }

  const tabs = <PlayerTabs tab={tab} onTabChange={onTabChange} dark={tab === "matches"} />;

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
    <PepitesShell hero={<PlayerHero data={data} />}>
      {data.preview ? <PepitesPreviewBanner /> : null}
      {tabs}
      <PlayerOverview data={data} />
      <ReportIssueButton playerId={playerId} />
    </PepitesShell>
  );
}

function BackToRanking({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <Link
      to="/pepites/classement"
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

function PlayerHero({ data }: { data: LoadedPlayer }) {
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
    >
      <div className="flex flex-col pb-9">
        <div className="flex items-center justify-between gap-3">
          <BackToRanking className="-ms-1" />
          <PepitesPlayerShareButton data={data} />
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
          <p className="mt-1 text-[10px] text-white/55" data-testid="pepites-photo-credit">
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
        <BackToRanking className="-ms-1 self-start" />
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
      <h2 className={cn(pp.monoStrong, pp.text, "text-[10px] ltr:tracking-[0.12em]")}>{title}</h2>
      {aside ? (
        <span className={cn(pp.mono, pp.muted, "text-[9px] normal-case")}>{aside}</span>
      ) : null}
    </div>
  );
}

function PlayerOverview({ data }: { data: LoadedPlayer }) {
  const { t, lang } = useI18n();
  const score = data.score ?? null;
  const player = data.player!;
  const missing = new Set(player.missing);
  const foot = footLabel(player.preferredFoot, t);
  return (
    <>
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
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_28px] items-center gap-3"
                  >
                    <span className={cn(pp.bold, pp.text, "truncate text-[12px]")}>
                      {componentLabel(key, t)}
                    </span>
                    <Seg10Bar value={typeof value === "number" ? value : null} />
                    <bdi className={cn(pp.heavy, pp.text, "text-end text-[12px] tabular-nums")}>
                      {typeof value === "number" ? formatNumber(Math.round(value), lang) : "–"}
                    </bdi>
                  </li>
                );
              })}
            </ul>
            <p className={cn(pp.muted, "mt-3 text-[11px] leading-[1.4]")}>
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

      <PepitesCard testId="pepites-player-profile">
        <CardHeading title={t("pepites.player.profile")} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <ProfileItem label={t("pepites.player.age")}>
            {typeof player.age === "number" ? (
              <bdi>{t("pepites.meta.age_long").replace("{n}", formatNumber(player.age, lang))}</bdi>
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

      {data.editions && data.editions.length > 0 ? (
        <PepitesCard testId="pepites-player-editions">
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
                  {t("pepites.player.edition_week").replace("{n}", formatNumber(entry.week, lang))}
                  <bdi className={cn(pp.display, pp.ink, "text-[14px]")}>
                    #{formatNumber(entry.rank, lang)}
                  </bdi>
                </Link>
              </li>
            ))}
          </ul>
        </PepitesCard>
      ) : null}
    </>
  );
}

function ProfileItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className={cn(pp.mono, pp.muted, "text-[9px] ltr:tracking-[0.08em]")}>{label}</dt>
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
        <p className={cn(pp.monoStrong, "text-[9px] text-white ltr:tracking-[0.1em]")}>
          {t("pepites.matches.trend_title")}
        </p>
      </div>
      {rated.length === 0 ? (
        <p className="text-[12px] text-white/60">{t("pepites.matches.no_ratings")}</p>
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
        <p className={cn(pp.mono, "mt-1 text-end text-[8px] text-white/60")}>
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
  const head = cn(pp.monoStrong, "text-[8px] text-white/45 ltr:tracking-[0.08em]");
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
                <bdi className={cn(pp.mono, "text-[10px] text-white/55")}>
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
                    "text-end text-[11px]",
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
