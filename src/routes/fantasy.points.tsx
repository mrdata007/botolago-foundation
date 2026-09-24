import pointsPendingArt from "@/assets/illustrations/points-pending.webp";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SectionHeader } from "@/components/common/SectionHeader";
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
import { buildPointsViewModel, type PointsViewModel } from "@/services/points-service";
import { FORMATIONS, type FormationKey, type SquadPlayer } from "@/types/fantasy";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/fantasy/points")({
  component: PointsPage,
});

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
  const [gw, setGw] = useState<number | null>(null);
  const [view, setView] = useState<"squad" | "list">("squad");
  useEffect(() => {
    if (gw === null && currentGw !== null) setGw(currentGw);
  }, [gw, currentGw]);

  const gameweeksQ = useQuery({
    queryKey: ["fantasy-gameweeks-available"],
    queryFn: () => fantasyService.getAvailableTopGameweeks(),
    enabled: screen.phase === "ready",
    staleTime: 60_000,
  });
  const resultQ = useQuery({
    queryKey: key("gw-result", gw),
    // React Query treats `undefined` as a failed fetch, so a gameweek without
    // a computed result (the normal case before the first deadline) resolves
    // to `null` and the squad still renders with en-dash plates.
    queryFn: async () => (await fantasyService.getGameweekResult(gw!)) ?? null,
    enabled: screen.phase === "ready" && gw !== null && !!team,
    retry: 1,
    retryDelay: 1_500,
  });

  const lifecycle = isCloud
    ? (owned.snapshot?.lifecycle ?? fantasyStateStore.read())
    : fantasyStateStore.read();
  const vm = useMemo<PointsViewModel | null>(() => {
    if (!team || gw === null || !resultQ.data || resultQ.data.breakdown.length === 0) return null;
    try {
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
  }, [team, gw, resultQ.data, players, lifecycle, currentGw]);

  if (screen.phase !== "ready" || !team || gw === null) {
    return (
      <>
        <UiHeader kicker={t("fantasy.title")} title={t("fpl.points")} backTo="/fantasy" />
        <FantasyScreenGate state={screen} next="/fantasy/points">
          <div />
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

  const pointsFor = (id: string) => {
    const b = breakdown.get(id);
    if (!b) return null;
    if (vm && id === captainId) {
      const raw = b.isCaptain ? Math.round(b.totalPoints / 2) : b.totalPoints;
      return raw * vm.captainMultiplier;
    }
    return b.totalPoints;
  };
  const card = (id: string) => {
    const p = playerOf(id);
    if (!p) return <div key={id} />;
    const pts = pointsFor(id);
    return (
      <FplPlayerCard
        key={id}
        player={p}
        club={clubOf(p.clubId)}
        sub={pts === null ? none : String(pts)}
        captain={id === captainId}
        vice={id === viceId && id !== captainId}
      />
    );
  };
  const row = (pos: string, limit: number) =>
    startingIds
      .filter((id) => posOf(id) === pos)
      .slice(0, limit)
      .map(card);
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
  const autoSubs = resultQ.data?.autoSubs.length ? resultQ.data.autoSubs : (vm?.autoSubs ?? []);
  const nameOf = (id: string) => {
    const player = playerOf(id);
    return player ? tr(player.name) : id;
  };
  const captainName = captainId ? nameOf(captainId) : none;

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

      <FplStatBar
        hero
        items={[
          {
            label: t("fpl.points"),
            value: total ?? none,
            unit: total === null ? undefined : t("fantasy.points.abbr"),
            sub: statusLabel ? (
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
            ) : undefined,
          },
          { label: t("fpl.average"), value: average ?? none },
          { label: t("fpl.highest"), value: highest ?? none },
        ]}
      />

      <div className={cn("pt-3", ui.space.gutter)}>
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

      {resultQ.isPending ? (
        <div role="status" aria-label={t("state.loading")} className={cn("pt-3", ui.space.gutter)}>
          <UiSkeleton className={cn("h-[420px] w-full", ui.radius.sheet)} />
        </div>
      ) : view === "squad" ? (
        <FplPitch
          className="mx-[var(--ui-gutter)] mt-3"
          rows={[row("GK", 1), row("DEF", cfg.DEF), row("MID", cfg.MID), row("FWD", cfg.FWD)]}
          bench={benchIds.map(card)}
          benchLabels={benchLabels}
        />
      ) : (
        <SquadListTable
          className="mx-[var(--ui-gutter)] mt-3"
          squad={squadForList}
          players={players}
          clubs={clubs}
          renderDetail={(player) => {
            const events = breakdown.get(player.id)?.events ?? [];
            if (events.length === 0) return null;
            return (
              <ul className={cn("pb-2", ui.text.meta, ui.tone.muted)}>
                {events.map((event, index) => (
                  <li
                    key={`${event.category}-${event.fixtureId ?? index}`}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="min-w-0 truncate">
                      {t(`fantasy.points.event.${event.category}` as never)}
                    </span>
                    <span dir="ltr" className={cn("shrink-0", ui.stat.sm, ui.tone.default)}>
                      {event.points > 0 ? `+${event.points}` : event.points}
                    </span>
                  </li>
                ))}
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
                const pts = pointsFor(p.id);
                return pts === null ? none : `${pts}${t("fantasy.points.abbr")}`;
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
