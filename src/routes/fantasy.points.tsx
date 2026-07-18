import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { fantasyService } from "@/services/fantasy-mock";
import { botolaService } from "@/services/mock";
import { LoadingState } from "@/components/common/States";
import { GameweekSelector } from "@/components/fantasy/GameweekSelector";
import { Pitch } from "@/components/fantasy/Pitch";
import { PlayerShirt } from "@/components/fantasy/PlayerShirt";
import { SquadListToggle, type SquadViewMode } from "@/components/fantasy/SquadListToggle";
import { SquadListView } from "@/components/fantasy/SquadListView";
import { FantasyChipsRow, type FantasyChip } from "@/components/fantasy/FantasyChipCard";
import { SectionHeader } from "@/components/common/SectionHeader";
import { useI18n } from "@/i18n/provider";
import type { PlayerPointsBreakdown, PointsEventKind } from "@/types/fantasy";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";
import { fantasyStateStore, type FantasyPersistedState } from "@/services/fantasy-state";
import {
  buildLegacyViewModel,
  buildPointsViewModel,
  type PointsViewModel,
} from "@/services/points-service";
import { advanceGameweek, finalizeGameweek } from "@/services/lifecycle-service";
import { chipDisplayState, evaluateDeadline, type ChipKey } from "@/lib/fantasy-engine";
import { toast } from "sonner";
import { RefreshCcw, ArrowDown, ArrowUp, Lock as LockIcon, ChevronRight } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/auth/AuthProvider";

export const Route = createFileRoute("/fantasy/points")({
  component: PointsPage,
});

const eventLabelKey: Record<PointsEventKind, TranslationKey> = {
  appearance: "fantasy.events.appearance",
  "60min": "fantasy.events.60min",
  goal: "fantasy.events.goal",
  assist: "fantasy.events.assist",
  clean_sheet: "fantasy.events.clean_sheet",
  yellow: "fantasy.events.yellow",
  red: "fantasy.events.red",
  penalty_save: "fantasy.events.penalty_save",
  penalty_miss: "fantasy.events.penalty_miss",
  own_goal: "fantasy.events.own_goal",
  conceded: "fantasy.events.conceded",
  saves: "fantasy.events.saves",
  bonus: "fantasy.events.bonus",
};

const CHIP_KEYS: ChipKey[] = ["bench_boost", "free_hit", "triple_captain", "wildcard"];

function PointsPage() {
  const { t, tr } = useI18n();
  const qc = useQueryClient();
  const { requireAuth } = useAuth();
  const [state, setState] = useState<FantasyPersistedState>(() => fantasyStateStore.read());
  const [gw, setGw] = useState(() => state.currentGameweek);
  const [view, setView] = useState<SquadViewMode>("squad");
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmAdvance, setConfirmAdvance] = useState(false);

  useEffect(() => {
    const onEvt = () => setState(fantasyStateStore.read());
    window.addEventListener("botolago:storage", onEvt);
    window.addEventListener("storage", onEvt);
    return () => {
      window.removeEventListener("botolago:storage", onEvt);
      window.removeEventListener("storage", onEvt);
    };
  }, []);

  const currentGwQ = useQuery({ queryKey: ["current-gw"], queryFn: () => botolaService.getCurrentGameweek() });
  const gwResultQ = useQuery({ queryKey: ["gw-result", gw], queryFn: () => fantasyService.getGameweekResult(gw) });
  const historyQ = useQuery({ queryKey: ["gw-history"], queryFn: () => fantasyService.getGameweekHistory() });
  const teamQ = useQuery({ queryKey: ["fantasy-team"], queryFn: () => fantasyService.getTeam() });
  const playersQ = useQuery({ queryKey: ["fantasy-players"], queryFn: () => fantasyService.getPlayers() });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });

  const currentGw = currentGwQ.data?.number ?? state.currentGameweek;
  const isCurrent = gw === currentGw;
  const deadline = currentGwQ.data ? evaluateDeadline(currentGwQ.data.deadline) : null;
  const deadlineLocked = deadline?.isLocked ?? false;

  // Compute VM for the selected gameweek.
  const vm: PointsViewModel | null | "error" = useMemo(() => {
    if (!teamQ.data || !playersQ.data) return null;
    const persisted = state.results[gw];
    if (persisted) return persisted;

    const raw = gwResultQ.data;
    if (!raw) return null;

    const originalBenchIds = teamQ.data.squad
      .filter((s) => s.slot >= 12)
      .sort((a, b) => a.slot - b.slot)
      .map((s) => s.playerId);
    const originalStartingIds = teamQ.data.squad
      .filter((s) => s.slot < 12)
      .sort((a, b) => a.slot - b.slot)
      .map((s) => s.playerId);

    // Legacy fallback: mock rows without a breakdown remain distinct from engine-computed results.
    if (!raw.breakdown.length) {
      return buildLegacyViewModel(raw, originalBenchIds, originalStartingIds);
    }

    try {
      return buildPointsViewModel({
        gameweek: gw,
        team: teamQ.data,
        players: playersQ.data,
        chips: isCurrent ? state.chips : { active: null, used: [] },
        transferHitPoints: isCurrent ? state.transferHitPoints : 0,
        breakdown: raw.breakdown,
        averagePoints: raw.averagePoints,
        highestPoints: raw.highestPoints,
      });
    } catch {
      return "error";
    }
  }, [teamQ.data, playersQ.data, gwResultQ.data, state, gw, isCurrent]);

  if (!teamQ.data || !playersQ.data || !clubsQ.data || gwResultQ.isPending || currentGwQ.isPending) {
    return <LoadingState />;
  }

  if (vm === "error") {
    return (
      <div
        role="alert"
        className="glass-surface glass-regular mt-6 rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm font-semibold text-red-800"
      >
        {t("fantasy.points.error")}
      </div>
    );
  }
  if (!vm) {
    return (
      <div className="glass-surface glass-regular mt-6 rounded-2xl border border-[var(--glass-border)] p-4 text-sm text-muted-foreground">
        {t("fantasy.points.empty")}
      </div>
    );
  }

  const players = playersQ.data;
  const clubs = clubsQ.data;
  const playerOf = (id: string) => players.find((p) => p.id === id)!;
  const clubOf = (cid: string) => clubs.find((c) => c.id === cid);
  const breakdownById = new Map(vm.breakdown.map((b) => [b.playerId, b]));

  // Effective XI positions (respect auto-subs).
  const xiForPitch = vm.effectiveStartingIds.map((id) => playerOf(id));
  const gk = xiForPitch.filter((p) => p.position === "GK");
  const def = xiForPitch.filter((p) => p.position === "DEF");
  const mid = xiForPitch.filter((p) => p.position === "MID");
  const fwd = xiForPitch.filter((p) => p.position === "FWD");

  // Bench for display: original bench, marked so users see who came on.
  const benchIdsForDisplay = vm.originalBenchIds;
  const cameOnIds = new Set(vm.autoSubs.map((s) => s.inId));
  const subbedOffIds = new Set(vm.autoSubs.map((s) => s.outId));
  const captainDeclaredId = teamQ.data.squad.find((s) => s.isCaptain)?.playerId;

  const shirtFor = (playerId: string) => {
    const p = playerOf(playerId);
    const b = breakdownById.get(playerId);
    const metricNum = b?.totalPoints ?? 0;
    // Apply captain multiplier live when engine has a captain.
    const isCap = vm.effectiveCaptainId === playerId;
    const rawBase = b?.isCaptain ? Math.round((b.totalPoints ?? 0) / 2) : (b?.totalPoints ?? 0);
    const shown = isCap ? rawBase * vm.captainMultiplier : metricNum;
    return (
      <PlayerShirt
        player={p}
        club={clubOf(p.clubId)}
        metric={String(shown)}
        captain={isCap}
        vice={p.id === teamQ.data.squad.find((s) => s.isViceCaptain)?.playerId}
      />
    );
  };

  const activeChip: ChipKey | null = vm.activeChip;
  const chips: FantasyChip[] = CHIP_KEYS.map((key) => ({
    key,
    state: chipDisplayState(isCurrent ? state.chips : { active: activeChip, used: [] }, key),
  }));

  const chipLabelKey: TranslationKey | null = activeChip
    ? (`fantasy.chip.${activeChip}` as TranslationKey)
    : null;

  const canRecompute = isCurrent && deadlineLocked;

  const onRecompute = () => {
    if (!canRecompute) {
      toast.error(t("fantasy.points.recompute_locked"));
      return;
    }
    const raw = gwResultQ.data;
    if (!raw?.breakdown.length || !teamQ.data || !playersQ.data) return;
    const fresh = buildPointsViewModel({
      gameweek: gw,
      team: teamQ.data,
      players: playersQ.data,
      chips: state.chips,
      transferHitPoints: state.transferHitPoints,
      breakdown: raw.breakdown,
      averagePoints: raw.averagePoints,
      highestPoints: raw.highestPoints,
    });
    fantasyStateStore.saveResult(gw, fresh);
    setState(fantasyStateStore.read());
    toast.success(t("fantasy.points.recomputed"));
  };

  const finalized = !!vm.finalized;

  const doFinalize = () => {
    requireAuth(() => {
      if (!isCurrent) { toast.error(t("fantasy.points.lifecycle_error")); return; }
      if (finalized) { toast.error(t("fantasy.points.already_finalized")); return; }
      if (!deadlineLocked) { toast.error(t("fantasy.deadline.open")); return; }
      const raw = gwResultQ.data;
      if (!raw?.breakdown.length || !teamQ.data || !playersQ.data) {
        toast.error(t("fantasy.points.lifecycle_error"));
        return;
      }
      try {
        const out = finalizeGameweek({
          gameweek: gw,
          team: teamQ.data,
          players: playersQ.data,
          breakdown: raw.breakdown,
          averagePoints: raw.averagePoints,
          highestPoints: raw.highestPoints,
        });
        setState(fantasyStateStore.read());
        qc.invalidateQueries({ queryKey: ["fantasy-team"] });
        qc.invalidateQueries({ queryKey: ["fantasy-summary"] });
        qc.invalidateQueries({ queryKey: ["gw-result", gw] });
        if (out.freeHitRestored) toast.success(t("fantasy.points.free_hit_restored"));
        else toast.success(t("fantasy.points.finalize_success"));
      } catch {
        toast.error(t("fantasy.points.lifecycle_error"));
      }
    });
    setConfirmFinalize(false);
  };

  const doAdvance = () => {
    requireAuth(() => {
      if (!teamQ.data) return;
      const target = currentGw + 1;
      const res = advanceGameweek({ targetGameweek: target, team: teamQ.data });
      if (!res.ok) {
        toast.error(t(res.error === "must_finalize_first" ? "fantasy.points.must_finalize_first" : "fantasy.points.lifecycle_error"));
        return;
      }
      setState(fantasyStateStore.read());
      setGw(target);
      qc.invalidateQueries({ queryKey: ["fantasy-team"] });
      qc.invalidateQueries({ queryKey: ["fantasy-summary"] });
      qc.invalidateQueries({ queryKey: ["current-gw"] });
      toast.success(t("fantasy.points.advance_success"));
    });
    setConfirmAdvance(false);
  };

  const effectiveCaptainName = vm.effectiveCaptainId ? tr(playerOf(vm.effectiveCaptainId).name) : "—";

  // History: prefer persisted results when available; fall back to legacy mock rows.
  const historyItems = (historyQ.data ?? []).map((h) => {
    const stored = state.results[h.gameweek];
    return {
      gameweek: h.gameweek,
      totalPoints: stored?.totalPoints ?? h.totalPoints,
      source: (stored ? "engine" : "legacy_mock") as "engine" | "legacy_mock",
    };
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-foreground">
          <span className="text-brand">{t("fantasy.points.title")}</span>
        </h1>
        <GameweekSelector value={gw} min={11} max={14} onChange={setGw} />
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
            vm.source === "engine"
              ? "bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]"
              : "bg-amber-500/15 text-amber-800",
          )}
        >
          {vm.source === "engine" ? t("fantasy.points.engine_source") : t("fantasy.points.legacy_source")}
        </span>
        {isCurrent && vm.source === "engine" && (
          <button
            type="button"
            onClick={onRecompute}
            disabled={!canRecompute}
            className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-foreground ring-1 ring-black/10 disabled:opacity-50"
            aria-label={t("fantasy.points.recompute")}
          >
            <RefreshCcw className="h-3 w-3" aria-hidden /> {t("fantasy.points.recompute")}
          </button>
        )}
        {finalized && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-800"
            role="status"
          >
            <LockIcon className="h-3 w-3" aria-hidden />
            {t("fantasy.points.finalized_badge")}
          </span>
        )}
        {isCurrent && !finalized && deadlineLocked && vm.source === "engine" && (
          <button
            type="button"
            onClick={() => setConfirmFinalize(true)}
            className="inline-flex items-center gap-1 rounded-full bg-[color:var(--brand-primary)] px-2 py-0.5 text-[10px] font-bold text-white ring-1 ring-black/10"
          >
            <LockIcon className="h-3 w-3" aria-hidden /> {t("fantasy.points.finalize")}
          </button>
        )}
        {isCurrent && finalized && (
          <button
            type="button"
            onClick={() => setConfirmAdvance(true)}
            className="inline-flex items-center gap-1 rounded-full bg-[color:var(--brand-primary)] px-2 py-0.5 text-[10px] font-bold text-white ring-1 ring-black/10"
          >
            {t("fantasy.points.advance")} <ChevronRight className="h-3 w-3 rtl:rotate-180" aria-hidden />
          </button>
        )}
      </div>

      <AlertDialog open={confirmFinalize} onOpenChange={setConfirmFinalize}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("fantasy.points.finalize_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("fantasy.points.finalize_confirm_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doFinalize}>{t("fantasy.points.finalize")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAdvance} onOpenChange={setConfirmAdvance}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("fantasy.points.advance_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("fantasy.points.advance_confirm_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doAdvance}>{t("fantasy.points.advance")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={t("fantasy.points.total")} value={String(vm.totalPoints)} accent />
        <Stat label={t("fantasy.points.raw_xi")} value={String(vm.rawXiPoints)} />
        <Stat label={t("fantasy.points.bench")} value={String(vm.originalBenchPoints)} />
      </div>

      {vm.source === "engine" && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label={t("fantasy.points.captain_bonus")} value={`+${vm.captainBonus}`} />
          <MiniStat label={t("fantasy.points.hit")} value={vm.transferHitPoints ? `−${vm.transferHitPoints}` : "0"} tone={vm.transferHitPoints ? "danger" : undefined} />
          {vm.benchBoostContribution > 0 && (
            <MiniStat label={t("fantasy.points.bench_boost_contrib")} value={`+${vm.benchBoostContribution}`} tone="accent" />
          )}
          {vm.tripleCaptainContribution > 0 && (
            <MiniStat label={t("fantasy.points.triple_captain_contrib")} value={`+${vm.tripleCaptainContribution * (vm.captainMultiplier - 1)}`} tone="accent" />
          )}
          <MiniStat
            label={t("fantasy.points.effective_captain")}
            value={effectiveCaptainName}
            hint={`×${vm.captainMultiplier}${vm.captainTookOver ? ` · ${t("fantasy.points.vice_takeover")}` : ""}`}
          />
          <MiniStat
            label={t("fantasy.points.active_chip")}
            value={chipLabelKey ? t(chipLabelKey) : t("fantasy.points.no_active_chip")}
          />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <SquadListToggle value={view} onChange={setView} />
      </div>

      <div className="mt-2">
        <FantasyChipsRow chips={chips} />
      </div>

      {view === "squad" && gk[0] && (
        <div className="mt-3">
          <Pitch
            gk={shirtFor(gk[0].id)}
            def={def.map((p) => shirtFor(p.id))}
            mid={mid.map((p) => shirtFor(p.id))}
            fwd={fwd.map((p) => shirtFor(p.id))}
            bench={benchIdsForDisplay.map((id) => shirtFor(id))}
            benchLabel={t("fantasy.bench")}
          />
        </div>
      )}

      {view === "list" && (
        <div className="mt-3">
          <SquadListView
            squad={teamQ.data.squad}
            players={players}
            clubs={clubs}
            metricFor={(id) => breakdownById.get(id)?.totalPoints}
            metricLabel={t("fantasy.points.total")}
          />
        </div>
      )}

      <SectionHeader title={t("fantasy.points.auto_subs")} />
      <div className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] p-3 text-xs">
        {vm.autoSubs.length === 0 ? (
          <span className="text-muted-foreground">{t("fantasy.points.no_auto_subs")}</span>
        ) : (
          <ul className="grid gap-1.5">
            {vm.autoSubs.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-800">
                  <ArrowDown className="h-3 w-3" aria-hidden /> {tr(playerOf(s.outId).name)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  <ArrowUp className="h-3 w-3" aria-hidden /> {tr(playerOf(s.inId).name)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  · {t(s.reasonKey as TranslationKey)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {vm.breakdown.length > 0 && (
        <>
          <SectionHeader title={t("fantasy.points.breakdown")} />
          <ul className="grid gap-1.5">
            {vm.breakdown.map((b) => {
              const p = playerOf(b.playerId);
              const isEffCap = vm.effectiveCaptainId === b.playerId;
              const displayPoints = isEffCap
                ? (b.isCaptain ? Math.round(b.totalPoints / 2) : b.totalPoints) * vm.captainMultiplier
                : b.totalPoints;
              const onBench = benchIdsForDisplay.includes(b.playerId);
              const cameOn = cameOnIds.has(b.playerId);
              const subbedOff = subbedOffIds.has(b.playerId);
              return (
                <li key={b.playerId} className="rounded-xl bg-white/60 p-3 ring-1 ring-black/5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-black text-white"
                        style={{ background: clubOf(p.clubId)?.primaryColor }}
                      >
                        {clubOf(p.clubId)?.crestPlaceholder}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-bold text-foreground">{tr(p.name)}</span>
                          {isEffCap && (
                            <span className="rounded bg-[color:var(--brand-accent)] px-1 py-0.5 text-[9px] font-black text-white">
                              {t("fantasy.captain")}
                              {vm.captainMultiplier > 1 ? ` ×${vm.captainMultiplier}` : ""}
                            </span>
                          )}
                          {captainDeclaredId === b.playerId && !isEffCap && (
                            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-black text-muted-foreground">
                              {t("fantasy.captain")}
                            </span>
                          )}
                          {cameOn && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-black text-emerald-800">
                              <ArrowUp className="h-2.5 w-2.5" aria-hidden />
                              {t("fantasy.points.subbed_on")}
                            </span>
                          )}
                          {subbedOff && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-black text-red-800">
                              <ArrowDown className="h-2.5 w-2.5" aria-hidden />
                              {t("fantasy.points.subbed_off")}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          <StatusPill status={b.status} /> · {b.minutesPlayed}′{onBench ? ` · ${t("fantasy.bench")}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-lg font-black tabular-nums text-foreground">{displayPoints}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">{t("fantasy.points.abbr")}</div>
                    </div>
                  </div>
                  {b.events.length > 0 && <EventGrid b={b} />}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <SectionHeader title={t("fantasy.points.history")} />
      <div className="grid gap-2 sm:grid-cols-2">
        {historyItems.map((h) => (
          <button
            key={h.gameweek}
            onClick={() => setGw(h.gameweek)}
            className={cn(
              "glass-surface glass-regular flex items-center justify-between rounded-2xl border border-[var(--glass-border)] px-3 py-2 text-start",
              gw === h.gameweek && "ring-2 ring-[color:var(--brand-accent)]",
            )}
          >
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t("fantasy.points.gameweek")}
              </div>
              <div className="text-sm font-black text-foreground">{h.gameweek}</div>
              <div
                className={cn(
                  "mt-0.5 text-[9px] font-bold uppercase",
                  h.source === "engine" ? "text-[color:var(--brand-primary)]" : "text-amber-700",
                )}
              >
                {h.source === "engine" ? t("fantasy.points.engine_source") : t("fantasy.points.legacy_source")}
              </div>
            </div>
            <div className="text-end">
              <div className="text-lg font-black tabular-nums text-foreground">{h.totalPoints}</div>
              <div className="text-[10px] uppercase text-muted-foreground">{t("fantasy.points.abbr")}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function EventGrid({ b }: { b: PlayerPointsBreakdown }) {
  const { t } = useI18n();
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
      {b.events.map((e, i) => (
        <li key={i} className="flex items-center justify-between text-muted-foreground">
          <span>
            {t(eventLabelKey[e.kind])}
            {e.count && e.count > 1 ? ` ×${e.count}` : ""}
          </span>
          <span
            className={cn(
              "tabular-nums font-bold",
              e.points > 0 ? "text-emerald-700" : e.points < 0 ? "text-red-700" : "text-foreground",
            )}
          >
            {e.points > 0 ? `+${e.points * (e.count ?? 1)}` : e.points * (e.count ?? 1)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] px-2 py-2 text-center">
      <div
        className={cn(
          "text-xl font-black tabular-nums",
          accent ? "text-[color:var(--brand-accent)]" : "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "accent" | "danger";
}) {
  return (
    <div className="glass-surface glass-regular rounded-xl border border-[var(--glass-border)] px-2 py-1.5">
      <div
        className={cn(
          "truncate text-sm font-black tabular-nums",
          tone === "accent" && "text-[color:var(--brand-accent)]",
          tone === "danger" && "text-red-700",
          !tone && "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {hint && <div className="mt-0.5 text-[9px] font-semibold text-muted-foreground">{hint}</div>}
    </div>
  );
}

function StatusPill({ status }: { status: "provisional" | "live" | "final" }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase",
        status === "live"
          ? "bg-red-500/15 text-red-700"
          : status === "final"
            ? "bg-emerald-500/15 text-emerald-700"
            : "bg-muted text-muted-foreground",
      )}
    >
      {t(`fantasy.points.status.${status}` as TranslationKey)}
    </span>
  );
}
