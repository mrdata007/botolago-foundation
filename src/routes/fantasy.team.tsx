import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { botolaService } from "@/services/mock";
import { fantasyService } from "@/services/fantasy-mock";
import { Pitch } from "@/components/fantasy/Pitch";
import { PlayerShirt } from "@/components/fantasy/PlayerShirt";
import { SquadListToggle, type SquadViewMode } from "@/components/fantasy/SquadListToggle";
import { SquadListView } from "@/components/fantasy/SquadListView";
import { FantasyChipsRow, type FantasyChip } from "@/components/fantasy/FantasyChipCard";
import { DeadlineCountdown } from "@/components/common/DeadlineCountdown";
import { SectionHeader } from "@/components/common/SectionHeader";
import { LoadingState } from "@/components/common/States";
import { FORMATIONS, type FormationKey, type SquadPlayer } from "@/types/fantasy";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, Lock, Pencil, RotateCcw } from "lucide-react";
import { reslotForFormation, swapSquadMembers } from "@/lib/reslot";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { fantasyStateStore, type FantasyPersistedState } from "@/services/fantasy-state";
import {
  activateChip, canActivateChip, chipDisplayState, deactivateChip,
  evaluateDeadline, type ChipKey,
} from "@/lib/fantasy-engine";
import { validateTeam, type TeamValidationError } from "@/lib/team-validation";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/fantasy/team")({
  component: MyTeamPage,
});

function MyTeamPage() {
  const { t, tr, lang, dir } = useI18n();
  const qc = useQueryClient();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });

  const teamQ = useQuery({ queryKey: ["fantasy-team"], queryFn: () => fantasyService.getTeam() });
  const playersQ = useQuery({ queryKey: ["fantasy-players"], queryFn: () => fantasyService.getPlayers() });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });
  const gwQ = useQuery({ queryKey: ["gameweek"], queryFn: () => botolaService.getCurrentGameweek() });
  const summaryQ = useQuery({ queryKey: ["fantasy-summary"], queryFn: () => botolaService.getFantasySummary() });

  const { requireAuth } = useAuth();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [captainSheet, setCaptainSheet] = useState(false);
  const [localSquad, setLocalSquad] = useState<SquadPlayer[] | null>(null);
  const [localFormation, setLocalFormation] = useState<FormationKey | null>(null);
  const [view, setView] = useState<SquadViewMode>("squad");
  const [chipsVersion, setChipsVersion] = useState(0);
  const [chipConfirm, setChipConfirm] = useState<ChipKey | null>(null);
  const chipsState = useMemo(() => fantasyStateStore.read().chips, [chipsVersion]);
  const deadlineIso = gwQ.data?.deadline;
  const deadline = deadlineIso ? evaluateDeadline(deadlineIso) : null;
  const locked = !!deadline?.isLocked;

  const CHIP_KEYS: ChipKey[] = ["bench_boost", "triple_captain", "free_hit", "wildcard"];
  const teamChips: FantasyChip[] = CHIP_KEYS.map((key) => ({
    key,
    state: locked && chipsState.active !== key ? "unavailable" : chipDisplayState(chipsState, key),
  }));

  const activateChipHandler = (key: ChipKey) => {
    if (!teamQ.data) return;
    // Toggle off if already active.
    if (chipsState.active === key) {
      const next = deactivateChip(chipsState);
      fantasyStateStore.write({ chips: next });
      setChipsVersion((v) => v + 1);
      toast.success(t("fantasy.chip.deactivated"));
      return;
    }
    const check = canActivateChip(chipsState, key, { deadlinePassed: locked });
    if (!check.ok) { toast.error(t((check.reasonKey ?? "fantasy.engine.chip_conflict") as TranslationKey)); return; }
    setChipConfirm(key);
  };
  const confirmChip = () => {
    if (!chipConfirm || !teamQ.data) return;
    const next = activateChip(chipsState, chipConfirm, { gameweek: gwQ.data?.number ?? 14, team: teamQ.data });
    fantasyStateStore.write({ chips: next });
    setChipsVersion((v) => v + 1);
    setChipConfirm(null);
    toast.success(t("fantasy.chip.activated"));
  };

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

  const handleTap = (playerId: string) => {
    if (!editing) return;
    if (!selected) { setSelected(playerId); return; }
    if (selected === playerId) { setSelected(null); return; }
    const next = swapSquadMembers(squad, players, formation, selected, playerId);
    if (!next) {
      toast.error(lang === "ar" ? "لا يمكن تبديل لاعبين من مركزين مختلفين" : "Impossible d'échanger deux joueurs de postes différents");
      setSelected(playerId);
      return;
    }
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
    setLocalSquad(reslotForFormation({ squad, players, formation: f }));
  };

  const save = () => {
    fantasyService.saveTeam({
      formation: localFormation ?? teamQ.data.formation,
      squad: localSquad ?? teamQ.data.squad,
    });
    qc.invalidateQueries({ queryKey: ["fantasy-team"] });
    qc.invalidateQueries({ queryKey: ["fantasy-summary"] });
    setEditing(false);
    setSelected(null);
    setLocalSquad(null);
    setLocalFormation(null);
    toast.success(t("fantasy.success"));
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

  const formationCfg = FORMATIONS[formation];
  const formationRow = { def: formationCfg.DEF, mid: formationCfg.MID, fwd: formationCfg.FWD };

  // Slice XI arrays to formation size — extra players fold to bench visually.
  const defRender = defXi.slice(0, formationRow.def).map(shirt);
  const midRender = midXi.slice(0, formationRow.mid).map(shirt);
  const fwdRender = fwdXi.slice(0, formationRow.fwd).map(shirt);
  const benchRender = benchIds.map(shirt);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-brand">{t("fantasy.team")}</div>
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

      {locked && (
        <div role="status" className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-900">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          {t("fantasy.deadline.locked")}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!editing ? (
          <button
            onClick={() => requireAuth(() => setEditing(true))}
            disabled={locked}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[color:var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
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
            <button disabled={locked} className="rounded-xl bg-white/60 px-3 py-1.5 text-xs font-semibold ring-1 ring-black/5 disabled:opacity-40">
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
          disabled={locked}
          className="rounded-xl bg-white/60 px-3 py-1.5 text-xs font-semibold ring-1 ring-black/5 disabled:opacity-40"
        >
          {t("fantasy.set_captain")}
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <SquadListToggle value={view} onChange={setView} />
        <div className="hidden text-[11px] text-muted-foreground sm:block">
          {editing ? t("fantasy.edit_lineup") : ""}
        </div>
      </div>

      <div className="mt-2">
        <FantasyChipsRow chips={teamChips} onSelect={(k) => requireAuth(() => activateChipHandler(k))} />
      </div>

      <AlertDialog open={chipConfirm !== null} onOpenChange={(o) => !o && setChipConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("fantasy.chip.confirm_title")}
              {chipConfirm && <> — {t(`fantasy.chip.${chipConfirm}` as TranslationKey)}</>}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("fantasy.chip.confirm_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("fantasy.chip.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmChip}>{t("fantasy.chip.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {view === "squad" ? (
        <div className="mt-3">
          <Pitch
            gk={shirt(gkXi[0])}
            def={defRender}
            mid={midRender}
            fwd={fwdRender}
            bench={benchRender}
            benchLabel={t("fantasy.bench")}
          />
        </div>
      ) : (
        <div className="mt-3">
          <SquadListView
            squad={squad}
            players={players}
            clubs={clubs}
            onPlayerClick={editing ? handleTap : undefined}
          />
        </div>
      )}

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
