import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { botolaService } from "@/services/mock";
import { fantasyService } from "@/services/fantasy-mock";
import { Pitch } from "@/components/fantasy/Pitch";
import { PlayerShirt } from "@/components/fantasy/PlayerShirt";
import { GameweekSelector } from "@/components/fantasy/GameweekSelector";
import { DeadlineCountdown } from "@/components/common/DeadlineCountdown";
import { SectionHeader } from "@/components/common/SectionHeader";
import { LoadingState } from "@/components/common/States";
import { FORMATIONS, type FormationKey, type SquadPlayer } from "@/types/fantasy";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Check, Pencil, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/fantasy/team")({
  component: MyTeamPage,
});

function MyTeamPage() {
  const { t, tr, lang, dir } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });

  const teamQ = useQuery({ queryKey: ["fantasy-team"], queryFn: () => fantasyService.getTeam() });
  const playersQ = useQuery({ queryKey: ["fantasy-players"], queryFn: () => fantasyService.getPlayers() });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });
  const gwQ = useQuery({ queryKey: ["gameweek"], queryFn: () => botolaService.getCurrentGameweek() });
  const summaryQ = useQuery({ queryKey: ["fantasy-summary"], queryFn: () => botolaService.getFantasySummary() });

  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [captainSheet, setCaptainSheet] = useState(false);
  const [localSquad, setLocalSquad] = useState<SquadPlayer[] | null>(null);
  const [localFormation, setLocalFormation] = useState<FormationKey | null>(null);

  if (!teamQ.data || !playersQ.data || !clubsQ.data) return <LoadingState />;

  const squad = localSquad ?? teamQ.data.squad;
  const formation = localFormation ?? teamQ.data.formation;
  const players = playersQ.data;
  const clubs = clubsQ.data;

  const playerOf = (id: string) => players.find((p) => p.id === id)!;
  const clubOf = (cid: string) => clubs.find((c) => c.id === cid);
  const xiIds = squad.filter((s) => s.slot < 12).map((s) => s.playerId);
  const benchIds = squad.filter((s) => s.slot >= 12).map((s) => s.playerId);

  const gkXi = xiIds.filter((id) => playerOf(id).position === "GK");
  const defXi = xiIds.filter((id) => playerOf(id).position === "DEF");
  const midXi = xiIds.filter((id) => playerOf(id).position === "MID");
  const fwdXi = xiIds.filter((id) => playerOf(id).position === "FWD");

  // Tap-to-swap interaction: first tap selects, second tap on another shirt
  // swaps them, respecting positional feasibility (same position OR bench↔XI
  // of same position).
  const handleTap = (playerId: string) => {
    if (!editing) return;
    if (!selected) {
      setSelected(playerId);
      return;
    }
    if (selected === playerId) {
      setSelected(null);
      return;
    }
    const a = squad.find((s) => s.playerId === selected)!;
    const b = squad.find((s) => s.playerId === playerId)!;
    const pa = playerOf(a.playerId);
    const pb = playerOf(b.playerId);
    // Allow swap if same position, otherwise disallow (formation invariant)
    if (pa.position !== pb.position) {
      setSelected(playerId);
      return;
    }
    const next = squad.map((s) => {
      if (s.playerId === a.playerId) return { ...s, slot: b.slot };
      if (s.playerId === b.playerId) return { ...s, slot: a.slot };
      return s;
    });
    setLocalSquad(next);
    setSelected(null);
  };

  const setCaptain = (playerId: string, vice = false) => {
    const next = squad.map((s) => {
      if (vice) return { ...s, isViceCaptain: s.playerId === playerId, isCaptain: s.isCaptain && s.playerId !== playerId };
      return { ...s, isCaptain: s.playerId === playerId, isViceCaptain: s.isViceCaptain && s.playerId !== playerId };
    });
    setLocalSquad(next);
    setCaptainSheet(false);
  };

  const changeFormation = (f: FormationKey) => {
    setLocalFormation(f);
    // NB: real reassignment of slots by position would go here. For now
    // we keep player-to-slot mapping and just update the visual layout by
    // regrouping via position on render.
  };

  const save = () => {
    setEditing(false);
    setSelected(null);
    // Persist: hand off to backend later. For now local state stays.
  };
  const cancel = () => {
    setEditing(false);
    setSelected(null);
    setLocalSquad(null);
    setLocalFormation(null);
  };

  const shirt = (id: string) => {
    const p = playerOf(id);
    const sq = squad.find((s) => s.playerId === id)!;
    return (
      <PlayerShirt
        player={p}
        club={clubOf(p.clubId)}
        metric={String(p.expectedPoints ?? "—")}
        captain={sq.isCaptain}
        vice={sq.isViceCaptain}
        onClick={() => handleTap(id)}
        className={cn(selected === id && "-translate-y-1 ring-2 ring-[color:var(--brand-accent)] rounded-xl")}
      />
    );
  };

  const formationRow = useMemo(() => {
    const cfg = FORMATIONS[formation];
    return { def: cfg.DEF, mid: cfg.MID, fwd: cfg.FWD };
  }, [formation]);

  // Slice XI arrays to formation size — extra players fold to bench visually.
  const defRender = defXi.slice(0, formationRow.def).map(shirt);
  const midRender = midXi.slice(0, formationRow.mid).map(shirt);
  const fwdRender = fwdXi.slice(0, formationRow.fwd).map(shirt);
  const benchRender = benchIds.map(shirt);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-black text-foreground">{teamQ.data.teamName}</h1>
          <div className="text-xs text-muted-foreground">{teamQ.data.managerName}</div>
        </div>
        <div className="flex items-center gap-2">
          {gwQ.data && <DeadlineCountdown iso={gwQ.data.deadline} />}
        </div>
      </div>

      {summaryQ.data && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          <MiniStat label={t("fantasy.gw_points")} value={String(summaryQ.data.gameweekPoints)} accent />
          <MiniStat label={t("fantasy.free_transfers")} value={String(summaryQ.data.transfersLeft)} />
          <MiniStat label={t("fantasy.bank")} value={nf.format(summaryQ.data.bankValue)} />
          <MiniStat label={t("fantasy.team_value")} value={nf.format(summaryQ.data.teamValue)} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[color:var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden /> {t("fantasy.edit_lineup")}
          </button>
        ) : (
          <>
            <button onClick={save} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
              <Check className="h-3.5 w-3.5" aria-hidden /> {t("fantasy.save")}
            </button>
            <button onClick={cancel} className="inline-flex items-center gap-1.5 rounded-xl border border-input bg-white/60 px-3 py-1.5 text-xs font-semibold">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t("fantasy.cancel")}
            </button>
          </>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <button className="rounded-xl bg-white/60 px-3 py-1.5 text-xs font-semibold ring-1 ring-black/5">
              {t("fantasy.formation")}: {formation}
            </button>
          </PopoverTrigger>
          <PopoverContent align={dir === "rtl" ? "end" : "start"} className="w-48 p-2">
            <div className="mb-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">{t("fantasy.change_formation")}</div>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(FORMATIONS) as FormationKey[]).map((f) => (
                <button
                  key={f}
                  onClick={() => changeFormation(f)}
                  className={cn(
                    "rounded-lg px-2 py-1.5 text-xs font-semibold",
                    formation === f
                      ? "bg-[color:var(--brand-primary)] text-white"
                      : "bg-white/70 text-foreground hover:bg-white",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <button
          onClick={() => setCaptainSheet(true)}
          className="rounded-xl bg-white/60 px-3 py-1.5 text-xs font-semibold ring-1 ring-black/5"
        >
          {t("fantasy.set_captain")}
        </button>
      </div>

      <div className="mt-4">
        <Pitch
          gk={shirt(gkXi[0])}
          def={defRender}
          mid={midRender}
          fwd={fwdRender}
          bench={benchRender}
          benchLabel={t("fantasy.bench")}
        />
      </div>

      <SectionHeader title={t("fantasy.starting_xi")} />
      <p className="text-xs text-muted-foreground">
        {editing ? "Tap two players of the same position to swap." : t("fantasy.edit_lineup")}
      </p>

      {/* Captain sheet */}
      <Sheet open={captainSheet} onOpenChange={setCaptainSheet}>
        <SheetContent side={dir === "rtl" ? "left" : "right"} className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>{t("fantasy.set_captain")}</SheetTitle></SheetHeader>
          <ul className="mt-3 grid gap-1.5">
            {xiIds.map((id) => {
              const p = playerOf(id);
              const sq = squad.find((s) => s.playerId === id)!;
              return (
                <li key={id} className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 ring-1 ring-black/5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{tr(p.name)}</div>
                    <div className="text-[11px] text-muted-foreground">{clubOf(p.clubId) && tr(clubOf(p.clubId)!.shortName)}</div>
                  </div>
                  <button
                    onClick={() => setCaptain(id, false)}
                    className={cn(
                      "rounded-lg px-2 py-1 text-[11px] font-semibold",
                      sq.isCaptain ? "bg-[color:var(--brand-accent)] text-white" : "bg-white ring-1 ring-black/10",
                    )}
                  >
                    {t("fantasy.captain")}
                  </button>
                  <button
                    onClick={() => setCaptain(id, true)}
                    className={cn(
                      "rounded-lg px-2 py-1 text-[11px] font-semibold",
                      sq.isViceCaptain ? "bg-[color:var(--brand-primary)] text-white" : "bg-white ring-1 ring-black/10",
                    )}
                  >
                    {t("fantasy.vice")}
                  </button>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] px-2 py-2 text-center">
      <div className={cn("text-sm font-black tabular-nums", accent ? "text-[color:var(--brand-accent)]" : "text-foreground")}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
