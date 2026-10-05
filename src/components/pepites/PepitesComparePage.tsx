import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type Ref } from "react";
import { toast } from "sonner";

import type { PlayerResponse, PlayerStatsResponse, RankingRow } from "@/backend/pepites/contracts";
import { SectionHeader } from "@/components/common/SectionHeader";
import type { TranslationKey } from "@/i18n/dictionaries";
import { ui, UiButton, UiCard, UiInput, UiPlayerRow, UiSheet } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle } from "@/lib/club-palette";
import { cn } from "@/lib/utils";

import {
  formatNumber,
  playerPhotoUrl,
  positionShort,
  scoreText,
  teamAsClub,
} from "./pepites-format";
import {
  PepitesComingSoon,
  PepitesErrorState,
  PepitesLoadingState,
  PepitesPreviewBanner,
} from "./PepitesParts";
import { PepitesDetailHeader, PepitesShell } from "./PepitesShell";
import { PepitesPlayerPhoto, PepitesShirt } from "./PepitesVisuals";
import {
  playerQueryOptions,
  playerStatsQueryOptions,
  pointerVersion,
  rankingPagesOptions,
  usePepitesViewer,
  useVersionPointer,
} from "./use-pepites";

type Side = "a" | "b";
type LoadedPlayer = Extract<PlayerResponse, { available: true }>;
type LoadedStats = Extract<PlayerStatsResponse, { available: true }>;

function compareRowLabel(key: string, t: (key: TranslationKey) => string): string {
  switch (key) {
    case "score":
      return t("pepites.compare.score");
    case "minutes":
      return t("pepites.compare.minutes");
    case "starts":
      return t("pepites.compare.starts");
    case "rating":
      return t("pepites.compare.rating");
    case "form":
      return t("pepites.compare.form");
    case "goals_assists":
      return t("pepites.compare.goals_assists");
    case "cards":
      return t("pepites.compare.cards");
    default:
      return t("pepites.compare.progression");
  }
}

function compareValues(
  first: LoadedPlayer,
  second: LoadedPlayer,
  firstStats?: LoadedStats,
  secondStats?: LoadedStats,
) {
  const a = first.score;
  const b = second.score;
  return [
    { key: "score", left: a?.score ?? null, right: b?.score ?? null },
    { key: "minutes", left: a?.minutes ?? null, right: b?.minutes ?? null },
    { key: "starts", left: a?.starts ?? null, right: b?.starts ?? null },
    { key: "rating", left: a?.ratingAvg ?? null, right: b?.ratingAvg ?? null },
    { key: "form", left: a?.formAvg ?? null, right: b?.formAvg ?? null },
    {
      key: "goals_assists",
      left: a ? a.goals + a.assists : null,
      right: b ? b.goals + b.assists : null,
    },
    {
      key: "cards",
      left:
        firstStats?.stats?.yellowCards != null && firstStats.stats.redCards != null
          ? firstStats.stats.yellowCards + firstStats.stats.redCards
          : null,
      right:
        secondStats?.stats?.yellowCards != null && secondStats.stats.redCards != null
          ? secondStats.stats.yellowCards + secondStats.stats.redCards
          : null,
      lowerWins: true,
    },
    {
      key: "progression",
      left: a?.percentiles.progression ?? null,
      right: b?.percentiles.progression ?? null,
    },
  ] as const;
}

/** The first player stays in the URL while a ranking-backed sheet picks the other. */
export function PepitesComparePage({
  firstId,
  secondId,
  onSelect,
}: {
  firstId: string | null;
  secondId: string | null;
  onSelect: (side: Side, id: string) => void;
}) {
  const { t, lang } = useI18n();
  const viewer = usePepitesViewer();
  const pointerQuery = useVersionPointer(viewer);
  const pointer = pointerQuery.data;
  const version = pointerVersion(pointer);
  const [picker, setPicker] = useState<Side | null>(null);
  const pickerOpener = useRef<HTMLButtonElement | null>(null);
  const portraitButtons = useRef<Partial<Record<Side, HTMLButtonElement | null>>>({});
  const pickerSide = useRef<Side>("a");
  const openPicker = (side: Side, opener: HTMLButtonElement) => {
    pickerOpener.current = opener;
    pickerSide.current = side;
    setPicker(side);
  };
  const firstQuery = useQuery({
    ...playerQueryOptions(viewer, version, firstId ?? ""),
    enabled: pointer?.available === true && version !== null && !!firstId,
  });
  const secondQuery = useQuery({
    ...playerQueryOptions(viewer, version, secondId ?? ""),
    enabled: pointer?.available === true && version !== null && !!secondId,
  });
  const firstStats = useQuery({
    ...playerStatsQueryOptions(viewer, version, firstId ?? ""),
    enabled: pointer?.available === true && version !== null && !!firstId,
  });
  const secondStats = useQuery({
    ...playerStatsQueryOptions(viewer, version, secondId ?? ""),
    enabled: pointer?.available === true && version !== null && !!secondId,
  });
  const ranking = useInfiniteQuery({
    ...rankingPagesOptions(viewer, {
      version,
      position: null,
      maxAge: null,
      teamId: null,
      sort: "score",
      limit: 25,
    }),
    enabled: pointer?.available === true && version !== null && picker !== null,
  });

  if (pointerQuery.isPending)
    return <PepitesLoadingState onRetry={() => void pointerQuery.refetch()} />;
  if (pointerQuery.isError && !pointer)
    return <PepitesErrorState onRetry={() => void pointerQuery.refetch()} />;
  if (!pointer?.available)
    return (
      <PepitesShell>
        <PepitesComingSoon />
      </PepitesShell>
    );

  const first = firstQuery.data?.available && firstQuery.data.found ? firstQuery.data : null;
  const second = secondQuery.data?.available && secondQuery.data.found ? secondQuery.data : null;
  const leftStats =
    firstStats.data?.available && firstStats.data.found ? firstStats.data : undefined;
  const rightStats =
    secondStats.data?.available && secondStats.data.found ? secondStats.data : undefined;
  const players = (ranking.data?.pages ?? []).flatMap((page) =>
    page.available && page.rows ? page.rows : [],
  );
  const share = async () => {
    if (!firstId || !secondId || typeof window === "undefined") return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: t("pepites.compare.title"), url });
      } catch {
        /* User dismissed the sheet. */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("pepites.compare.copied"));
    } catch {
      toast.error(t("pepites.compare.copy_failed"));
    }
  };
  const choose = (side: Side, id: string) => {
    if (id === (side === "a" ? secondId : firstId)) return;
    onSelect(side, id);
    setPicker(null);
  };
  // Back to the player the comparison started from, or to the ranking.
  const backTo = firstId ? `/pepites/joueur/${encodeURIComponent(firstId)}` : "/pepites/classement";

  return (
    <PepitesShell
      pageHeader={
        <PepitesDetailHeader
          backTo={backTo}
          kicker={t("pepites.brand")}
          title={t("pepites.compare.title")}
        />
      }
    >
      {pointer.preview ? <PepitesPreviewBanner /> : null}
      {/* The two players side by side, each a card that opens the picker;
          "vs" between them. The grid follows the page direction, so the
          first player stands at the inline start in both languages. */}
      <div
        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2"
        data-testid="pepites-compare-cards"
      >
        <ComparePortrait
          data={first}
          side="a"
          buttonRef={(button) => {
            portraitButtons.current.a = button;
          }}
          onPick={(event) => openPicker("a", event.currentTarget)}
        />
        <span aria-hidden className={cn("self-center", ui.text.label, ui.tone.muted)}>
          {t("common.vs")}
        </span>
        <ComparePortrait
          data={second}
          side="b"
          buttonRef={(button) => {
            portraitButtons.current.b = button;
          }}
          onPick={(event) => openPicker("b", event.currentTarget)}
        />
      </div>
      {firstQuery.isError || secondQuery.isError || firstStats.isError || secondStats.isError ? (
        <PepitesErrorState
          inline
          onRetry={() => {
            void firstQuery.refetch();
            void secondQuery.refetch();
            void firstStats.refetch();
            void secondStats.refetch();
          }}
        />
      ) : first && second && first.player && second.player ? (
        <UiCard testId="pepites-compare-card">
          <SectionHeader
            title={t("pepites.compare.season")}
            subtitle={t("pepites.compare.scope")}
          />
          {/* One grid for every row (each row a subgrid), so the figures, the
              bars and the labels line up down the card. Each bar grows from
              the label in the middle towards its player's side. */}
          <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] gap-x-2 gap-y-3">
            {compareValues(first, second, leftStats, rightStats).map((row) => {
              const leftWins =
                row.left !== null &&
                row.right !== null &&
                ("lowerWins" in row ? row.left < row.right : row.left > row.right);
              const rightWins =
                row.left !== null &&
                row.right !== null &&
                ("lowerWins" in row ? row.right < row.left : row.right > row.left);
              const max = Math.max(row.left ?? 0, row.right ?? 0, 0.01);
              const value = (n: number | null) =>
                n === null
                  ? "–"
                  : formatNumber(
                      n,
                      lang,
                      row.key === "rating" || row.key === "form" || row.key === "score" ? 1 : 0,
                    );
              return (
                <div
                  key={row.key}
                  className="col-span-5 grid grid-cols-subgrid items-center"
                  data-testid={`pepites-compare-${row.key}`}
                >
                  <bdi
                    className={cn(
                      "text-end",
                      ui.stat.sm,
                      leftWins
                        ? cn(ui.tone.positive, "[font-weight:var(--ui-weight-heavy)]")
                        : ui.tone.muted,
                    )}
                  >
                    {value(row.left)}
                  </bdi>
                  <div className="flex justify-end">
                    <CompareBar share={(row.left ?? 0) / max} wins={leftWins} />
                  </div>
                  <span className={cn("text-center", ui.text.label, ui.tone.muted)}>
                    {compareRowLabel(row.key, t)}
                  </span>
                  <div className="flex justify-start">
                    <CompareBar share={(row.right ?? 0) / max} wins={rightWins} />
                  </div>
                  <bdi
                    className={cn(
                      "text-start",
                      ui.stat.sm,
                      rightWins
                        ? cn(ui.tone.positive, "[font-weight:var(--ui-weight-heavy)]")
                        : ui.tone.muted,
                    )}
                  >
                    {value(row.right)}
                  </bdi>
                </div>
              );
            })}
          </div>
          <UiButton
            variant="gradient"
            className="mt-5"
            onClick={() => void share()}
            data-testid="pepites-compare-share"
          >
            {t("pepites.compare.share")}
          </UiButton>
        </UiCard>
      ) : (
        <UiCard testId="pepites-compare-empty" className="flex flex-col items-center gap-3">
          <p className={cn("text-center", ui.text.bodyStrong, ui.tone.default)}>
            {t("pepites.compare.choose_prompt")}
          </p>
          <UiButton
            variant="gradient"
            size="sm"
            onClick={(event) => openPicker(first ? "b" : "a", event.currentTarget)}
          >
            {first ? t("pepites.compare.choose_second") : t("pepites.compare.choose_first")}
          </UiButton>
        </UiCard>
      )}
      <PlayerPicker
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = pickerOpener.current?.isConnected
            ? pickerOpener.current
            : portraitButtons.current[pickerSide.current];
          target?.focus();
        }}
        players={players}
        excludeId={picker === "a" ? secondId : firstId}
        onChoose={(id) => {
          if (picker) {
            // Selection can remove the empty-state button after the query resolves.
            pickerOpener.current = portraitButtons.current[picker] ?? null;
            choose(picker, id);
          }
        }}
        loadMore={() => void ranking.fetchNextPage({ cancelRefetch: false })}
        failed={ranking.isError}
        onRetry={() => {
          if (ranking.isFetchNextPageError) void ranking.fetchNextPage({ cancelRefetch: false });
          else void ranking.refetch();
        }}
        hasMore={Boolean(ranking.hasNextPage)}
        loading={ranking.isPending || ranking.isFetching}
      />
    </PepitesShell>
  );
}

/**
 * One comparison bar: `share` (0–1) of its half of the row. The winner's bar
 * is the brand foreground, the other the sunken track colour, both on the
 * track radius. Decorative: the figure beside it carries the value.
 */
function CompareBar({ share, wins }: { share: number; wins: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "h-2",
        ui.radius.track,
        wins ? "bg-[color:var(--ui-ink-fg)]" : "bg-[color:var(--ui-surface-sunken)]",
      )}
      style={{ width: `${share * 100}%` }}
    />
  );
}

/**
 * A player's side of the comparison: an interactive card that opens the
 * picker. The photo (or the club shirt with the rank, or a "+" disc while
 * the side is empty), the name, and club · age · rank. A chosen player's
 * club colour runs along the card's base (`clubStyle` + `ui.edge.blockEnd`).
 */
function ComparePortrait({
  data,
  side,
  buttonRef,
  onPick,
}: {
  data: LoadedPlayer | null;
  side: Side;
  buttonRef: Ref<HTMLButtonElement>;
  onPick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { t, tr, lang } = useI18n();
  const player = data?.player;
  const photo = player ? playerPhotoUrl(player) : null;
  const colours = player ? clubStyle(teamAsClub(player.team)) : null;
  return (
    <button
      type="button"
      onClick={onPick}
      ref={buttonRef}
      data-club={colours?.["data-club"]}
      style={colours?.style}
      className={cn(
        // An interactive `UiCard` as a button: the card surface, the tile
        // press and the focus ring.
        ui.surface.card,
        colours && ui.edge.blockEnd,
        "press-tile flex min-w-0 flex-col items-center gap-2 p-3 text-center md:p-4",
        ui.focus,
      )}
      data-testid={`pepites-compare-pick-${side}`}
    >
      {player ? (
        photo ? (
          <PepitesPlayerPhoto player={player} size="xl" />
        ) : (
          <PepitesShirt player={player} number={data?.score?.rank ?? null} className="h-24 w-24" />
        )
      ) : (
        <span
          aria-hidden
          className={cn("grid size-24 place-items-center", ui.radius.full, ui.surface.sunken)}
        >
          <Plus className={cn("h-8 w-8", ui.tone.ink)} />
        </span>
      )}
      <span
        className={cn(
          "max-w-full text-balance [overflow-wrap:anywhere]",
          player ? cn(ui.display.team, ui.tone.default) : cn(ui.text.bodyStrong, ui.tone.ink),
        )}
      >
        <bdi>
          {player?.name ??
            (side === "a" ? t("pepites.compare.choose_first") : t("pepites.compare.choose_second"))}
        </bdi>
      </span>
      {player ? (
        <span className={cn("max-w-full", ui.text.meta, ui.tone.muted)}>
          {[
            player.team ? tr(player.team.shortName) : null,
            player.age
              ? t("pepites.meta.age_short").replace("{n}", formatNumber(player.age, lang))
              : null,
            data?.score?.rank ? `#${formatNumber(data.score.rank, lang)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      ) : null}
    </button>
  );
}

function PlayerPicker({
  open,
  onOpenChange,
  onCloseAutoFocus,
  players,
  excludeId,
  onChoose,
  loadMore,
  hasMore,
  loading,
  failed,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  players: readonly RankingRow[];
  excludeId: string | null;
  onChoose: (id: string) => void;
  loadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const { t, tr, lang } = useI18n();
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase();
  // Search the complete version, not just the pages manually opened so far.
  // Stop on errors so a failed page cannot cause an automatic retry loop.
  useEffect(() => {
    if (open && term && hasMore && !loading && !failed) loadMore();
  }, [open, term, hasMore, loading, failed, loadMore]);
  const filtered = players.filter(
    (player) => player.id !== excludeId && player.name.toLocaleLowerCase().includes(term),
  );
  return (
    <UiSheet
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      title={t("pepites.compare.picker_title")}
      description={t("pepites.compare.picker_description")}
    >
      {/* The search field stays in view while the list scrolls under it. */}
      <div className={cn("sticky top-0 z-10 px-4 pb-3 pt-4", ui.surface.bar, ui.rule.block)}>
        <UiInput
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("pepites.compare.search_placeholder")}
          aria-label={t("pepites.compare.search_placeholder")}
          leading={<Search aria-hidden className={cn("h-4 w-4", ui.tone.muted)} />}
        />
      </div>
      <ul>
        {filtered.map((player) => (
          <li key={player.id} data-testid="pepites-compare-option">
            <UiPlayerRow
              onClick={() => onChoose(player.id)}
              className="px-4"
              visual={<PepitesPlayerPhoto player={player} size="md" />}
              name={<bdi>{player.name}</bdi>}
              meta={[
                player.team ? tr(player.team.shortName) : null,
                player.positionGroup ? positionShort(player.positionGroup, t) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              stats={[
                {
                  key: "score",
                  value: <bdi>{scoreText(player.score, lang, "–")}</bdi>,
                },
              ]}
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 p-4">
        {hasMore && !term && !failed ? (
          <UiButton variant="soft" onClick={loadMore} disabled={loading}>
            {t("pepites.ranking.load_more")}
          </UiButton>
        ) : null}
        {failed ? <PepitesErrorState inline onRetry={onRetry} /> : null}
        {!failed && (loading || (term && hasMore)) ? (
          <p role="status" className={cn("text-center", ui.text.secondary, ui.tone.muted)}>
            {t("state.loading")}
          </p>
        ) : !failed && !hasMore && filtered.length === 0 ? (
          <p role="status" className={cn("text-center", ui.text.secondary, ui.tone.muted)}>
            {t("pepites.compare.no_results")}
          </p>
        ) : null}
      </div>
    </UiSheet>
  );
}
