import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { FplPitch } from "@/components/fpl/FplPitch";
import { FplPlayerCard } from "@/components/fpl/FplPlayerCard";
import { SquadListTable } from "@/components/fpl/SquadListTable";
import { FplHeader, FplSegmented } from "@/components/fpl/primitives";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import { useI18n } from "@/i18n/provider";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyService } from "@/services/fantasy-runtime";
import { fantasyStateStore } from "@/services/fantasy-state";
import { buildPointsViewModel, type PointsViewModel } from "@/services/points-service";
import { FORMATIONS, type FormationKey, type SquadPlayer } from "@/types/fantasy";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/fantasy/points")({
  component: PointsPage,
});

/**
 * FPL-018/019 "Team detail" (points) reconstructed: Back header with the team
 * name, the "‹ Gameweek N ›" selector, Squad/List control, the
 * Average / Points / Highest strip and the pitch with points plates.
 */
function PointsPage() {
  return (
    <FantasyFrame>
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
    // to `null` and the squad still renders with "—" plates.
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
        <FplHeader title={t("fpl.points")} backTo="/fantasy" />
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
  const clubOf = (id: string) => clubs.find((c) => c.id === id);
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
        sub={pts === null ? "—" : String(pts)}
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
  // BG-0075: the server's record of what finalization actually did, which the
  // client-side engine can only guess at for a gameweek it did not compute.
  // `vm.autoSubs` stays the fallback for mock mode, where there is no server.
  const autoSubs = resultQ.data?.autoSubs.length ? resultQ.data.autoSubs : (vm?.autoSubs ?? []);
  const nameOf = (id: string) => {
    const player = playerOf(id);
    return player ? tr(player.name) : id;
  };

  return (
    <>
      <FplHeader title={team.teamName} backTo="/fantasy">
        <div className="mt-2 flex items-center justify-between rounded-[10px] bg-white/35 px-1 py-1">
          <button
            type="button"
            onClick={() => setGw(Math.max(min, gw - 1))}
            disabled={gw <= min}
            aria-label={`${t("fpl.gameweek")} ${gw - 1}`}
            className="grid h-9 w-9 place-items-center rounded-[8px] bg-white/60 text-[color:var(--fpl-ink)] disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <span className="text-[17px] font-extrabold text-[color:var(--fpl-ink)]">
            {t("fpl.gameweek")} {gw}
          </span>
          <button
            type="button"
            onClick={() => setGw(Math.min(max, gw + 1))}
            disabled={gw >= max}
            aria-label={`${t("fpl.gameweek")} ${gw + 1}`}
            className="grid h-9 w-9 place-items-center rounded-[8px] bg-white/60 text-[color:var(--fpl-ink)] disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <FplSegmented
          className="mt-2"
          value={view}
          onChange={setView}
          options={[
            { value: "squad", label: t("fpl.squad") },
            { value: "list", label: t("fpl.list") },
          ]}
        />
      </FplHeader>

      <div className="grid grid-cols-3 items-end bg-white px-4 py-3 text-center">
        <div>
          <div className="fpl-tabular text-[22px] font-bold text-[color:var(--fpl-ink-deep)]">
            {average ?? "—"}
          </div>
          <div className="text-[12px] text-[color:var(--fpl-grey-text)]">{t("fpl.average")}</div>
        </div>
        <div>
          <div className="fpl-tabular text-[38px] font-black leading-none text-[color:var(--fpl-ink)]">
            {total ?? "—"}
          </div>
          <div className="text-[12px] font-bold text-[color:var(--fpl-ink-deep)]">
            {t("fpl.points")}
          </div>
        </div>
        <div>
          <div className="fpl-tabular inline-flex items-center gap-1 text-[22px] font-bold text-[color:var(--fpl-ink-deep)]">
            {highest ?? "—"} <ArrowRight className="h-4 w-4" aria-hidden />
          </div>
          <div className="text-[12px] text-[color:var(--fpl-grey-text)]">{t("fpl.highest")}</div>
        </div>
      </div>

      {resultQ.isPending ? (
        <div
          role="status"
          className="h-[420px] animate-pulse bg-[color:var(--fpl-pitch-a)]/40 motion-reduce:animate-none"
        />
      ) : view === "squad" ? (
        <FplPitch
          rows={[row("GK", 1), row("DEF", cfg.DEF), row("MID", cfg.MID), row("FWD", cfg.FWD)]}
          bench={benchIds.map(card)}
          benchLabels={benchLabels}
        />
      ) : (
        <SquadListTable
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
                    <span className={cn("shrink-0", ui.text.tabular)}>
                      {event.points > 0 ? `+${event.points}` : event.points}
                    </span>
                  </li>
                ))}
              </ul>
            );
          }}
          columns={[
            { key: "form", label: t("fpl.form"), render: (p) => p.form.toFixed(1) },
            { key: "price", label: t("fpl.current_price"), render: (p) => nf.format(p.price) },
            { key: "sel", label: t("fpl.selected"), render: (p) => `${p.ownership.toFixed(1)}%` },
            {
              key: "pts",
              label: `GW${gw}`,
              render: (p) => (pointsFor(p.id) === null ? "—" : `${pointsFor(p.id)}pts`),
              className: "font-extrabold",
            },
          ]}
        />
      )}
      {autoSubs.length > 0 ? (
        <section className={cn("px-4 py-3", ui.surface.sunken)}>
          <h2 className={cn(ui.text.label, ui.tone.muted)}>{t("fantasy.points.autosubs")}</h2>
          <ul className="mt-2 grid gap-1">
            {autoSubs.map((sub) => (
              <li
                key={`${sub.outId}-${sub.inId}`}
                className={cn("flex items-baseline gap-2", ui.text.secondary, ui.tone.default)}
              >
                <ArrowRight className="h-3.5 w-3.5 shrink-0 rtl:-scale-x-100" aria-hidden />
                <span className="min-w-0 truncate">
                  {nameOf(sub.outId)} → {nameOf(sub.inId)}
                </span>
                <span className={cn("ms-auto shrink-0", ui.text.meta, ui.tone.muted)}>
                  {t(`fantasy.points.autosub_reason.${sub.reasonKey}` as never)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {resultQ.isError ? (
        <div className="flex flex-col items-center gap-2 px-4 py-3 text-center text-[13px] text-[color:var(--fpl-grey-text)]">
          <span>{t("fpl.error.body")}</span>
          <button
            type="button"
            onClick={() => void resultQ.refetch()}
            className="rounded-[4px] bg-[color:var(--fpl-ink)] px-3 py-1.5 text-[13px] font-bold text-white"
          >
            {t("state.retry")}
          </button>
        </div>
      ) : !resultQ.isPending && !vm ? (
        <p className="px-4 py-3 text-center text-[13px] text-[color:var(--fpl-grey-text)]">
          {t("fpl.points_not_available")}
        </p>
      ) : null}
    </>
  );
}
