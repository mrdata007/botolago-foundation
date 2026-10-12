import { Link } from "@tanstack/react-router";
import type { CSSProperties, JSX } from "react";

import { CODE_CLASS, DASH, Figure, PersonName, ProvisionalBadge } from "@/components/curva/figures";
import { useCardCopy, useCurvaCopy } from "@/components/manager-card/copy";
import { TierWord } from "@/components/manager-card/tier-word";
import { STAT_CODES } from "@/components/manager-card/types";
import {
  ui,
  UiCard,
  UiChip,
  UiEmptyState,
  UiErrorState,
  UiSegmented,
  UiSkeleton,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { useRankingCopy } from "./ranking-copy";
import { STAT_TOTAL, type Ranking, type RankingEntry } from "./ranking";
import "./ranking-motion.css";

export type RankingScopeName = "league" | "all";
export type RankingStatus = "loading" | "error" | "off" | "no_league" | "ready";

export interface RankingViewProps {
  scope: RankingScopeName;
  onScope: (scope: RankingScopeName) => void;
  leagues: ReadonlyArray<{ id: string; name: string }>;
  leagueId: string | null;
  onLeague: (id: string) => void;
  ranking: Ranking;
  status: RankingStatus;
  /** The card read failed after the list of teams loaded. */
  cardsError?: boolean;
  /** How many managers « Tous » ranks at most. */
  limit: number;
  onRetry: () => void;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * The ranking, as a presentational block: the view control, the league chips, then the rated
 * managers (rank, name, club, tier, OVR, the four statistics) and, after them, the unrated ones
 * unnumbered with how far along they are. Everything it needs comes in as props, so the page, the
 * server-render tests and the development sample draw the same thing.
 */
export function RankingView(props: RankingViewProps): JSX.Element {
  const copy = useRankingCopy();
  const { scope, status } = props;
  return (
    <div
      className={cn("flex flex-col gap-4 pb-4 pt-4", ui.space.gutter)}
      data-testid="curva-ranking"
      data-scope={scope}
    >
      <UiSegmented<RankingScopeName>
        value={scope}
        onChange={props.onScope}
        label={copy.viewLabel}
        options={[
          { value: "league", label: copy.viewLeague },
          { value: "all", label: copy.viewAll },
        ]}
      />
      {scope === "league" && props.leagues.length > 1 ? (
        <div role="group" aria-label={copy.leaguesLabel} className="flex flex-wrap gap-2">
          {props.leagues.map((league) => (
            <UiChip
              key={league.id}
              selected={league.id === props.leagueId}
              onClick={() => props.onLeague(league.id)}
              className="max-w-full"
            >
              <span className="truncate">
                <PersonName>{league.name}</PersonName>
              </span>
            </UiChip>
          ))}
        </div>
      ) : null}
      {scope === "all" && status === "ready" ? (
        <p
          className={cn("text-pretty", ui.text.meta, ui.tone.muted)}
          data-testid="ranking-all-note"
        >
          {copy.allNote(props.limit)}
        </p>
      ) : null}
      <Body {...props} />
    </div>
  );
}

function Body(props: RankingViewProps): JSX.Element {
  const copy = useRankingCopy();
  const { ranking, status, scope } = props;
  if (status === "loading") {
    return (
      <UiCard padding="none" className="overflow-hidden" testId="curva-ranking-loading">
        <div role="status" aria-hidden className="space-y-px">
          {[0, 1, 2, 3, 4].map((index) => (
            <UiSkeleton key={index} className="h-20 rounded-none" />
          ))}
        </div>
      </UiCard>
    );
  }
  if (status === "error") {
    return <UiErrorState onRetry={props.onRetry} testId="curva-ranking-error" />;
  }
  if (status === "off") {
    return (
      <UiCard padding="lg" className="flex flex-col items-center gap-4 text-center">
        <p
          className={cn("text-pretty", ui.text.body, ui.tone.default)}
          data-testid="curva-ranking-off"
        >
          {copy.off}
        </p>
        <Link
          to="/curva"
          className={cn(
            "inline-flex items-center justify-center px-4",
            ui.space.tap,
            ui.radius.full,
            ui.surface.sunken,
            ui.text.bodyStrong,
            ui.focus,
          )}
        >
          {copy.backToCurva}
        </Link>
      </UiCard>
    );
  }
  if (status === "no_league") {
    return (
      <UiEmptyState
        title={copy.emptyNoLeague}
        testId="curva-ranking-empty"
        action={
          <Link
            to="/fantasy/leagues"
            className={cn(
              "inline-flex items-center justify-center px-4",
              ui.space.tap,
              ui.radius.full,
              ui.surface.sunken,
              ui.text.bodyStrong,
              ui.focus,
            )}
          >
            {copy.leaguesLabel}
          </Link>
        }
      />
    );
  }
  if (ranking.rated.length === 0 && ranking.unrated.length === 0) {
    return (
      <UiEmptyState
        title={scope === "all" ? copy.emptyAll : copy.noneRated}
        testId="curva-ranking-empty"
      />
    );
  }
  return (
    <>
      {ranking.rated.length > 0 ? (
        <UiCard padding="none" className="overflow-hidden">
          <ol aria-label={copy.ratedTitle} data-testid="curva-ranking-rated">
            {ranking.rated.map((row, index) => (
              <RankingRow
                key={row.entry.teamId}
                entry={row.entry}
                rank={row.rank}
                index={index}
                last={index === ranking.rated.length - 1}
              />
            ))}
          </ol>
        </UiCard>
      ) : (
        <p className={cn("text-pretty", ui.text.secondary, ui.tone.muted)}>{copy.noneRated}</p>
      )}
      {ranking.unrated.length > 0 ? (
        <section aria-labelledby="curva-ranking-unrated" data-testid="curva-ranking-unrated">
          <h2 id="curva-ranking-unrated" className={cn("pb-1", ui.text.section, ui.tone.default)}>
            {copy.unratedTitle}
          </h2>
          <p className={cn("pb-2.5 text-pretty", ui.text.meta, ui.tone.muted)}>
            {copy.unratedHint}
          </p>
          <UiCard padding="none" className="overflow-hidden">
            <ul>
              {ranking.unrated.map((entry, index) => (
                <RankingRow
                  key={entry.teamId}
                  entry={entry}
                  rank={null}
                  index={index}
                  last={index === ranking.unrated.length - 1}
                />
              ))}
            </ul>
          </UiCard>
        </section>
      ) : null}
      {props.cardsError ? (
        <p className={cn("flex items-center justify-between gap-3", ui.text.meta, ui.tone.muted)}>
          <FailedLine onRetry={props.onRetry} />
        </p>
      ) : null}
    </>
  );
}

function FailedLine({ onRetry }: { onRetry: () => void }): JSX.Element {
  const people = useCurvaCopy();
  const { t } = useI18n();
  return (
    <>
      <span>{people.peopleCardsFailed}</span>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          "min-h-[var(--ui-tap-min)] px-2",
          ui.text.meta,
          "[font-weight:var(--ui-weight-heavy)]",
          ui.tone.ink,
          ui.focus,
        )}
      >
        {t("state.retry")}
      </button>
    </>
  );
}

/** The most rows that wait for the ones before them; the rest arrive together. */
const STAGGER_CAP = 10;

function RankingRow({
  entry,
  rank,
  index,
  last,
}: {
  entry: RankingEntry;
  /** `null` for an unrated manager: no number. */
  rank: number | null;
  index: number;
  last: boolean;
}): JSX.Element {
  const { lang } = useI18n();
  const card = useCardCopy();
  const people = useCurvaCopy();
  const copy = useRankingCopy();
  const club = entry.club ? entry.club.shortName[lang] || entry.club.shortName.fr : null;
  const dot =
    entry.club?.primaryColor && HEX.test(entry.club.primaryColor) ? entry.club.primaryColor : null;
  const rated = entry.ovr !== null;
  return (
    <li
      className={cn(
        "cr-row relative grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3",
        ui.rule.block,
        entry.own && "bg-[color:color-mix(in_oklab,var(--ui-ink-fg)_8%,var(--ui-surface))]",
        last && "border-b-0",
      )}
      style={{ "--cr-i": Math.min(index, STAGGER_CAP) } as CSSProperties}
      data-own={entry.own ? "true" : undefined}
      data-team={entry.teamId}
      data-rank={rank ?? undefined}
    >
      {entry.own ? (
        <span
          aria-hidden
          data-own-bar=""
          className="absolute inset-y-2 start-0 w-1 rounded-full"
          style={{ backgroundImage: "var(--ui-grad-action)" }}
        />
      ) : null}
      <span className={cn("pt-0.5 text-center", ui.stat.sm, ui.tone.muted)}>
        {rank === null ? (
          <>
            <span aria-hidden>{DASH}</span>
            <span className="sr-only">{card.a11y.noRating}</span>
          </>
        ) : (
          <>
            <span aria-hidden>
              <Figure>{rank}</Figure>
            </span>
            <span className="sr-only">{copy.rankA11y(rank)}</span>
          </>
        )}
      </span>

      <div className="min-w-0">
        <p
          className={cn(
            "break-words",
            ui.text.secondary,
            "[font-weight:var(--ui-weight-heavy)]",
            ui.tone.default,
          )}
        >
          <PersonName>{entry.name}</PersonName>
          {entry.own ? (
            <>
              {" "}
              <span className={cn("[font-weight:var(--ui-weight-heavy)]", ui.tone.ink)}>
                · {people.peopleYou}
              </span>
            </>
          ) : null}
        </p>
        <p
          className={cn(
            "flex flex-wrap items-center gap-x-1.5 gap-y-0.5",
            ui.text.meta,
            ui.tone.muted,
          )}
        >
          {dot ? (
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: dot }}
            />
          ) : null}
          {club ? <PersonName>{club}</PersonName> : null}
          {club && entry.tier ? <span aria-hidden>·</span> : null}
          {entry.tier ? <TierWord tier={entry.tier} /> : null}
          {entry.provisional ? <ProvisionalBadge className="px-2 py-0.5" /> : null}
        </p>
        <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5" data-testid="ranking-stats">
          {STAT_CODES.map((code) => (
            <div key={code} className="flex items-baseline gap-1" data-stat={code}>
              <dt className={CODE_CLASS}>{card.stat[code]}</dt>
              <dd
                className={cn(
                  ui.text.meta,
                  entry.stats[code] === null ? ui.tone.muted : ui.tone.default,
                )}
              >
                {entry.stats[code] === null ? DASH : <Figure>{entry.stats[code]}</Figure>}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="text-end">
        {rated ? (
          <>
            <p className={cn(ui.stat.lg, ui.tone.default)} data-testid="ranking-ovr">
              <Figure>{entry.ovr}</Figure>
            </p>
            <p className={CODE_CLASS}>{card.ovr}</p>
          </>
        ) : (
          <p className={cn("max-w-[7rem] text-pretty", ui.text.meta, ui.tone.muted)}>
            {entry.filled === 0 && entry.minRated > 0
              ? copy.unratedForming(entry.counted, entry.minRated)
              : copy.unratedStats(entry.filled, STAT_TOTAL)}
          </p>
        )}
      </div>
    </li>
  );
}
