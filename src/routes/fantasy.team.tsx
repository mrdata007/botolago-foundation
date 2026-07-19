import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Check, Lock, Pencil, RotateCcw, Users } from "lucide-react";
import { reslotForFormation, swapSquadMembers } from "@/lib/reslot";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyStateStore, type FantasyPersistedState } from "@/services/fantasy-state";
import {
  activateChip, canActivateChip, chipDisplayState, deactivateChip,
  evaluateDeadline, type ChipKey,
} from "@/lib/fantasy-engine";
import { validateTeam, type TeamValidationError } from "@/lib/team-validation";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyDraftsStore, type FantasyDraftKey } from "@/services/fantasy-drafts-store";
import { runOwnedMutation, classifyRepoError } from "@/services/fantasy-mutation-controller";
import { UnsavedBadge } from "@/components/fantasy/UnsavedBadge";
import { ConflictBar } from "@/components/fantasy/ConflictBar";
import { importDecisionService } from "@/services/fantasy-import-decision";

export const Route = createFileRoute("/fantasy/team")({
  component: MyTeamPage,
});

// H4 — Persisted working state for the Team route. Kept intentionally small
// (squad + formation); captain/vice live inside SquadPlayer entries.
interface TeamDraftPayload {
  squad: SquadPlayer[];
  formation: FormationKey;
}

function isTeamDraftPayload(v: unknown): v is TeamDraftPayload {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<TeamDraftPayload>;
  return Array.isArray(p.squad) && typeof p.formation === "string";
}

function MyTeamPage() {
  const { t, tr, lang, dir } = useI18n();
  const qc = useQueryClient();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });

  const { key: ownedKey } = useFantasyDataSource();
  const owned = useFantasyOwned();
  const isCloud = owned.source === "cloud";

  const playersQ = useQuery({ queryKey: ["fantasy-players"], queryFn: () => fantasyService.getPlayers() });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });
  const gwQ = useQuery({ queryKey: ["gameweek"], queryFn: () => botolaService.getCurrentGameweek() });

  // Local-only mock summary. In cloud mode we derive from the owned snapshot
  // + public player prices; the mock summary is never consumed.
  const summaryQ = useQuery({
    queryKey: ownedKey("summary"),
    queryFn: () => botolaService.getFantasySummary(),
    enabled: !isCloud,
  });

  // Local-mode team read; in cloud mode we consume owned.snapshot directly
  // (H7 — no parallel Team queries in cloud mode).
  const localTeamQ = useQuery({
    queryKey: ownedKey("team"),
    queryFn: () => fantasyService.getTeam(),
    enabled: !isCloud,
  });

  const team = isCloud ? owned.snapshot?.team ?? null : localTeamQ.data ?? null;

  const { requireAuth } = useAuth();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [captainSheet, setCaptainSheet] = useState(false);
  const [localSquad, setLocalSquad] = useState<SquadPlayer[] | null>(null);
  const [localFormation, setLocalFormation] = useState<FormationKey | null>(null);
  const [view, setView] = useState<SquadViewMode>("squad");
  const [fState, setFState] = useState<FantasyPersistedState>(() =>
    isCloud
      ? (owned.snapshot?.lifecycle ?? fantasyStateStore.read())
      : fantasyStateStore.read(),
  );
  const [chipConfirm, setChipConfirm] = useState<ChipKey | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const draftInitRef = useRef(false);

  // Cloud: mirror lifecycle from snapshot. Local: subscribe to state store.
  useEffect(() => {
    if (isCloud) {
      if (owned.snapshot?.lifecycle) setFState(owned.snapshot.lifecycle);
      return;
    }
    const onEvt = () => setFState(fantasyStateStore.read());
    window.addEventListener("botolago:storage", onEvt);
    window.addEventListener("storage", onEvt);
    return () => {
      window.removeEventListener("botolago:storage", onEvt);
      window.removeEventListener("storage", onEvt);
    };
  }, [isCloud, owned.snapshot?.lifecycle]);

  const teamId = isCloud ? owned.snapshot?.teamId ?? "new" : null;
  const baseVersion = isCloud ? owned.snapshot?.version ?? 0 : 0;

  const draftKey = useMemo<FantasyDraftKey | null>(() => {
    if (!isCloud || !owned.userId) return null;
    return {
      uid: owned.userId,
      teamId: teamId ?? "new",
      baseVersion,
      kind: "team",
    };
  }, [isCloud, owned.userId, teamId, baseVersion]);

  // H4 — Init from matching draft or cloud snapshot on mount / identity change.
  // Runs once per (uid + teamId + version) so a fresh save that bumps the
  // version does NOT re-hydrate the same draft it just cleared.
  useEffect(() => {
    if (!isCloud) return;
    if (!draftKey || !team) return;
    if (draftInitRef.current) return;
    const entry = fantasyDraftsStore.read<TeamDraftPayload>(draftKey);
    if (entry && isTeamDraftPayload(entry.payload)) {
      setLocalSquad(entry.payload.squad);
      setLocalFormation(entry.payload.formation);
      setEditing(true);
      setDraftRestored(true);
      draftInitRef.current = true;
    } else {
      draftInitRef.current = true;
    }
  }, [isCloud, draftKey, team]);

  // Reset draft-init flag when the identity changes (new base version or uid).
  useEffect(() => {
    draftInitRef.current = false;
    setDraftRestored(false);
  }, [draftKey?.uid, draftKey?.teamId, draftKey?.baseVersion]);

  const chipsState = fState.chips;
  const deadlineIso = gwQ.data?.deadline;
  const currentGw = gwQ.data?.number ?? fState.currentGameweek;
  const deadline = deadlineIso ? evaluateDeadline(deadlineIso) : null;
  const deadlineLocked = !!deadline?.isLocked;
  const finalized = !!fState.results[currentGw]?.finalized;

  // Single shared gate used by every mutation entry point.
  const mutable = useMemo(
    () => ({
      ok: !deadlineLocked && !finalized,
      reasonKey: (finalized
        ? "fantasy.team.error.gw_finalized"
        : "fantasy.deadline.locked") as TranslationKey,
    }),
    [deadlineLocked, finalized],
  );
  const locked = !mutable.ok;

  const CHIP_KEYS: ChipKey[] = ["bench_boost", "triple_captain", "free_hit", "wildcard"];
  const teamChips: FantasyChip[] = CHIP_KEYS.map((key) => ({
    key,
    state: locked && chipsState.active !== key ? "unavailable" : chipDisplayState(chipsState, key),
  }));

  // Persist a working draft. No-op in local mode (guest state already lives
  // in fantasyStateStore + the mock service).
  const persistDraft = (payload: TeamDraftPayload) => {
    if (!isCloud || !draftKey) return;
    fantasyDraftsStore.save<TeamDraftPayload>(draftKey, payload);
    setDraftRestored(false); // any explicit edit clears the "restored" badge variant
  };

  const clearDraft = () => {
    if (!isCloud || !draftKey) return;
    fantasyDraftsStore.remove(draftKey);
  };

  // Cloud-mode chip commit: persist the lifecycle transition via saveTeam so
  // fantasyStateStore is NEVER written to in cloud mode. Reverts fState on
  // failure. `team` guarantees we have the current squad/formation/etc.
  const commitCloudLifecycle = async (
    next: FantasyPersistedState,
    successKey: TranslationKey,
    prev: FantasyPersistedState,
  ) => {
    if (!isCloud || !team) return false;
    setFState(next);
    const squadToSave = localSquad ?? team.squad;
    const formationToSave = localFormation ?? team.formation;
    const res = await runOwnedMutation(
      {
        qc,
        scope: owned.scope,
        setMutationStatus: owned.setMutationStatus,
        nextMutationSeq: owned.nextMutationSeq,
        setMutationStatusIfCurrent: owned.setMutationStatusIfCurrent,
        replaceSnapshot: owned.replaceSnapshot,
        invalidateOwned: owned.invalidateOwned,
      },
      {
        action: () =>
          owned.repo.saveTeam({
            teamName: team.teamName,
            managerName: team.managerName || null,
            formation: formationToSave,
            bank: team.bank,
            freeTransfers: team.freeTransfers,
            pendingTransfers: team.pendingTransfers,
            squad: squadToSave,
            purchasePrices: owned.snapshot?.purchasePrices ?? {},
            expectedVersion: baseVersion,
            currentGameweekId: owned.snapshot?.currentGameweekId ?? null,
            lifecycle: next,
          }),
        args: undefined,
        savedIdleAfterMs: 2400,
      },
    );
    if (res.ok) {
      toast.success(t(successKey));
      return true;
    }
    // Revert transient lifecycle change on error.
    setFState(prev);
    const c = classifyRepoError(res.error);
    if (c.isConflict) setConflictOpen(true);
    const key: TranslationKey = c.isConflict
      ? "fantasy.error.version_conflict"
      : c.isNetwork
        ? "fantasy.error.network"
        : c.isPermission
          ? "fantasy.error.permission"
          : "fantasy.error.transfer_failed";
    toast.error(t(key));
    return false;
  };

  const activateChipHandler = (key: ChipKey) => {
    if (!team) return;
    if (!mutable.ok) { toast.error(t(mutable.reasonKey)); return; }
    if (chipsState.active === key) {
      const next = deactivateChip(chipsState);
      const prev = fState;
      const nextState: FantasyPersistedState = { ...fState, chips: next };
      if (isCloud) {
        void commitCloudLifecycle(nextState, "fantasy.chip.cancelled", prev);
      } else {
        fantasyStateStore.write({ chips: next });
        setFState(fantasyStateStore.read());
        toast.success(t("fantasy.chip.cancelled"));
      }
      return;
    }
    const check = canActivateChip(chipsState, key, { deadlinePassed: locked });
    if (!check.ok) { toast.error(t((check.reasonKey ?? "fantasy.engine.chip_conflict") as TranslationKey)); return; }
    setChipConfirm(key);
  };

  const confirmChip = () => {
    if (!chipConfirm || !team) return;
    if (!mutable.ok) { toast.error(t(mutable.reasonKey)); setChipConfirm(null); return; }
    const nextChips = activateChip(chipsState, chipConfirm, { gameweek: currentGw, team });
    const prev = fState;
    const nextState: FantasyPersistedState = { ...fState, chips: nextChips };
    if (isCloud) {
      setChipConfirm(null);
      void commitCloudLifecycle(nextState, "fantasy.chip.activated", prev);
      return;
    }
    fantasyStateStore.write({ chips: nextChips });
    setFState(fantasyStateStore.read());
    setChipConfirm(null);
    toast.success(t("fantasy.chip.activated"));
  };

  // Early loading state — we need players/clubs/team for any render below.
  if (!playersQ.data || !clubsQ.data) return <LoadingState />;
  if (isCloud && owned.isLoading && !owned.snapshot) return <LoadingState />;
  if (!isCloud && !team) return <LoadingState />;

  const players = playersQ.data;
  const clubs = clubsQ.data;

  // H4 — Empty-cloud builder for start_new. When the cloud team exists but has
  // zero squad rows AND the import prompt won't render (user picked start_new,
  // or has no valid local template), offer an inline "seed starter squad"
  // affordance so the user leaves this route with a valid 15-player team they
  // can then edit. Never renders in local mode.
  const emptyCloud = isCloud && owned.snapshot?.emptyCloudSquad === true;
  const decision = isCloud && owned.userId ? importDecisionService.get(owned.userId) : null;
  const showBuilder = emptyCloud && (decision === "start_new" || !team || team.squad.length === 0);

  // B8 — redirect empty-cloud users to the dedicated /fantasy/create screen.
  if (showBuilder) {
    return <RedirectToCreate />;
  }


  if (!team || team.squad.length === 0) {
    // Defensive: unexpected empty squad state with no builder branch.
    return <LoadingState />;
  }

  const squad = localSquad ?? team.squad;
  const formation = localFormation ?? team.formation;

  const playerOf = (id: string) => players.find((p) => p.id === id)!;
  const clubOf = (cid: string) => clubs.find((c) => c.id === cid);
  const xiIds = squad.filter((s) => s.slot < 12).map((s) => s.playerId);
  const benchIds = squad.filter((s) => s.slot >= 12).map((s) => s.playerId);

  const gkXi = xiIds.filter((id) => playerOf(id)?.position === "GK");
  const defXi = xiIds.filter((id) => playerOf(id)?.position === "DEF");
  const midXi = xiIds.filter((id) => playerOf(id)?.position === "MID");
  const fwdXi = xiIds.filter((id) => playerOf(id)?.position === "FWD");

  // Cloud-mode summary derived from the owned snapshot + public prices.
  // Never falls back to the mock summary in cloud mode.
  const derivedSummary = (() => {
    if (!isCloud) return summaryQ.data ?? null;
    const teamValue = team.squad.reduce((sum, s) => {
      const p = players.find((pp) => pp.id === s.playerId);
      return sum + (p?.price ?? 0);
    }, 0);
    const gwPoints = fState.results[currentGw]?.totalPoints ?? 0;
    return {
      gameweekPoints: gwPoints,
      transfersLeft: team.freeTransfers,
      bankValue: team.bank,
      teamValue,
    };
  })();

  const hasWorkingChanges = localSquad !== null || localFormation !== null;

  // Revert local edit state back to the persisted team.
  const revertLocal = () => {
    setEditing(false);
    setSelected(null);
    setLocalSquad(null);
    setLocalFormation(null);
    setDraftRestored(false);
  };

  const handleTap = (playerId: string) => {
    if (!editing) return;
    if (!mutable.ok) { toast.error(t("fantasy.team.error.deadline_crossed_revert")); revertLocal(); return; }
    if (!selected) { setSelected(playerId); return; }
    if (selected === playerId) { setSelected(null); return; }
    const next = swapSquadMembers(squad, players, formation, selected, playerId);
    if (!next) {
      toast.error(t("fantasy.team.hint.position_incompatible"));
      setSelected(playerId);
      return;
    }
    setLocalSquad(next);
    setSelected(null);
    persistDraft({ squad: next, formation });
  };

  const setCaptain = (playerId: string, vice = false) => {
    if (!mutable.ok) { toast.error(t("fantasy.team.error.deadline_crossed_revert")); revertLocal(); return; }
    const target = squad.find((s) => s.playerId === playerId);
    if (!target || target.slot >= 12) {
      toast.error(t("fantasy.team.error.captain_not_in_xi"));
      return;
    }
    const next = squad.map((s) => {
      if (vice) return { ...s, isViceCaptain: s.playerId === playerId, isCaptain: s.isCaptain && s.playerId !== playerId };
      return { ...s, isCaptain: s.playerId === playerId, isViceCaptain: s.isViceCaptain && s.playerId !== playerId };
    });
    setLocalSquad(next);
    setCaptainSheet(false);
    persistDraft({ squad: next, formation });
  };

  const changeFormation = (f: FormationKey) => {
    if (!mutable.ok) { toast.error(t("fantasy.team.error.deadline_crossed_revert")); revertLocal(); return; }
    const nextSquad = reslotForFormation({ squad, players, formation: f });
    setLocalFormation(f);
    setLocalSquad(nextSquad);
    persistDraft({ squad: nextSquad, formation: f });
  };

  const save = async () => {
    if (!team) return;
    const nowLocked = deadlineIso ? evaluateDeadline(deadlineIso, new Date()).isLocked : false;
    const nowFinalized = !!(isCloud ? fState : fantasyStateStore.read()).results[currentGw]?.finalized;
    if (nowLocked || nowFinalized) {
      revertLocal();
      toast.error(t("fantasy.team.error.deadline_crossed_revert"));
      return;
    }
    const squadToSave = localSquad ?? team.squad;
    const formationToSave = localFormation ?? team.formation;
    const validation = validateTeam(squadToSave, formationToSave, players);
    if (!validation.ok) {
      const errKey = (`fantasy.team.error.${validation.error satisfies TeamValidationError}`) as TranslationKey;
      toast.error(t(errKey));
      return;
    }

    if (isCloud && draftKey) {
      const res = await runOwnedMutation(
        {
          qc,
          scope: owned.scope,
          setMutationStatus: owned.setMutationStatus,
          nextMutationSeq: owned.nextMutationSeq,
          setMutationStatusIfCurrent: owned.setMutationStatusIfCurrent,
          replaceSnapshot: owned.replaceSnapshot,
          invalidateOwned: owned.invalidateOwned,
        },
        {
          action: () =>
            owned.repo.saveTeam({
              teamName: team.teamName,
              managerName: team.managerName || null,
              formation: formationToSave,
              bank: team.bank,
              freeTransfers: team.freeTransfers,
              pendingTransfers: team.pendingTransfers,
              squad: squadToSave,
              purchasePrices: owned.snapshot?.purchasePrices ?? {},
              expectedVersion: baseVersion,
              currentGameweekId: owned.snapshot?.currentGameweekId ?? null,
              lifecycle: fState,
            }),
          args: undefined,
          matchingDraftKey: draftKey,
          savedIdleAfterMs: 2400,
        },
      );
      if (res.ok) {
        revertLocal();
        setConflictOpen(false);
        toast.success(t("fantasy.status.saved"));
        return;
      }
      // Preserve draft on failure; surface localized error/conflict.
      fantasyDraftsStore.save<TeamDraftPayload>(draftKey, {
        squad: squadToSave,
        formation: formationToSave,
      });
      const c = classifyRepoError(res.error);
      if (c.isConflict) setConflictOpen(true);
      const key: TranslationKey = c.isConflict
        ? "fantasy.error.version_conflict"
        : c.isNetwork
          ? "fantasy.error.network"
          : c.isPermission
            ? "fantasy.error.permission"
            : "fantasy.error.transfer_failed";
      toast.error(t(key));
      return;
    }

    // Local path — legacy mock service.
    fantasyService.saveTeam({ formation: formationToSave, squad: squadToSave });
    qc.invalidateQueries({ queryKey: ownedKey("team") });
    qc.invalidateQueries({ queryKey: ownedKey("summary") });
    revertLocal();
    toast.success(t("fantasy.success"));
  };

  const cancel = () => {
    revertLocal();
    clearDraft();
    setConflictOpen(false);
  };

  const reloadLatest = async () => {
    setConflictOpen(false);
    clearDraft();
    revertLocal();
    await owned.reload();
    toast.success(t("fantasy.status.saved_short"));
  };

  const keepWorking = () => {
    setConflictOpen(false);
  };

  const shirt = (id: string) => {
    const p = playerOf(id);
    if (!p) return null;
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

  const defRender = defXi.slice(0, formationRow.def).map(shirt);
  const midRender = midXi.slice(0, formationRow.mid).map(shirt);
  const fwdRender = fwdXi.slice(0, formationRow.fwd).map(shirt);
  const benchRender = benchIds.map(shirt);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-brand">{t("fantasy.team")}</div>
          <h1 className="text-xl font-black text-foreground">{team.teamName}</h1>
          <div className="text-xs text-muted-foreground">{team.managerName}</div>
        </div>
        <div className="flex items-center gap-2">
          {gwQ.data && <DeadlineCountdown iso={gwQ.data.deadline} />}
        </div>
      </div>

      {derivedSummary && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          <MiniStat label={t("fantasy.gw_points")} value={String(derivedSummary.gameweekPoints)} accent />
          <MiniStat label={t("fantasy.free_transfers")} value={String(derivedSummary.transfersLeft)} />
          <MiniStat label={t("fantasy.bank")} value={nf.format(derivedSummary.bankValue)} />
          <MiniStat label={t("fantasy.team_value")} value={nf.format(derivedSummary.teamValue)} />
        </div>
      )}

      {locked && (
        <div role="status" className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-900">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          {t("fantasy.deadline.locked")}
        </div>
      )}

      {/* H4 — Unsaved changes badge (cloud mode only). */}
      {isCloud && (
        <div className="mt-3">
          <UnsavedBadge
            visible={hasWorkingChanges}
            variant={draftRestored ? "draft_restored" : "unsaved"}
            onSave={hasWorkingChanges ? save : undefined}
            saving={owned.mutationStatus === "saving"}
          />
        </div>
      )}

      {/* H4 — Version-conflict resolution bar. */}
      {isCloud && (
        <div className="mt-2">
          <ConflictBar
            visible={conflictOpen}
            onReloadLatest={reloadLatest}
            onKeepWorking={keepWorking}
            busy={owned.mutationStatus === "saving"}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!editing ? (
          <button
            onClick={() => requireAuth(() => setEditing(true))}
            disabled={locked}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[color:var(--brand-primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden /> {t("fantasy.edit_lineup")}
          </button>
        ) : (
          <>
            <button
              onClick={save}
              disabled={owned.mutationStatus === "saving"}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              {owned.mutationStatus === "saving" ? t("fantasy.status.saving") : t("fantasy.save")}
            </button>
            <button
              onClick={cancel}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-input bg-white/60 px-3 py-2 text-xs font-semibold"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t("fantasy.cancel")}
            </button>
          </>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <button
              disabled={locked}
              className="min-h-11 rounded-xl bg-white/60 px-3 py-2 text-xs font-semibold ring-1 ring-black/5 disabled:opacity-40"
            >
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
                    "min-h-11 rounded-lg px-2 py-2 text-xs font-semibold",
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
          className="min-h-11 rounded-xl bg-white/60 px-3 py-2 text-xs font-semibold ring-1 ring-black/5 disabled:opacity-40"
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
            gk={gkXi[0] ? shirt(gkXi[0]) : null}
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
      <p className="text-xs text-muted-foreground break-words whitespace-normal">
        {editing ? t("fantasy.team.hint.swap") : t("fantasy.edit_lineup")}
      </p>

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
                      "min-h-11 min-w-11 rounded-lg px-3 py-2 text-[11px] font-semibold",
                      sq.isCaptain ? "bg-[color:var(--brand-accent)] text-white" : "bg-white ring-1 ring-black/10",
                    )}
                  >
                    {t("fantasy.captain")}
                  </button>
                  <button
                    onClick={() => setCaptain(id, true)}
                    className={cn(
                      "min-h-11 min-w-11 rounded-lg px-3 py-2 text-[11px] font-semibold",
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

// H4 — Empty-cloud builder: shown when the authenticated cloud team has
// zero squad rows and the user has chosen to start a new team (or has no
// valid local template). Seeds a valid 15-player starter squad from the
// public mock template via the authoritative cloud repository, so the
// user leaves this route with a version-1 team they can then edit
// normally through the standard save/draft flow.
function EmptyCloudBuilder({ team }: { team: unknown }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const owned = useFantasyOwned();
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  const seed = async () => {
    if (busy) return;
    setBusy(true);
    setErrorKey(null);
    try {
      const [seedTeam, players] = await Promise.all([
        fantasyService.getTeam(),
        fantasyService.getPlayers(),
      ]);
      const validation = validateTeam(seedTeam.squad, seedTeam.formation, players);
      if (!validation.ok) {
        setErrorKey("fantasy.error.import_validation");
        setBusy(false);
        return;
      }
      // Book value at seed time = current player price.
      const purchasePrices: Record<string, number> = {};
      for (const s of seedTeam.squad) {
        const p = players.find((pp) => pp.id === s.playerId);
        if (p) purchasePrices[s.playerId] = p.price;
      }
      const res = await runOwnedMutation(
        {
          qc,
          scope: owned.scope,
          setMutationStatus: owned.setMutationStatus,
          nextMutationSeq: owned.nextMutationSeq,
          setMutationStatusIfCurrent: owned.setMutationStatusIfCurrent,
          replaceSnapshot: owned.replaceSnapshot,
          invalidateOwned: owned.invalidateOwned,
        },
        {
          action: () =>
            owned.repo.saveTeam({
              teamName: seedTeam.teamName || t("fantasy.default.team_name"),
              managerName: seedTeam.managerName || null,
              formation: seedTeam.formation,
              bank: seedTeam.bank,
              freeTransfers: seedTeam.freeTransfers,
              pendingTransfers: seedTeam.pendingTransfers,
              squad: seedTeam.squad,
              purchasePrices,
              expectedVersion: owned.snapshot?.version ?? 0,
              currentGameweekId: owned.snapshot?.currentGameweekId ?? null,
              lifecycle: owned.snapshot?.lifecycle ?? fantasyStateStore.read(),
            }),
          args: undefined,
        },
      );
      if (!res.ok) {
        const c = classifyRepoError(res.error);
        setErrorKey(
          c.isNetwork
            ? "fantasy.error.network"
            : c.isPermission
              ? "fantasy.error.permission"
              : c.isConflict
                ? "fantasy.error.version_conflict"
                : "fantasy.error.import_generic",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  void team; // reserved for future variants that pre-fill from a template
  return (
    <div className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] p-5 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--bg-brand-gradient)] text-white">
        <Users className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="mt-3 text-base font-black text-foreground">{t("fantasy.empty.title")}</h2>
      <p className="mt-1 text-xs text-muted-foreground break-words whitespace-normal">
        {t("fantasy.empty.subtitle")}
      </p>
      <button
        type="button"
        onClick={seed}
        disabled={busy}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[color:var(--brand-primary)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
      >
        {busy ? t("fantasy.status.saving") : t("fantasy.empty.builder_open")}
      </button>
      {errorKey && (
        <p role="alert" className="mt-3 break-words whitespace-normal text-[11px] font-semibold text-red-700">
          {t(errorKey)}
        </p>
      )}
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
