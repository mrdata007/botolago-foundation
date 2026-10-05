import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Fragment, useId, type ReactNode } from "react";

import type {
  MinutesSplit,
  PlayerMatch,
  PlayerResponse,
  SeasonStats,
} from "@/backend/pepites/contracts";
import { SectionHeader } from "@/components/common/SectionHeader";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  ui,
  UiCard,
  UiEmptyState,
  UiLinkButton,
  UiSkeleton,
  UiStatBlock,
  UiTabs,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle } from "@/lib/club-palette";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";
import type { Language } from "@/types/domain";

import { ratingBand } from "./pepites-design";
import {
  COMPONENTS,
  componentLabel,
  formatCount,
  formatNumber,
  playerPhotoUrl,
  positionLabel,
  teamAsClub,
} from "./pepites-format";
import {
  PepitesComingSoon,
  PepitesErrorState,
  PepitesLoadingState,
  PepitesPreviewBanner,
} from "./PepitesParts";
import { PepitesPlayerShareButton } from "./PepitesPlayerShareButton";
import { PepitesFollowButton } from "./PepitesFollowButton";
import { PepitesBack, PepitesShell } from "./PepitesShell";
import {
  FillBar,
  PepitesPlayerPhoto,
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

/** The id the tab panel carries, so every tab can name it (`aria-controls`). */
const PANEL_ID = "pepites-player-panel";

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

/**
 * "Non renseigné": a missing attribute says so, in the faint text colour so
 * it reads as a gap rather than a value. It can be reported (the "Signaler"
 * button under the page).
 */
function NotSet({ short = false }: { short?: boolean }) {
  const { t } = useI18n();
  return (
    <span className={ui.tone.faint}>
      {short ? t("pepites.player.not_set_short") : t("pepites.player.not_set")}
    </span>
  );
}

/**
 * `/pepites/joueur/$playerId`, on the main kit (BG-0152): who the player is,
 * where he stands in the current version, what makes up his score, and his
 * last matches. Missing attributes say so and can be reported.
 *
 * One frame for every tab: the hero (one block for the phone and the
 * desktop), the tabs under it, then the panel. The hero and the tabs stay
 * the same element whichever tab is open, so the tab bar never moves and the
 * focused tab keeps its focus when the address changes.
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
        <UiEmptyState
          testId="pepites-player-missing"
          title={t("pepites.player.not_found")}
          action={
            <div className="mt-4 flex justify-center">
              <PepitesBack label={t("pepites.player.back")} />
            </div>
          }
        />
      </PepitesShell>
    );
  }

  const fantasyPlayerId =
    playerStats.data?.available && playerStats.data.found ? playerStats.data.fantasyPlayerId : null;
  const stats =
    playerStats.data?.available && playerStats.data.found ? playerStats.data.stats : undefined;
  const split =
    playerStats.data?.available && playerStats.data.found ? playerStats.data.split : undefined;
  const matchList =
    matches.data?.available && matches.data.found ? (matches.data.matches ?? []) : [];

  return (
    <PepitesShell width="desktop">
      <PlayerHero data={data} fantasyPlayerId={fantasyPlayerId} />
      <PlayerTabs player={data.player} tab={tab} onTabChange={onTabChange} />
      {data.preview ? <PepitesPreviewBanner /> : null}
      <div role="tabpanel" id={PANEL_ID} aria-labelledby={`pepites-player-tab-${tab}`}>
        {tab === "matches" ? (
          <PlayerMatches
            loading={matches.isPending}
            failed={matches.isError}
            onRetry={() => void matches.refetch()}
            matches={matchList}
            seasonAverage={data.score?.ratingAvg ?? null}
          />
        ) : tab === "stats" ? (
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
            matches={matchList}
            matchesLoading={matches.isPending}
          />
        )}
      </div>
      {tab !== "matches" ? <ReportIssueButton playerId={playerId} /> : null}
    </PepitesShell>
  );
}

/**
 * "Ittihad Tanger · Défenseur · 22 ans · Pied : N.R.". Each part after the
 * club keeps to one line (`whitespace-nowrap`), so the line breaks between
 * parts, never inside "Pied : N.R." or "22 ans" (a long club name may still
 * wrap); the dot holds to the part before it (a no-break space), so no line
 * opens on a "·".
 */
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
    <p className={cn(ui.text.meta, ui.tone.muted)}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? "\u00a0· " : null}
          <span className={index === 0 && player.team ? undefined : "whitespace-nowrap"}>
            {part}
          </span>
        </Fragment>
      ))}
    </p>
  );
}

/**
 * The player's hero, one block at every width. Edge to edge under the top
 * bar on a phone, as the match and club headers are, and a lifted feature
 * card from `sm`. It carries the back pill (the page has no header band),
 * the share button, the photo (or the club shirt with the rank on it), the
 * rank, the name as the page's `<h1>`, club · position · age · foot, the
 * score ring, four figures and the actions.
 *
 * One grid, placed per width (grid tracks follow the reading direction, so
 * it mirrors in Arabic). On a phone the photo sits over the ring at the
 * inline start, the name over the figures beside them; from 768px the photo,
 * the name and the ring take three columns and the figures and actions sit
 * under the name.
 */
function PlayerHero({
  data,
  fantasyPlayerId,
}: {
  data: LoadedPlayer;
  fantasyPlayerId: string | null | undefined;
}) {
  const { t, lang } = useI18n();
  const nameId = useId();
  const player = data.player!;
  const score = data.score ?? null;
  const photoUrl = playerPhotoUrl(player);
  const rank = score?.rank ?? null;
  const dash = "–";
  return (
    <UiCard
      as="section"
      padding="none"
      testId="pepites-desktop-player-hero"
      aria-labelledby={nameId}
      className={cn(
        // The screen's gutter and top padding cancelled on a phone, so the
        // block runs edge to edge under the top bar.
        "-mx-[var(--ui-gutter)] -mt-4 rounded-none px-[var(--ui-gutter)] pb-5 pt-3 shadow-none",
        "sm:mx-0 sm:mt-0 sm:rounded-[var(--ui-radius-sheet)] sm:p-5 sm:shadow-[var(--ui-shadow-lifted)] md:p-6",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <PepitesBack label={t("pepites.player.back")} />
        <PepitesPlayerShareButton data={data} />
      </div>
      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-x-6">
        <div className="col-start-1 row-start-1 md:row-span-3">
          {photoUrl ? (
            <span className="block" data-testid="pepites-player-photo">
              <PepitesPlayerPhoto player={player} size="xl" loading="eager" />
            </span>
          ) : (
            <PepitesShirt player={player} number={rank} className="h-24 w-24 md:h-30 md:w-32" />
          )}
        </div>
        <div className="col-start-2 row-start-1 flex min-w-0 flex-col gap-1">
          <p
            className={cn(ui.text.label, ui.tone.muted)}
            data-testid={rank !== null ? "pepites-player-rank" : undefined}
          >
            {rank !== null
              ? t("pepites.player.rank_line").replace("{n}", formatNumber(rank, lang))
              : t("pepites.hero.kicker_short")}
          </p>
          <h1
            id={nameId}
            className={cn(
              ui.display.section,
              "md:text-[length:var(--ui-text-hero)] lg:text-[length:var(--ui-display-hero)]",
              ui.tone.default,
              "text-balance [overflow-wrap:anywhere]",
            )}
            data-testid="pepites-player-name"
          >
            <bdi>{player.name}</bdi>
          </h1>
          <HeroMeta player={player} />
          {photoUrl && (player.photo?.credit || player.photo?.copyrightOwner) ? (
            <p className={cn(ui.text.micro, ui.tone.muted)} data-testid="pepites-photo-credit">
              {t("pepites.player.photo_credit").replace(
                "{credit}",
                player.photo.credit ?? player.photo.copyrightOwner ?? "",
              )}
            </p>
          ) : null}
        </div>
        <div className="col-start-1 row-start-2 self-center justify-self-center md:col-start-3 md:row-span-3 md:row-start-1">
          <ScoreRing
            score={score?.score ?? null}
            label={t("pepites.score_name")}
            size={96}
            testId="pepites-player-score-value"
          />
        </div>
        {score ? (
          <div
            className="col-start-2 row-start-2 grid grid-cols-2 gap-x-4 gap-y-3 self-center md:max-w-xl md:grid-cols-4"
            data-testid="pepites-player-facts"
          >
            <UiStatBlock
              size="lg"
              label={t("pepites.fact.apps")}
              value={<bdi>{formatNumber(score.apps, lang)}</bdi>}
            />
            <UiStatBlock
              size="lg"
              label={t("pepites.fact.starts")}
              value={<bdi>{formatNumber(score.starts, lang)}</bdi>}
            />
            <UiStatBlock
              size="lg"
              label={t("pepites.fact.minutes")}
              value={<bdi>{formatCount(score.minutes, lang)}</bdi>}
            />
            <UiStatBlock
              size="lg"
              label={t("pepites.fact.rating")}
              value={
                <bdi>
                  {score.ratingAvg === null ? dash : formatNumber(score.ratingAvg, lang, 2)}
                </bdi>
              }
            />
          </div>
        ) : null}
        <div className="col-span-2 row-start-3 flex flex-wrap items-center gap-2 md:col-span-1 md:col-start-2">
          <PepitesFollowButton playerId={player.id} playerName={player.name} />
          <UiLinkButton
            to="/pepites/comparer"
            search={{ a: player.id }}
            size="sm"
            variant="soft"
            data-testid="pepites-player-compare"
          >
            {t("pepites.compare.action")}
          </UiLinkButton>
          {fantasyPlayerId ? (
            <UiLinkButton
              to="/fantasy/transfers"
              search={{ player: fantasyPlayerId }}
              size="sm"
              variant="gradient"
              data-testid="pepites-fantasy-link"
            >
              {t("pepites.player.fantasy_button")}
            </UiLinkButton>
          ) : null}
        </div>
      </div>
    </UiCard>
  );
}

/**
 * Aperçu · Matchs · Stats: the kit's underline tabs, as route tabs (the
 * address carries `onglet=`). They stick under the top bar, run edge to edge
 * on a phone (flush under the hero, so the two read as one header) and sit
 * on the column from `sm`, as the match and club tabs do. The indicator is
 * the club's edge colour.
 */
function PlayerTabs({
  player,
  tab,
  onTabChange,
}: {
  player: Player;
  tab: PlayerTab;
  onTabChange: (tab: PlayerTab) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      {...clubStyle(teamAsClub(player.team))}
      className="sticky top-[var(--topbar-h)] z-20 -mx-[var(--ui-gutter)] -mt-4 min-w-0 sm:mx-0 sm:mt-0"
    >
      <UiTabs<PlayerTab>
        value={tab}
        onChange={onTabChange}
        label={t("pepites.player.tabs")}
        accent="var(--ui-club-edge)"
        idBase="pepites-player"
        options={[
          { value: "overview", label: t("pepites.player.tab_overview"), panelId: PANEL_ID },
          { value: "matches", label: t("pepites.player.tab_matches"), panelId: PANEL_ID },
          { value: "stats", label: t("pepites.player.tab_stats"), panelId: PANEL_ID },
        ]}
      />
    </div>
  );
}

/**
 * A titled block of the player page: the kit's section heading (the old
 * card's aside becomes its subtitle) over one card.
 */
function PlayerSection({
  title,
  subtitle,
  testId,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={testId} className={cn("min-w-0", className)}>
      <SectionHeader title={title} subtitle={subtitle} />
      <UiCard>{children}</UiCard>
    </section>
  );
}

function PlayerOverview({
  data,
  split,
  splitLoading,
  matches,
  matchesLoading,
}: {
  data: LoadedPlayer;
  split: MinutesSplit | null | undefined;
  splitLoading: boolean;
  matches: readonly PlayerMatch[];
  matchesLoading: boolean;
}) {
  const { t, lang } = useI18n();
  const score = data.score ?? null;
  const player = data.player!;
  const missing = new Set(player.missing);
  const foot = footLabel(player.preferredFoot, t);
  const average = score?.ratingAvg ?? null;
  return (
    // Two columns from 768px. On a phone the columns dissolve (`contents`)
    // into one stack, the desktop-only blocks drop out, and the Top 10 weeks
    // move to the end.
    <div
      className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-start md:gap-6"
      data-testid="pepites-desktop-player-body"
    >
      <div className="contents md:flex md:flex-col md:gap-6">
        <PlayerSection
          title={t("pepites.player.percentiles")}
          subtitle={
            score && score.score !== null ? t("pepites.player.percentiles_scope") : undefined
          }
          testId="pepites-player-score"
        >
          {score && score.score !== null ? (
            <div data-testid="pepites-player-components">
              <ul className="flex flex-col gap-3">
                {COMPONENTS.map((key) => {
                  const value = score.percentiles[key];
                  return (
                    <li
                      key={key}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_2.5rem] items-center gap-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_3rem]"
                    >
                      <span
                        className={cn(
                          "min-w-0",
                          ui.text.meta,
                          "[font-weight:var(--ui-weight-strong)]",
                          ui.tone.default,
                        )}
                      >
                        {componentLabel(key, t)}
                      </span>
                      <Seg10Bar
                        value={typeof value === "number" ? value : null}
                        className="md:h-3 md:gap-1"
                      />
                      <bdi className={cn("text-end", ui.stat.md, ui.tone.default)}>
                        {typeof value === "number" ? formatNumber(Math.round(value), lang) : "–"}
                      </bdi>
                    </li>
                  );
                })}
              </ul>
              <p className={cn("mt-4", ui.text.secondary, ui.tone.muted)}>
                {t("pepites.player.components_hint")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1" data-testid="pepites-player-unranked">
              <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
                {t("pepites.player.unranked_title")}
              </p>
              <p className={cn(ui.text.secondary, ui.tone.muted)}>
                {score ? unrankedReason(score.flags, t) : t("pepites.player.unranked_other")}
              </p>
            </div>
          )}
        </PlayerSection>

        <PlayerSection
          title={t("pepites.matches.trend_title")}
          subtitle={seasonAverageLine(average, t, lang)}
          testId="pepites-desktop-rating-trend"
          className="hidden md:block"
        >
          {matchesLoading ? (
            <UiSkeleton className="h-40" />
          ) : (
            <RatingTrend matches={matches} average={average} />
          )}
        </PlayerSection>

        <PlayerSection
          title={t("pepites.player.tab_matches")}
          testId="pepites-desktop-matches"
          className="hidden md:block"
        >
          {matchesLoading ? (
            <MatchListSkeleton />
          ) : matches.length === 0 ? (
            <p className={cn(ui.text.secondary, ui.tone.muted)}>{t("pepites.player.no_matches")}</p>
          ) : (
            <MatchList matches={matches} />
          )}
        </PlayerSection>

        {data.editions && data.editions.length > 0 ? (
          <PlayerSection
            title={t("pepites.player.editions")}
            testId="pepites-player-editions"
            className="order-4 md:order-none"
          >
            <ul className="flex flex-wrap gap-2">
              {data.editions.map((entry) => (
                <li key={entry.editionId}>
                  <UiLinkButton
                    to="/pepites/semaine/$n"
                    params={{ n: String(entry.week) }}
                    size="sm"
                    variant="soft"
                  >
                    {t("pepites.player.edition_week").replace(
                      "{n}",
                      formatNumber(entry.week, lang),
                    )}
                    <bdi className={ui.tone.ink}>
                      {t("pepites.matches.rank_short").replace(
                        "{n}",
                        formatNumber(entry.rank, lang),
                      )}
                    </bdi>
                  </UiLinkButton>
                </li>
              ))}
            </ul>
          </PlayerSection>
        ) : null}
      </div>

      <div className="contents md:flex md:flex-col md:gap-6">
        <BreakthroughCard split={split} loading={splitLoading} />

        <PlayerSection title={t("pepites.player.profile")} testId="pepites-player-profile">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
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
                {/* Goals then assists in the label's order: the two figures
                    are flex children in the page's direction, not one string. */}
                <span className="inline-flex items-baseline gap-1">
                  <bdi>{formatNumber(score.goals, lang)}</bdi>
                  <span aria-hidden>/</span>
                  <bdi>{formatNumber(score.assists, lang)}</bdi>
                </span>
              </ProfileItem>
            ) : null}
          </dl>
        </PlayerSection>

        <PlayerSection
          title={t("pepites.compare.title")}
          subtitle={t("pepites.compare.scope")}
          testId="pepites-desktop-face-to-face"
          className="hidden md:block"
        >
          <p className={cn(ui.text.secondary, ui.tone.muted)}>
            {t("pepites.compare.choose_prompt")}
          </p>
          <UiLinkButton
            to="/pepites/comparer"
            search={{ a: player.id }}
            variant="ink"
            className="mt-4"
          >
            {t("pepites.compare.action")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </UiLinkButton>
        </PlayerSection>
      </div>
    </div>
  );
}

/** "Moy. saison 6,85", or nothing before the first rated match. */
function seasonAverageLine(
  average: number | null,
  t: (key: TranslationKey) => string,
  lang: Language,
): string | undefined {
  if (average === null) return undefined;
  return t("pepites.matches.season_average").replace("{n}", formatNumber(average, lang, 2));
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
    <PlayerSection
      title={t("pepites.player.breakthrough_title")}
      subtitle={t("pepites.player.breakthrough_subtitle")}
      testId="pepites-breakthrough"
    >
      {loading ? (
        <div aria-busy="true">
          <UiSkeleton className="h-16" />
        </div>
      ) : usable ? (
        <div className="flex items-end gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {(
              [
                [t("pepites.player.breakthrough_half1"), split.firstMinutes, false],
                [t("pepites.player.breakthrough_half2"), split.secondMinutes, true],
              ] as const
            ).map(([label, minutes, current]) => (
              <div key={label} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn(ui.text.label, ui.tone.muted)}>{label}</span>
                  <bdi className={cn(ui.stat.sm, ui.tone.default)}>
                    {formatCount(minutes, lang)}
                    {lang === "ar" ? " د" : "′"}
                  </bdi>
                </div>
                <FillBar percent={(minutes / maximum) * 100} fill={current ? "ink" : "faint"} />
              </div>
            ))}
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1 text-center">
            <bdi className={cn(ui.score.md, ui.tone.ink)}>
              ×{formatNumber(split.secondMinutes / split.firstMinutes, lang, 1)}
            </bdi>
            <span className={cn(ui.text.label, ui.tone.muted)}>
              {t("pepites.player.breakthrough_playing_time")}
            </span>
          </div>
        </div>
      ) : (
        <p className={cn(ui.text.secondary, ui.tone.muted)}>
          {t("pepites.player.breakthrough_unavailable")}
        </p>
      )}
    </PlayerSection>
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
    <PlayerSection
      title={t("pepites.stats.title")}
      subtitle={t("pepites.stats.subtitle")}
      testId="pepites-player-stats"
    >
      {loading ? (
        <div aria-busy="true">
          <UiSkeleton className="h-28" />
        </div>
      ) : stats ? (
        <dl className="grid grid-cols-2 gap-x-5 gap-y-4 md:grid-cols-3">
          {fields.map(({ key, label }) => (
            <ProfileItem key={key} label={label} figure>
              <bdi>
                {stats[key] === null
                  ? t("pepites.stats.not_applicable")
                  : formatCount(stats[key], lang)}
              </bdi>
            </ProfileItem>
          ))}
        </dl>
      ) : (
        <p className={cn(ui.text.secondary, ui.tone.muted)}>{t("pepites.stats.not_applicable")}</p>
      )}
    </PlayerSection>
  );
}

/**
 * A label over its value: the kit's column-head label, muted, over the body
 * text (`figure`: the stat ramp, for a number read down a grid).
 */
function ProfileItem({
  label,
  figure = false,
  children,
}: {
  label: string;
  figure?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className={cn(ui.text.label, ui.tone.muted)}>{label}</dt>
      <dd className={cn(figure ? ui.stat.md : ui.text.bodyStrong, ui.tone.default)}>{children}</dd>
    </div>
  );
}

/** The rating trend's horizontal guides, on the 10-point rating scale. */
const TREND_MARKS = [6, 7, 8] as const;

/**
 * A trend dot, in px: a 7px disc of the rating colour inside a 1.5px edge of
 * the brand foreground, inside a 1.5px ring of the card colour. The edge is
 * what makes every dot visible: the light bands of the rating scale (the
 * pale greens, the neutral grey) are fills made to carry a figure, and on
 * their own they all but vanish on a white card, as the deep ones do on the
 * dark card. The colour stays a second cue; the figure is in the list.
 */
const DOT_LAYERS: ReadonlyArray<{ width: number; paint?: string }> = [
  { width: 13, paint: "var(--ui-surface)" },
  { width: 10, paint: "var(--ui-ink-fg)" },
  { width: 7 },
];

/**
 * The rating over the last ten matches: the line in the brand foreground, a
 * dot per match in its rating colour (with a ring of the card colour where
 * it crosses the line), the season average dashed in the faint text colour,
 * guides at 6, 7 and 8 on the hairline colour, their labels in the micro
 * step. The match list beside it carries every figure.
 *
 * Time runs in the reading direction: the oldest match at the inline start,
 * so the right edge in Arabic. The direction is computed here, from the
 * page's `dir`, and nothing is flipped in CSS.
 *
 * The plot is an SVG stretched to its box (`preserveAspectRatio="none"`), so
 * one drawing fits the phone card and the desktop column. Every stroke is
 * `non-scaling-stroke`, so the stretch never thickens a line, and the dots
 * are zero-length round-capped strokes, which stay round under it.
 */
function RatingTrend({
  matches,
  average,
}: {
  matches: readonly PlayerMatch[];
  average: number | null;
}) {
  const { t, tr, lang, dir } = useI18n();
  const rated = [...matches]
    .reverse()
    .filter((match): match is PlayerMatch & { rating: number } => typeof match.rating === "number");
  if (rated.length === 0) {
    return (
      <p className={cn(ui.text.secondary, ui.tone.muted)}>{t("pepites.matches.no_ratings")}</p>
    );
  }
  const values = rated.map((match) => match.rating);
  const all = average !== null ? [...values, average] : values;
  const low = Math.min(5.5, ...all);
  const high = Math.max(8.5, ...all);
  const y = (value: number) => ((high - value) / (high - low)) * 100;
  const x = (index: number) => {
    const along = rated.length > 1 ? (index * 100) / (rated.length - 1) : 50;
    return dir === "rtl" ? 100 - along : along;
  };
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const line = {
    fill: "none",
    vectorEffect: "non-scaling-stroke",
  } as const;
  return (
    <div className="flex gap-2">
      {/* The guides' labels, in a column at the inline start of the plot. */}
      <div aria-hidden className="relative w-7 shrink-0">
        {TREND_MARKS.map((mark) => (
          <span
            key={mark}
            className={cn(
              "absolute inset-x-0 -translate-y-1/2 text-end",
              ui.text.micro,
              ui.text.tabular,
              ui.tone.muted,
            )}
            style={{ top: `${y(mark)}%` }}
          >
            {formatNumber(mark, lang, 1)}
          </span>
        ))}
      </div>
      <div className="relative h-32 min-w-0 flex-1 px-1.5 md:h-40">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={t("pepites.matches.trend_title")}
        >
          {TREND_MARKS.map((mark) => (
            <line
              key={mark}
              x1="0"
              x2="100"
              y1={y(mark)}
              y2={y(mark)}
              stroke="var(--ui-rule)"
              strokeWidth={1}
              {...line}
            />
          ))}
          {average !== null ? (
            <line
              x1="0"
              x2="100"
              y1={y(average)}
              y2={y(average)}
              stroke="var(--ui-on-surface-faint)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              {...line}
            />
          ) : null}
          <polyline
            points={points}
            stroke="var(--ui-ink-fg)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            {...line}
          />
          {rated.map((match, index) => {
            const dot = `M${x(index)} ${y(match.rating)}h0`;
            return (
              <g key={match.fixtureId}>
                <title>
                  {[
                    matchDate(match.kickoffAt),
                    match.opponent ? tr(match.opponent.shortName) : null,
                    formatNumber(match.rating, lang, 1),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </title>
                {/* Three discs, widest first: the card-colour ring, the
                    brand-foreground edge, the rating colour. */}
                {DOT_LAYERS.map((layer) => (
                  <path
                    key={layer.width}
                    d={dot}
                    stroke={layer.paint ?? `var(--ui-rating-${ratingBand(match.rating)})`}
                    strokeWidth={layer.width}
                    strokeLinecap="round"
                    {...line}
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/**
 * One match row's grid. On a phone (and in the narrow desktop column up to
 * 1024px) a row is two lines: the date, the opponent over the minutes and
 * goals, the score, the rating. From 1024px it is one line of seven columns
 * under a header row. Fixed tracks, so the columns line up row to row.
 */
const MATCH_ROW =
  "grid grid-cols-[2.75rem_minmax(0,1fr)_3.5rem_2.5rem] items-center gap-x-2 gap-y-0.5 lg:grid-cols-[3.25rem_6rem_minmax(0,1fr)_3.5rem_3.25rem_4.5rem_2.75rem] lg:gap-x-3 lg:gap-y-0";

/**
 * The season's matches as one list, phone and desktop: a `<ul>` of rows
 * (`li`), each a grid placed per width. The score is three flex children in
 * the page's direction (the player's team first, at the inline start), each
 * figure its own `<bdi>`.
 */
function MatchList({ matches, testId }: { matches: readonly PlayerMatch[]; testId?: string }) {
  const { t, tr, lang } = useI18n();
  const head = cn(ui.text.label, ui.tone.muted);
  return (
    <div>
      <div aria-hidden className={cn(MATCH_ROW, "hidden pb-2 lg:grid", ui.rule.block)}>
        <span className={head}>{t("pepites.matches.date")}</span>
        <span className={head}>{t("pepites.matches.location")}</span>
        <span className={head}>{t("pepites.matches.opponent")}</span>
        <span className={cn(head, "text-end")}>{t("pepites.matches.score")}</span>
        <span className={cn(head, "text-end")}>{t("pepites.table.minutes")}</span>
        <span className={cn(head, "text-end")}>{t("pepites.table.goals_assists")}</span>
        <span className={cn(head, "text-end")}>{t("pepites.table.rating")}</span>
      </div>
      <ul data-testid={testId}>
        {matches.map((match) => {
          const involvement = [
            match.goals > 0
              ? t("pepites.matches.goals_short").replace("{n}", formatNumber(match.goals, lang))
              : null,
            match.assists > 0
              ? t("pepites.matches.assists_short").replace("{n}", formatNumber(match.assists, lang))
              : null,
          ]
            .filter(Boolean)
            .join(" ");
          const place = match.home
            ? t("pepites.matches.home_long")
            : t("pepites.matches.away_long");
          return (
            <li
              key={match.fixtureId}
              className={cn(MATCH_ROW, ui.space.row, "py-2", ui.rule.block, "last:border-b-0")}
            >
              <bdi
                className={cn(
                  "col-start-1 row-span-2 row-start-1 lg:row-span-1",
                  ui.text.meta,
                  ui.text.tabular,
                  ui.tone.muted,
                )}
              >
                {matchDate(match.kickoffAt)}
              </bdi>
              <span
                className={cn(
                  "hidden lg:col-start-2 lg:row-start-1 lg:block",
                  ui.text.meta,
                  ui.tone.muted,
                )}
              >
                {place}
              </span>
              <span
                className={cn(
                  "col-start-2 row-start-1 min-w-0 lg:col-start-3",
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-strong)]",
                  ui.tone.default,
                )}
              >
                {/* The short D / E on a phone, read out in full. */}
                <span className="lg:hidden">
                  <span aria-hidden>
                    {match.home ? t("pepites.matches.home_short") : t("pepites.matches.away_short")}
                  </span>
                  <span className="sr-only">{place}</span>
                  {" · "}
                </span>
                {match.opponent ? tr(match.opponent.name) : "–"}
              </span>
              <span className="col-start-3 row-span-2 row-start-1 justify-self-end lg:col-start-4 lg:row-span-1">
                {match.teamScore === null || match.opponentScore === null ? (
                  <span className={cn(ui.stat.md, ui.tone.muted)}>–</span>
                ) : (
                  <span className={cn("flex items-center gap-1", ui.stat.md, ui.tone.default)}>
                    <bdi>{formatNumber(match.teamScore, lang)}</bdi>
                    <span aria-hidden>–</span>
                    <bdi>{formatNumber(match.opponentScore, lang)}</bdi>
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "col-start-2 row-start-2 flex flex-wrap items-baseline gap-x-2 lg:contents",
                  ui.text.meta,
                )}
              >
                <span className="lg:col-start-5 lg:row-start-1 lg:text-end">
                  <bdi className={cn(ui.text.tabular, ui.tone.default)}>
                    {`${formatNumber(match.minutes, lang)}′`}
                  </bdi>
                  {!match.started ? (
                    <span className={ui.tone.muted}> {t("pepites.matches.sub_short")}</span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "lg:col-start-6 lg:row-start-1 lg:text-end",
                    involvement
                      ? cn("[font-weight:var(--ui-weight-heavy)]", ui.tone.positive)
                      : cn("hidden lg:block", ui.tone.faint),
                  )}
                >
                  {involvement || "–"}
                </span>
              </span>
              <span className="col-start-4 row-span-2 row-start-1 justify-self-end lg:col-start-7 lg:row-span-1">
                <RatingChip rating={match.rating} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Placeholder rows the height of the match list's. */
function MatchListSkeleton({ testId }: { testId?: string }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" data-testid={testId}>
      {Array.from({ length: 6 }, (_, index) => (
        <UiSkeleton key={index} className="h-10" />
      ))}
    </div>
  );
}

/**
 * The matches tab: the rating trend and the season's matches. One column on
 * a phone (the trend first); from 768px the list takes the wide column and
 * the trend the narrow one, as the overview splits its blocks.
 */
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
  const { t, lang } = useI18n();
  if (loading) {
    return (
      <UiCard>
        <MatchListSkeleton testId="pepites-matches-loading" />
      </UiCard>
    );
  }
  if (failed) return <PepitesErrorState inline onRetry={onRetry} />;
  if (matches.length === 0) return <UiEmptyState title={t("pepites.player.no_matches")} />;
  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-start md:gap-6">
      <PlayerSection
        title={t("pepites.matches.trend_title")}
        subtitle={seasonAverageLine(seasonAverage, t, lang)}
        testId="pepites-rating-trend"
        className="md:col-start-2 md:row-start-1"
      >
        <RatingTrend matches={matches} average={seasonAverage} />
      </PlayerSection>
      <PlayerSection
        title={t("pepites.player.tab_matches")}
        className="md:col-start-1 md:row-start-1"
      >
        <MatchList matches={matches} testId="pepites-player-matches" />
      </PlayerSection>
    </div>
  );
}

/** "05.07": day and month in Morocco time. */
function matchDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = moroccoDateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}`;
}
