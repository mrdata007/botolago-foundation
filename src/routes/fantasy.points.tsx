import { AnimatedNumber, PopOnChange } from "@/components/common/AnimatedNumber";
import pointsPendingArt from "@/assets/illustrations/points-pending.webp";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SectionHeader } from "@/components/common/SectionHeader";
import { GameweekRecapCard } from "@/components/fantasy/GameweekRecapCard";
import { GameweekSelector } from "@/components/fantasy/GameweekSelector";
import { findClub } from "@/components/fpl/club-lookup";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { FplPitch } from "@/components/fpl/FplPitch";
import { FplPlayerCard } from "@/components/fpl/FplPlayerCard";
import { FplStatBar } from "@/components/fpl/FplStatBar";
import { SquadListTable } from "@/components/fpl/SquadListTable";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import {
  ui,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiBadge,
  UiHeader,
  UiKeyValueRow,
  UiSegmented,
  UiSkeleton,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyService } from "@/services/fantasy-runtime";
import { fantasyStateStore } from "@/services/fantasy-state";
import { buildGameweekRecap } from "@/services/gameweek-recap";
import {
  mayRiseToTwo,
  pendingCountLabel,
  pendingItemsOfFixture,
  pointsCell,
} from "@/services/points-pending";
import {
  buildPointsViewModel,
  buildServerPointsViewModel,
  type PointsViewModel,
} from "@/services/points-service";
import { FORMATIONS, type FormationKey, type SquadPlayer } from "@/types/fantasy";
import { fantasyHead } from "@/lib/fantasy-meta";
import { scrollBehavior } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { pointsUnit } from "@/lib/points-unit";

interface PointsSearch {
  /** The round to open on (`/fantasy/points?gw=13`), as the hub's team card links it. */
  gw?: number;
}

/**
 * `?gw=` is a positive whole round number or nothing. A value that is not
 * one is set to `undefined` rather than left out, so nothing of the raw
 * query survives under the key. Whether that round exists is checked on the
 * screen, against the rounds its stepper offers.
 */
function validatePointsSearch(search: Record<string, unknown>): PointsSearch {
  const raw = search.gw;
  const gw = typeof raw === "number" || typeof raw === "string" ? Number(raw) : Number.NaN;
  return { gw: Number.isInteger(gw) && gw >= 1 && gw <= 1000 ? gw : undefined };
}

export const Route = createFileRoute("/fantasy/points")({
  head: () => fantasyHead("points"),
  validateSearch: validatePointsSearch,
  component: PointsPage,
});

/**
 * BG-0157 (2) — the round Points opens on: the one the address asks for, if
 * the stepper offers it; else the current round while it is being played
 * ("Suivre mes points" at kick-off, before its first scoring pass has written
 * a result); else the round of the hub's figure (the summary's
 * `pointsGameweek`: the current round's result, else the latest round with
 * one for this team); else the current round. `undefined` while a fact it
 * needs is still on its way, so the screen does not open on one round and
 * then jump to another.
 */
function openingRound({
  requested,
  offered,
  inPlay,
  resultRound,
  current,
}: {
  requested: number | null;
  /** The rounds the stepper offers; `undefined` until they are known. */
  offered: readonly number[] | undefined;
  /** The current round is live, provisional or finalizing. */
  inPlay: boolean;
  /** The summary's `pointsGameweek`; `undefined` until the summary is known. */
  resultRound: number | null | undefined;
  current: number;
}): number | undefined {
  if (offered === undefined) return undefined;
  const min = Math.min(...offered);
  const max = Math.max(...offered);
  const inRange = (n: number | null | undefined): n is number =>
    typeof n === "number" && n >= min && n <= max;
  if (inRange(requested)) return requested;
  if (inPlay) return current;
  if (resultRound === undefined) return undefined;
  return inRange(resultRound) ? resultRound : current;
}

/**
 * "Points" — what a gameweek actually scored.
 *
 * Every figure on this screen is either a real number or an en dash. A 0
 * where the answer is "not known yet" reads as "your captain blanked", and
 * removing that confusion is the whole reason `fantasy.stat.none` exists
 * (BG-0071/BG-0075); it is never a fallback for a missing value here.
 *
 * The screen is deliberately plain: the numbers carry the meaning, so they
 * get the stat ramp (tabular, aligned, one weight per step) and almost no
 * chrome — no badges around totals, no gradients behind them.
 *
 * Option A (A-Team): the team is the header's title under a "FANTASY"
 * kicker, the gameweek stepper sits in the header band, and the navy strip
 * leads with the gameweek's points and its scoring state beside the
 * gameweek's average and best — the board's "58 pts · EN DIRECT | MOYENNE |
 * MEILLEUR". Then the "Terrain | Liste" pill and the pitch card.
 */
function PointsPage() {
  return (
    <FantasyFrame bottomNav>
      <PointsBody />
    </FantasyFrame>
  );
}

function PointsBody() {
  const { t, tr, lang } = useI18n();
  const screen = useFantasyScreen();
  const owned = useFantasyOwned();
  const { key } = useFantasyDataSource();
  const isCloud = owned.source === "cloud";
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  /** The one answer for "this value is not known", everywhere on the screen. */
  const none = t("fantasy.stat.none");

  const team = screen.team;
  const players = screen.players;
  const clubs = screen.clubs;
  const currentGw = screen.gameweek?.number ?? null;
  const search = Route.useSearch();
  const [gw, setGw] = useState<number | null>(null);
  const [view, setView] = useState<"squad" | "list">("squad");

  const gameweeksQ = useQuery({
    queryKey: ["fantasy-gameweeks-available"],
    queryFn: () => fantasyService.getAvailableTopGameweeks(),
    enabled: screen.phase === "ready",
    staleTime: 60_000,
  });
  // The same query, key and service as the hub's team card, so the round
  // opened here is the round of the figure the manager tapped.
  const summaryQ = useQuery({
    queryKey: key("summary"),
    queryFn: () => fantasyService.getSummary(),
    enabled: screen.phase === "ready" && !!team,
  });
  // Chosen once; after that the stepper moves between rounds as before.
  const opening =
    currentGw === null
      ? undefined
      : openingRound({
          requested: search.gw ?? null,
          inPlay:
            screen.gameweek?.status === "live" ||
            screen.gameweek?.status === "provisional" ||
            screen.gameweek?.status === "finalizing",
          // The same fallback as the stepper's range below.
          offered: gameweeksQ.isPending
            ? undefined
            : gameweeksQ.data && gameweeksQ.data.length > 0
              ? gameweeksQ.data
              : [currentGw],
          resultRound: summaryQ.isPending ? undefined : (summaryQ.data?.pointsGameweek ?? null),
          current: currentGw,
        });
  useEffect(() => {
    if (gw === null && opening !== undefined) setGw(opening);
  }, [gw, opening]);
  const resultQ = useQuery({
    queryKey: key("gw-result", gw),
    // React Query treats `undefined` as a failed fetch, so a gameweek without
    // a computed result (the normal case before the first deadline) resolves
    // to `null` and the squad still renders with en-dash plates.
    queryFn: async () => (await fantasyService.getGameweekResult(gw!)) ?? null,
    enabled: screen.phase === "ready" && gw !== null && !!team,
    retry: 1,
    retryDelay: 1_500,
    refetchInterval: (query) =>
      isCloud && query.state.data?.authoritative?.finalized !== true ? 30_000 : false,
  });

  const lifecycle = isCloud
    ? (owned.snapshot?.lifecycle ?? fantasyStateStore.read())
    : fantasyStateStore.read();
  const vm = useMemo<PointsViewModel | null>(() => {
    if (!team || gw === null || !resultQ.data || resultQ.data.breakdown.length === 0) return null;
    try {
      if (isCloud) return buildServerPointsViewModel(resultQ.data);
      return buildPointsViewModel({
        gameweek: gw,
        team,
        players,
        chips: gw === currentGw ? lifecycle.chips : { active: null, used: [] },
        transferHitPoints: gw === currentGw ? lifecycle.transferHitPoints : 0,
        breakdown: resultQ.data.breakdown,
        averagePoints: resultQ.data.averagePoints,
        highestPoints: resultQ.data.highestPoints,
      });
    } catch {
      return null;
    }
  }, [team, gw, resultQ.data, players, lifecycle, currentGw, isCloud]);

  if (screen.phase !== "ready" || !team || gw === null) {
    return (
      <>
        <UiHeader kicker={t("fantasy.title")} title={t("fpl.points")} backTo="/fantasy" />
        <FantasyScreenGate state={screen} next="/fantasy/points">
          {/* Ready, while the round to open on is worked out: held, not blank. */}
          <div
            role="status"
            aria-label={t("state.loading")}
            className={cn("pt-3", ui.space.gutter)}
          >
            <UiSkeleton className={cn("h-[420px] w-full", ui.radius.sheet)} />
          </div>
        </FantasyScreenGate>
      </>
    );
  }

  const available =
    gameweeksQ.data && gameweeksQ.data.length > 0 ? gameweeksQ.data : [currentGw ?? 1];
  const min = Math.min(...available);
  const max = Math.max(...available);
  const playerOf = (id: string) => players.find((p) => p.id === id);
  const clubOf = (id: string) => findClub(clubs, id);
  const posOf = (id: string) => playerOf(id)?.position;
  const breakdown = new Map((vm?.breakdown ?? []).map((b) => [b.playerId, b]));

  const startingIds = vm
    ? vm.effectiveStartingIds
    : team.squad
        .filter((s) => s.slot < 12)
        .sort((a, b) => a.slot - b.slot)
        .map((s) => s.playerId);
  const benchIds = vm
    ? vm.originalBenchIds
    : team.squad
        .filter((s) => s.slot >= 12)
        .sort((a, b) => a.slot - b.slot)
        .map((s) => s.playerId);
  const captainId = vm?.effectiveCaptainId ?? team.squad.find((s) => s.isCaptain)?.playerId ?? null;
  const viceId = team.squad.find((s) => s.isViceCaptain)?.playerId ?? null;
  const count = (pos: string) => startingIds.filter((id) => posOf(id) === pos).length;
  const formationKey = `${count("DEF")}-${count("MID")}-${count("FWD")}` as FormationKey;
  const cfg = FORMATIONS[formationKey] ?? FORMATIONS[team.formation];

  /** `null` for a player with no row, and for one whose points are not confirmed yet. */
  const pointsFor = (id: string) => {
    const b = breakdown.get(id);
    if (!b || b.totalPoints === null) return null;
    if (vm?.source === "server") return b.totalPoints * Math.max(1, b.multiplier ?? 1);
    if (vm && id === captainId) {
      const raw = b.isCaptain ? Math.round(b.totalPoints / 2) : b.totalPoints;
      return raw * vm.captainMultiplier;
    }
    return b.totalPoints;
  };
  const cellOf = (id: string) => pointsCell(breakdown.get(id), pointsFor(id));
  const card = (id: string, size?: "md" | "sm") => {
    const p = playerOf(id);
    if (!p) return <div key={id} />;
    const cell = cellOf(id);
    return (
      <FplPlayerCard
        key={id}
        player={p}
        club={clubOf(p.clubId)}
        // A dash for "not confirmed yet" (never 0); a confirmed figure that
        // still has an item waiting carries a star, explained under the pitch.
        sub={
          cell.kind === "points" ? (
            <>
              <PopOnChange value={cell.value}>{String(cell.value)}</PopOnChange>
              {cell.waiting ? <span aria-hidden>*</span> : null}
            </>
          ) : (
            none
          )
        }
        note={
          cell.kind === "pending"
            ? t("fantasy.points.pending_label")
            : cell.kind === "points" && cell.waiting
              ? t("fantasy.points.item_pending")
              : undefined
        }
        captain={id === captainId}
        vice={id === viceId && id !== captainId}
        size={size}
      />
    );
  };
  const row = (pos: string, limit: number) =>
    startingIds
      .filter((id) => posOf(id) === pos)
      .slice(0, limit)
      .map((id) => card(id));
  const benchLabels = benchIds.map((id, index) =>
    index === 0 ? t("fpl.gkp") : `${index}. ${t(`player.pos.${posOf(id) ?? "DEF"}` as never)}`,
  );
  const squadForList: SquadPlayer[] = [
    ...startingIds.map((id, i) => ({
      playerId: id,
      slot: i + 1,
      isCaptain: id === captainId,
      isViceCaptain: id === viceId,
    })),
    ...benchIds.map((id, i) => ({ playerId: id, slot: 12 + i })),
  ];

  const total = vm?.totalPoints ?? null;
  const average = vm?.averagePoints ?? resultQ.data?.averagePoints ?? null;
  const highest = vm?.highestPoints ?? resultQ.data?.highestPoints ?? null;

  /**
   * How settled the gameweek's scoring is, read off the rows themselves: a
   * gameweek is only "final" once every line in it is. The per-player states
   * come from the server (`PlayerPointsBreakdown.status`), so this is a
   * summary of the data, not a second opinion about it.
   */
  const rowStates = new Set((vm?.breakdown ?? []).map((b) => b.status));
  const gwStatus = rowStates.has("live")
    ? "live"
    : rowStates.has("provisional")
      ? "provisional"
      : rowStates.has("final")
        ? "final"
        : null;
  const pendingCount = resultQ.data?.authoritative?.pendingItemCount ?? 0;
  // The key under the pitch and the list: only the marks actually on screen.
  const shownIds = [...startingIds, ...benchIds];
  const anyPendingCell = shownIds.some((id) => cellOf(id).kind === "pending");
  const anyWaitingCell = shownIds.some((id) => {
    const cell = cellOf(id);
    return cell.kind === "points" && cell.waiting;
  });
  const statusLabel =
    gwStatus === "live"
      ? t("fantasy.points.status.live")
      : gwStatus === "provisional"
        ? t("fantasy.points.status.provisional")
        : gwStatus === "final"
          ? t("fantasy.points.status.final")
          : undefined;

  // The chip label is spelled out branch by branch rather than interpolated
  // from the chip key: a template argument is a non-literal translation call
  // site, and the i18n gate counts those against a fixed baseline.
  const activeChipLabel =
    vm?.activeChip === "bench_boost"
      ? t("fantasy.chip.bench_boost")
      : vm?.activeChip === "triple_captain"
        ? t("fantasy.chip.triple_captain")
        : vm?.activeChip === "free_hit"
          ? t("fantasy.chip.free_hit")
          : vm?.activeChip === "wildcard"
            ? t("fantasy.chip.wildcard")
            : t("fantasy.points.no_active_chip");

  // BG-0075: the server's record of what finalization actually did, which the
  // client-side engine can only guess at for a gameweek it did not compute.
  // `vm.autoSubs` stays the fallback for mock mode, where there is no server.
  const autoSubs = resultQ.data ? resultQ.data.autoSubs : (vm?.autoSubs ?? []);
  /** One call site for every scoring category's name (the i18n gate counts them). */
  const categoryName = (category: string) => t(`fantasy.points.event.${category}` as never);
  const nameOf = (id: string) => {
    const player = playerOf(id);
    return player ? tr(player.name) : id;
  };
  const captainName = captainId ? nameOf(captainId) : none;
  // "Ma journée": finalized server results only (never mock, never provisional).
  const recap = isCloud ? buildGameweekRecap(resultQ.data, team.teamName) : null;

  return (
    <>
      <UiHeader kicker={t("fantasy.title")} title={team.teamName} backTo="/fantasy">
        <GameweekSelector
          className="mt-2 flex w-full"
          showLabel
          value={gw}
          min={min}
          max={max}
          onChange={setGw}
        />
      </UiHeader>

      {recap ? (
        <GameweekRecapCard
          recap={recap}
          nameOf={(id) => {
            const player = playerOf(id);
            return player ? tr(player.name) : null;
          }}
          currentGameweek={screen.gameweek}
          onShowDetail={() => {
            setView("list");
            document
              .getElementById("points-detail")
              ?.scrollIntoView({ behavior: scrollBehavior() });
          }}
        />
      ) : null}
      {resultQ.data?.authoritative?.incremental && (
        <p className={cn("mx-[var(--ui-gutter)] my-3", ui.text.meta, ui.tone.muted)}>
          {t("fantasy.scoring.incrementalPolicy")}
        </p>
      )}
      <FplStatBar
        hero
        items={[
          {
            label: t("fpl.points"),
            value: total === null ? none : <AnimatedNumber value={total} format={String} />,
            unit: total === null ? undefined : pointsUnit(total, t),
            sub: statusLabel ? (
              <span className="flex flex-col gap-0.5">
                <span className={cn("inline-flex items-center gap-1.5", ui.text.label)}>
                  {gwStatus === "live" ? (
                    <span
                      aria-hidden
                      className={cn(
                        "live-breathe h-1.5 w-1.5 shrink-0 bg-[color:var(--ui-live)]",
                        ui.radius.full,
                      )}
                    />
                  ) : null}
                  {statusLabel}
                </span>
                {/* "Provisoire" says the total may still move; this says why. */}
                {pendingCount > 0 ? (
                  <span className={cn(ui.text.meta, "[font-weight:var(--ui-weight-strong)]")}>
                    {pendingCountLabel(pendingCount, lang, t)}
                  </span>
                ) : null}
              </span>
            ) : undefined,
          },
          { label: t("fpl.average"), value: average ?? none },
          { label: t("fpl.highest"), value: highest ?? none },
        ]}
      />

      <div id="points-detail" className={cn("scroll-mt-20 pt-3", ui.space.gutter)}>
        <UiSegmented
          variant="pill"
          value={view}
          onChange={setView}
          label={t("fantasy.view.toggle_label")}
          options={[
            { value: "squad", label: t("fantasy.view.pitch") },
            { value: "list", label: t("fpl.list") },
          ]}
        />
      </div>

      {!resultQ.isPending && (anyPendingCell || anyWaitingCell) ? (
        // What the dash and the star on the squad mean, in the words the
        // breakdown uses. Plain meta text: nothing here is an alert.
        <ul className={cn("mx-[var(--ui-gutter)] mt-3 space-y-0.5", ui.text.meta, ui.tone.muted)}>
          {anyPendingCell ? (
            <li>
              <bdi>{none}</bdi> {t("fantasy.points.pending_label")}
            </li>
          ) : null}
          {anyWaitingCell ? (
            <li>
              <bdi>*</bdi> {t("fantasy.points.item_pending")}
            </li>
          ) : null}
        </ul>
      ) : null}

      {resultQ.isPending ? (
        <div role="status" aria-label={t("state.loading")} className={cn("pt-3", ui.space.gutter)}>
          <UiSkeleton className={cn("h-[420px] w-full", ui.radius.sheet)} />
        </div>
      ) : view === "squad" ? (
        <FplPitch
          className="mx-[var(--ui-gutter)] mt-3"
          rows={[row("GK", 1), row("DEF", cfg.DEF), row("MID", cfg.MID), row("FWD", cfg.FWD)]}
          bench={benchIds.map((id) => card(id, "sm"))}
          benchLabels={benchLabels}
        />
      ) : (
        <SquadListTable
          className="mx-[var(--ui-gutter)] mt-3"
          squad={squadForList}
          players={players}
          clubs={clubs}
          renderDetail={(player) => {
            const row = breakdown.get(player.id);
            const events = row?.events ?? [];
            const pendingItems = row?.pendingItems ?? [];
            // No confirmed figure at all: the row says so in words, since the
            // points column can only hold a dash.
            const notConfirmed = cellOf(player.id).kind === "pending";
            if (
              events.length === 0 &&
              !row?.fixtureScoring?.length &&
              pendingItems.length === 0 &&
              !notConfirmed
            )
              return null;
            const modes = row?.fixtureScoring ?? [];
            const fixtureIds = [
              ...new Set([
                ...modes.map((fixture) => fixture.fixtureId),
                ...events.map((event) => event.fixtureId),
                ...pendingItems.map((item) => item.fixtureId),
              ]),
            ];
            return (
              <ul className={cn("pb-2", ui.text.meta, ui.tone.muted)}>
                {notConfirmed ? (
                  <li className="font-semibold">{t("fantasy.points.pending_label")}</li>
                ) : null}
                {fixtureIds.map((fixtureId, groupIndex) => {
                  const fixture = modes.find((item) => item.fixtureId === fixtureId);
                  const matchName = fixture?.teamIds
                    ?.map((id) => {
                      const club = clubOf(id);
                      return club ? tr(club.shortName) : null;
                    })
                    .filter(Boolean)
                    .join(" – ");
                  return (
                    <li key={fixtureId ?? groupIndex}>
                      {fixture ? (
                        <p className="font-semibold">
                          {matchName ? `${matchName} · ` : ""}
                          {fixture.pending
                            ? t("fantasy.scoring.pending")
                            : fixture.mode === "simple"
                              ? fixture.estimated
                                ? t("fantasy.scoring.simpleEstimated")
                                : t("fantasy.scoring.simple")
                              : t("fantasy.scoring.full")}
                        </p>
                      ) : null}
                      <ul>
                        {events
                          .filter((event) => event.fixtureId === fixtureId)
                          .map((event, index) => (
                            <li
                              key={`${event.category}-${index}`}
                              className="flex items-baseline justify-between gap-2"
                            >
                              <span className="min-w-0 truncate">
                                {categoryName(event.category)}
                              </span>
                              <span
                                dir="ltr"
                                className={cn("shrink-0", ui.stat.sm, ui.tone.default)}
                              >
                                {event.points > 0 ? `+${event.points}` : event.points}
                              </span>
                            </li>
                          ))}
                        {pendingItemsOfFixture(pendingItems, fixtureId).map((item, index) => (
                          <li
                            key={`pending-${item.category}-${index}`}
                            className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5"
                          >
                            <span className="min-w-0 truncate">{categoryName(item.category)}</span>
                            <UiBadge tone="caution" className="shrink-0 px-2 py-0.5 normal-case">
                              {t("fantasy.points.item_pending")}
                            </UiBadge>
                            {mayRiseToTwo(item) ? (
                              <span className="basis-full">
                                {t("fantasy.points.appearance_may_rise")}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            );
          }}
          columns={[
            {
              key: "form",
              label: t("fpl.form"),
              // BG-0071: a dash, not 0.0, while no gameweek has scored. The
              // key is named inline, not through `none`, because the guard in
              // fantasy-runtime.test.ts reads the source line.
              render: (p) => (p.form === null ? t("fantasy.stat.none") : nf.format(p.form)),
            },
            { key: "price", label: t("fpl.current_price"), render: (p) => nf.format(p.price) },
            { key: "sel", label: t("fpl.selected"), render: (p) => `${nf.format(p.ownership)}%` },
            {
              key: "pts",
              label: `GW${gw}`,
              render: (p) => {
                const cell = cellOf(p.id);
                return cell.kind === "points"
                  ? `${cell.value}${pointsUnit(cell.value, t)}${cell.waiting ? "*" : ""}`
                  : none;
              },
              // The column a reader came for: the heavy step of the ramp,
              // not the off-token `font-extrabold` it used to carry.
              className: "[font-weight:var(--ui-weight-heavy)]",
            },
          ]}
        />
      )}

      {vm ? (
        <section className={cn("mt-6", ui.space.gutter)}>
          <SectionHeader title={t("fpl.points_overview")} />
          <UiCard padding="none" className="px-3">
            <UiKeyValueRow
              label={t("fantasy.points.effective_captain")}
              value={
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 truncate">{captainName}</span>
                  {vm.captainTookOver ? (
                    <span className={cn("shrink-0", ui.text.meta, ui.tone.muted)}>
                      {t("fantasy.points.vice_takeover")}
                    </span>
                  ) : null}
                </span>
              }
            />
            <UiKeyValueRow
              label={t("fantasy.points.multiplier")}
              value={
                // `dir="ltr"` isolates the sign from the paragraph: without
                // it "×2" reorders to "2×" inside an Arabic line, and "−4"
                // to "4−". The sign belongs to the number, not the sentence.
                <span dir="ltr" className={ui.stat.sm}>
                  {`×${vm.captainMultiplier}`}
                </span>
              }
            />
            <UiKeyValueRow
              label={t("fantasy.points.bench")}
              value={<span className={ui.stat.sm}>{vm.originalBenchPoints}</span>}
            />
            {vm.transferHitPoints !== 0 ? (
              <UiKeyValueRow
                label={t("fantasy.points.hit")}
                value={
                  <span dir="ltr" className={cn(ui.stat.sm, ui.tone.negative)}>
                    {`−${vm.transferHitPoints}`}
                  </span>
                }
              />
            ) : null}
            <UiKeyValueRow
              label={t("fantasy.points.active_chip")}
              value={activeChipLabel}
              className="border-b-0"
            />
          </UiCard>
          <Link
            to="/fantasy/rules"
            hash="scoring-policy"
            className={cn(
              "mt-2 inline-block underline underline-offset-2",
              ui.text.meta,
              ui.tone.muted,
            )}
          >
            {t("fantasy.points.how_scored")}
          </Link>
        </section>
      ) : null}

      {autoSubs.length > 0 ? (
        <section className={cn("mt-6", ui.space.gutter)}>
          <SectionHeader title={t("fantasy.points.autosubs")} />
          <UiCard padding="none">
            <ul>
              {autoSubs.map((sub) => (
                <li
                  key={`${sub.outId}-${sub.inId}`}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5",
                    ui.space.row,
                    ui.rule.block,
                    "last:border-b-0",
                    ui.text.secondary,
                    ui.tone.default,
                  )}
                >
                  {/* Out → in, with a mirrored glyph between the names: the
                      literal "→" it replaces does not turn round in Arabic,
                      so it pointed from the player coming on to the one
                      going off. `lucide-arrow-right` is mirrored in styles.css. */}
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="min-w-0 truncate">{nameOf(sub.outId)}</span>
                    <ArrowRight className={cn("h-3.5 w-3.5 shrink-0", ui.tone.muted)} aria-hidden />
                    <span className="min-w-0 truncate [font-weight:var(--ui-weight-heavy)]">
                      {nameOf(sub.inId)}
                    </span>
                  </span>
                  <span className={cn("shrink-0", ui.text.meta, ui.tone.muted)}>
                    {t(`fantasy.points.autosub_reason.${sub.reasonKey}` as never)}
                  </span>
                </li>
              ))}
            </ul>
          </UiCard>
        </section>
      ) : null}

      {resultQ.isError ? (
        <div className={cn("pt-4", ui.space.gutter)}>
          <UiErrorState body={t("fpl.error.body")} onRetry={() => void resultQ.refetch()} />
        </div>
      ) : !resultQ.isPending && !vm ? (
        <div className={cn("pt-4", ui.space.gutter)}>
          <UiEmptyState illustration={pointsPendingArt} title={t("fpl.points_not_available")} />
        </div>
      ) : null}
    </>
  );
}
