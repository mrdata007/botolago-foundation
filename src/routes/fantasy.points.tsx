import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fantasyService } from "@/services/fantasy-mock";
import { botolaService } from "@/services/mock";
import { LoadingState } from "@/components/common/States";
import { GameweekSelector } from "@/components/fantasy/GameweekSelector";
import { Pitch } from "@/components/fantasy/Pitch";
import { PlayerShirt } from "@/components/fantasy/PlayerShirt";
import { SectionHeader } from "@/components/common/SectionHeader";
import { useI18n } from "@/i18n/provider";
import type { PointsEventKind } from "@/types/fantasy";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";

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

function PointsPage() {
  const { t, tr } = useI18n();
  const [gw, setGw] = useState(14);
  const gwResult = useQuery({ queryKey: ["gw-result", gw], queryFn: () => fantasyService.getGameweekResult(gw) });
  const historyQ = useQuery({ queryKey: ["gw-history"], queryFn: () => fantasyService.getGameweekHistory() });
  const teamQ = useQuery({ queryKey: ["fantasy-team"], queryFn: () => fantasyService.getTeam() });
  const playersQ = useQuery({ queryKey: ["fantasy-players"], queryFn: () => fantasyService.getPlayers() });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });

  if (!gwResult.data || !teamQ.data || !playersQ.data || !clubsQ.data) return <LoadingState />;
  const result = gwResult.data;
  const players = playersQ.data;
  const clubs = clubsQ.data;
  const playerOf = (id: string) => players.find((p) => p.id === id)!;
  const clubOf = (cid: string) => clubs.find((c) => c.id === cid);

  const xiBreakdown = result.breakdown.filter((b) => !b.isBench);
  const benchBreakdown = result.breakdown.filter((b) => b.isBench);

  const gk = xiBreakdown.filter((b) => playerOf(b.playerId).position === "GK");
  const def = xiBreakdown.filter((b) => playerOf(b.playerId).position === "DEF");
  const mid = xiBreakdown.filter((b) => playerOf(b.playerId).position === "MID");
  const fwd = xiBreakdown.filter((b) => playerOf(b.playerId).position === "FWD");

  const shirtOf = (b: typeof xiBreakdown[number]) => {
    const p = playerOf(b.playerId);
    return (
      <PlayerShirt
        player={p}
        club={clubOf(p.clubId)}
        metric={String(b.totalPoints)}
        captain={b.isCaptain}
        vice={b.isViceCaptain}
      />
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-foreground">{t("fantasy.points.title")}</h1>
        <GameweekSelector value={gw} min={11} max={14} onChange={setGw} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={t("fantasy.points.total")} value={String(result.totalPoints)} accent />
        <Stat label={t("fantasy.points.bench")} value={String(result.benchPoints)} />
        <Stat label={t("fantasy.average")} value={String(result.averagePoints)} />
      </div>

      {gk[0] && (
        <div className="mt-4">
          <Pitch
            gk={shirtOf(gk[0])}
            def={def.map(shirtOf)}
            mid={mid.map(shirtOf)}
            fwd={fwd.map(shirtOf)}
            bench={benchBreakdown.map(shirtOf)}
            benchLabel={t("fantasy.bench")}
          />
        </div>
      )}

      <SectionHeader title={t("fantasy.points.auto_subs")} />
      <div className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] p-3 text-xs text-muted-foreground">
        {result.autoSubs.length === 0 ? t("fantasy.points.no_auto_subs") : (
          <ul className="grid gap-1">
            {result.autoSubs.map((s, i) => (
              <li key={i}>{tr(s.reason)}: {tr(playerOf(s.outId).name)} → {tr(playerOf(s.inId).name)}</li>
            ))}
          </ul>
        )}
      </div>

      <SectionHeader title={t("fantasy.points.breakdown")} />
      <ul className="grid gap-1.5">
        {result.breakdown.map((b) => {
          const p = playerOf(b.playerId);
          return (
            <li key={b.playerId} className="rounded-xl bg-white/60 p-3 ring-1 ring-black/5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-black text-white" style={{ background: clubOf(p.clubId)?.primaryColor }}>
                    {clubOf(p.clubId)?.crestPlaceholder}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-foreground">
                      {tr(p.name)}
                      {b.isCaptain && <span className="ms-1.5 rounded bg-[color:var(--brand-accent)] px-1 py-0.5 text-[9px] font-black text-white">{t("fantasy.captain")}</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      <StatusPill status={b.status} /> · {b.minutesPlayed}′
                    </div>
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-lg font-black tabular-nums text-foreground">{b.totalPoints}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">pts</div>
                </div>
              </div>
              {b.events.length > 0 && (
                <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                  {b.events.map((e, i) => (
                    <li key={i} className="flex items-center justify-between text-muted-foreground">
                      <span>{t(eventLabelKey[e.kind])}{e.count && e.count > 1 ? ` ×${e.count}` : ""}</span>
                      <span className={cn("tabular-nums font-bold", e.points > 0 ? "text-emerald-700" : e.points < 0 ? "text-red-700" : "text-foreground")}>
                        {e.points > 0 ? `+${e.points * (e.count ?? 1)}` : e.points * (e.count ?? 1)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <SectionHeader title={t("fantasy.points.history")} />
      <div className="grid gap-2 sm:grid-cols-2">
        {historyQ.data?.map((h) => (
          <button
            key={h.gameweek}
            onClick={() => setGw(h.gameweek)}
            className={cn(
              "glass-surface glass-regular flex items-center justify-between rounded-2xl border border-[var(--glass-border)] px-3 py-2 text-start",
              gw === h.gameweek && "ring-2 ring-[color:var(--brand-accent)]",
            )}
          >
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("fantasy.points.gameweek")}</div>
              <div className="text-sm font-black text-foreground">{h.gameweek}</div>
            </div>
            <div className="text-end">
              <div className="text-lg font-black tabular-nums text-foreground">{h.totalPoints}</div>
              <div className="text-[10px] uppercase text-muted-foreground">pts</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] px-2 py-2 text-center">
      <div className={cn("text-xl font-black tabular-nums", accent ? "text-[color:var(--brand-accent)]" : "text-foreground")}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusPill({ status }: { status: "provisional" | "live" | "final" }) {
  const { t } = useI18n();
  return (
    <span className={cn(
      "inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase",
      status === "live" && "bg-red-500/15 text-red-700",
      status === "provisional" && "bg-amber-500/15 text-amber-800",
      status === "final" && "bg-emerald-500/15 text-emerald-800",
    )}>
      {t(`fantasy.points.status.${status}` as TranslationKey)}
    </span>
  );
}
