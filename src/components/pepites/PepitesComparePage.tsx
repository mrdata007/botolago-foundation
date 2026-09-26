import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import type { PlayerResponse, PlayerStatsResponse, RankingRow } from "@/backend/pepites/contracts";
import type { TranslationKey } from "@/i18n/dictionaries";
import { UiSheet, ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { pp, teamKit } from "./pepites-design";
import {
  formatCount,
  formatNumber,
  playerPhotoUrl,
  positionShort,
  scoreText,
} from "./pepites-format";
import {
  PepitesComingSoon,
  PepitesErrorState,
  PepitesLoadingState,
  PepitesPreviewBanner,
  PepitesCard,
} from "./PepitesParts";
import { PepitesShell } from "./PepitesShell";
import { Headshot, NightBand, PepitesShirt } from "./PepitesVisuals";
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
      left: firstStats?.stats ? firstStats.stats.yellowCards + firstStats.stats.redCards : null,
      right: secondStats?.stats ? secondStats.stats.yellowCards + secondStats.stats.redCards : null,
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
  const { t, tr, lang } = useI18n();
  const viewer = usePepitesViewer();
  const pointerQuery = useVersionPointer(viewer);
  const pointer = pointerQuery.data;
  const version = pointerVersion(pointer);
  const [picker, setPicker] = useState<Side | null>(null);
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
  const hero = (
    <NightBand
      glow={first?.player?.team ? teamKit(first.player.team).primary : null}
      cut={25}
      testId="pepites-compare-hero"
    >
      <div className="min-h-[265px] pb-11 pt-2">
        <div className="flex items-center justify-between gap-2">
          {firstId ? (
            <Link
              to="/pepites/joueur/$playerId"
              params={{ playerId: firstId }}
              className={cn("text-[13px] text-white", pp.heavy, ui.focusOnMesh)}
            >
              {t("pepites.compare.back")}
            </Link>
          ) : (
            <Link
              to="/pepites/classement"
              className={cn("text-[13px] text-white", pp.heavy, ui.focusOnMesh)}
            >
              {t("pepites.compare.back")}
            </Link>
          )}
          <span className={cn(pp.monoStrong, pp.onNightMeta, "text-[11px] leading-[1.4]")}>
            {t("pepites.compare.title")}
          </span>
          <span className="w-12" aria-hidden />
        </div>
        <div className="mt-6 grid grid-cols-[1fr_44px_1fr] items-center gap-1 text-center">
          <ComparePortrait data={first} side="a" onPick={() => setPicker("a")} />
          <span className={cn(pp.display, pp.energyText, "text-[30px]")}>VS</span>
          <ComparePortrait data={second} side="b" onPick={() => setPicker("b")} />
        </div>
      </div>
    </NightBand>
  );

  return (
    <PepitesShell hero={hero}>
      {pointer.preview ? <PepitesPreviewBanner /> : null}
      <div className="-mt-12 relative">
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
          <PepitesCard testId="pepites-compare-card">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h1 className={cn(pp.heavy, pp.text, "text-[12px]")}>
                {t("pepites.compare.season")}
              </h1>
              <p className={cn(pp.mono, pp.muted, "text-[11px] leading-[1.4]")}>
                {t("pepites.compare.scope")}
              </p>
            </div>
            <div className="flex flex-col gap-3">
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
                    className="grid grid-cols-[35px_minmax(0,1fr)_74px_minmax(0,1fr)_35px] items-center gap-1"
                    data-testid={`pepites-compare-${row.key}`}
                  >
                    <bdi
                      className={cn(
                        "text-end text-[12px] tabular-nums",
                        leftWins ? "text-[#1b8f55]" : pp.muted,
                      )}
                    >
                      {value(row.left)}
                    </bdi>
                    <div className="flex justify-end">
                      <div
                        className={cn(
                          "h-2 rounded-sm",
                          leftWins ? pp.energyFill : "bg-[color:var(--pepites-seg-empty)]",
                        )}
                        style={{ width: `${((row.left ?? 0) / max) * 100}%` }}
                      />
                    </div>
                    <span className={cn(pp.bold, pp.text, "text-center text-[11px] leading-[1.4]")}>
                      {compareRowLabel(row.key, t)}
                    </span>
                    <div
                      className={cn(
                        "h-2 rounded-sm",
                        rightWins ? pp.energyFill : "bg-[color:var(--pepites-seg-empty)]",
                      )}
                      style={{ width: `${((row.right ?? 0) / max) * 100}%` }}
                    />
                    <bdi
                      className={cn(
                        "text-start text-[12px] tabular-nums",
                        rightWins ? "text-[#1b8f55]" : pp.muted,
                      )}
                    >
                      {value(row.right)}
                    </bdi>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void share()}
              className={cn(
                "mt-5 min-h-10 w-full rounded-lg text-[13px]",
                pp.energyFill,
                pp.heavy,
                pp.ink,
                ui.focus,
              )}
              data-testid="pepites-compare-share"
            >
              {t("pepites.compare.share")}
            </button>
          </PepitesCard>
        ) : (
          <PepitesCard testId="pepites-compare-empty" className="text-center">
            <p className={cn(pp.bold, pp.text, "text-[14px]")}>
              {t("pepites.compare.choose_prompt")}
            </p>
            <button
              type="button"
              onClick={() => setPicker(first ? "b" : "a")}
              className={cn(
                "mt-3 min-h-10 rounded-full px-5",
                pp.energyFill,
                pp.heavy,
                pp.ink,
                ui.focus,
              )}
            >
              {first ? t("pepites.compare.choose_second") : t("pepites.compare.choose_first")}
            </button>
          </PepitesCard>
        )}
      </div>
      <PlayerPicker
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        players={players}
        excludeId={picker === "a" ? secondId : firstId}
        onChoose={(id) => {
          if (picker) choose(picker, id);
        }}
        loadMore={() => void ranking.fetchNextPage()}
        hasMore={Boolean(ranking.hasNextPage)}
        loading={ranking.isPending || ranking.isFetchingNextPage}
      />
    </PepitesShell>
  );
}

function ComparePortrait({
  data,
  side,
  onPick,
}: {
  data: LoadedPlayer | null;
  side: Side;
  onPick: () => void;
}) {
  const { t, tr, lang } = useI18n();
  const player = data?.player;
  const photo = player ? playerPhotoUrl(player) : null;
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex min-w-0 flex-col items-center gap-2 rounded-lg p-1 text-white",
        ui.focusOnMesh,
      )}
      data-testid={`pepites-compare-pick-${side}`}
    >
      {player ? (
        photo ? (
          <img src={photo} alt="" className="size-[110px] rounded-xl object-cover" />
        ) : (
          <PepitesShirt
            player={player}
            number={data?.score?.rank ?? null}
            className="h-[110px] w-[112px]"
          />
        )
      ) : (
        <span className="flex size-[110px] items-center justify-center rounded-xl border border-white/30 text-[24px]">
          ＋
        </span>
      )}
      <span className={cn(pp.display, "max-w-full truncate text-[16px]")}>
        {player?.name ??
          (side === "a" ? t("pepites.compare.choose_first") : t("pepites.compare.choose_second"))}
      </span>
      {player ? (
        <span className={cn(pp.mono, pp.onNightMeta, "text-[11px] leading-[1.4]")}>
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
  players,
  excludeId,
  onChoose,
  loadMore,
  hasMore,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: readonly RankingRow[];
  excludeId: string | null;
  onChoose: (id: string) => void;
  loadMore: () => void;
  hasMore: boolean;
  loading: boolean;
}) {
  const { t, tr, lang } = useI18n();
  const [search, setSearch] = useState("");
  const filtered = players.filter(
    (player) =>
      player.id !== excludeId &&
      player.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <UiSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("pepites.compare.picker_title")}
      description={t("pepites.compare.picker_description")}
    >
      <div className="p-4">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("pepites.compare.search_placeholder")}
          aria-label={t("pepites.compare.search_placeholder")}
          className="mb-3 h-10 w-full rounded-lg border px-3 text-[14px]"
        />
        <ul className="max-h-[52dvh] overflow-y-auto">
          {filtered.map((player) => (
            <li key={player.id}>
              <button
                type="button"
                data-testid="pepites-compare-option"
                onClick={() => onChoose(player.id)}
                className={cn(
                  "flex min-h-[52px] w-full items-center gap-3 border-b text-start",
                  ui.focus,
                )}
              >
                <Headshot player={player} size={36} />
                <span className="min-w-0 flex-1">
                  <span className={cn(pp.heavy, pp.text, "block truncate text-[13px]")}>
                    {player.name}
                  </span>
                  <span className={cn(pp.muted, "block text-[11px]")}>
                    {player.team ? tr(player.team.shortName) : ""} ·{" "}
                    {player.positionGroup ? positionShort(player.positionGroup, t) : ""}
                  </span>
                </span>
                <bdi className={cn(pp.display, pp.ink, "text-[20px]")}>
                  {scoreText(player.score, lang, "–")}
                </bdi>
              </button>
            </li>
          ))}
        </ul>
        {hasMore ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className={cn("mt-3 min-h-10 w-full rounded-lg", pp.ink, pp.heavy, ui.focus)}
          >
            {t("pepites.ranking.load_more")}
          </button>
        ) : null}
        {loading && players.length === 0 ? (
          <p className={cn(pp.muted, "text-center text-[13px]")}>…</p>
        ) : null}
      </div>
    </UiSheet>
  );
}
