import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { botolaService } from "@/services/mock";
import { fantasyService } from "@/services/fantasy-mock";
import { LoadingState } from "@/components/common/States";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ClubCrest } from "@/components/common/ClubCrest";
import { PlayerStatusBadge } from "@/components/fantasy/PlayerStatusBadge";
import { PlayerPickerDrawer } from "@/components/fantasy/PlayerPickerDrawer";
import { TransferReviewPanel } from "@/components/fantasy/TransferReviewPanel";
import { UnsavedBadge } from "@/components/fantasy/UnsavedBadge";
import { ConflictBar } from "@/components/fantasy/ConflictBar";
import { computeBudgetImpact, maxAffordableReplacement } from "@/lib/budget";
import type { FantasyPlayer } from "@/types/fantasy";
import { useI18n } from "@/i18n/provider";
import { ArrowRightLeft, Check, Lock } from "lucide-react";
import type { TranslationKey } from "@/i18n/dictionaries";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { fantasyStateStore, type FantasyPersistedState } from "@/services/fantasy-state";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import {
  applyConfirmedTransfers,
  previewTransfers,
  transfersDeadline,
} from "@/services/transfers-service";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyDraftsStore, type FantasyDraftKey } from "@/services/fantasy-drafts-store";
import { runOwnedMutation, classifyRepoError } from "@/services/fantasy-mutation-controller";

export const Route = createFileRoute("/fantasy/transfers")({
  component: TransfersPage,
});

// H5 — Persisted working state for the Transfers route.
interface TransfersDraftPayload {
  outIds: string[];
  inIds: string[];
}

function isTransfersDraftPayload(v: unknown): v is TransfersDraftPayload {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<TransfersDraftPayload>;
  return Array.isArray(p.outIds) && Array.isArray(p.inIds);
}

function TransfersPage() {
  const { t, tr, lang } = useI18n();
  const qc = useQueryClient();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });

  const { key: ownedKey } = useFantasyDataSource();
  const owned = useFantasyOwned();
  const isCloud = owned.source === "cloud";

  // H7 — Consume owned.snapshot directly in cloud mode; no parallel query.
  const localTeamQ = useQuery({
    queryKey: ownedKey("team"),
    queryFn: () => fantasyService.getTeam(),
    enabled: !isCloud,
  });
  const team = isCloud ? (owned.snapshot?.team ?? null) : (localTeamQ.data ?? null);

  const playersQ = useQuery({
    queryKey: ["fantasy-players"],
    queryFn: () => fantasyService.getPlayers(),
  });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });
  const gwQ = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => botolaService.getCurrentGameweek(),
  });

  const [fantasyState, setFantasyState] = useState<FantasyPersistedState>(() =>
    isCloud ? (owned.snapshot?.lifecycle ?? fantasyStateStore.read()) : fantasyStateStore.read(),
  );
  useEffect(() => {
    if (isCloud) {
      if (owned.snapshot?.lifecycle) setFantasyState(owned.snapshot.lifecycle);
      return;
    }
    const onEvt = () => setFantasyState(fantasyStateStore.read());
    window.addEventListener("botolago:storage", onEvt);
    window.addEventListener("storage", onEvt);
    return () => {
      window.removeEventListener("botolago:storage", onEvt);
      window.removeEventListener("storage", onEvt);
    };
  }, [isCloud, owned.snapshot?.lifecycle]);

  const [outIds, setOutIds] = useState<string[]>([]);
  const [inIds, setInIds] = useState<string[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const draftInitRef = useRef(false);
  const { requireAuth } = useAuth();

  // H5 — Draft key (cloud-only).
  const teamId = isCloud ? (owned.snapshot?.teamId ?? "new") : null;
  const baseVersion = isCloud ? (owned.snapshot?.version ?? 0) : 0;
  const draftKey = useMemo<FantasyDraftKey | null>(() => {
    if (!isCloud || !owned.userId) return null;
    return {
      uid: owned.userId,
      teamId: teamId ?? "new",
      baseVersion,
      kind: "transfers",
    };
  }, [isCloud, owned.userId, teamId, baseVersion]);

  // Reset draft-init flag when identity changes.
  useEffect(() => {
    draftInitRef.current = false;
    setDraftRestored(false);
  }, [draftKey?.uid, draftKey?.teamId, draftKey?.baseVersion]);

  // Hydrate draft on mount.
  useEffect(() => {
    if (!isCloud || !draftKey || !team) return;
    if (draftInitRef.current) return;
    const entry = fantasyDraftsStore.read<TransfersDraftPayload>(draftKey);
    if (entry && isTransfersDraftPayload(entry.payload)) {
      // Only restore ids that still map to current squad or exist in players.
      setOutIds(entry.payload.outIds);
      setInIds(entry.payload.inIds);
      setDraftRestored(true);
    }
    draftInitRef.current = true;
  }, [isCloud, draftKey, team]);

  const persistDraft = (nextOut: string[], nextIn: string[]) => {
    if (!isCloud || !draftKey) return;
    if (nextOut.length === 0 && nextIn.length === 0) {
      fantasyDraftsStore.remove(draftKey);
      return;
    }
    fantasyDraftsStore.save<TransfersDraftPayload>(draftKey, {
      outIds: nextOut,
      inIds: nextIn,
    });
    setDraftRestored(false);
  };

  if (!team || !playersQ.data || !clubsQ.data) return <LoadingState />;
  const players = playersQ.data;
  const clubs = clubsQ.data;
  const playerOf = (id: string) => players.find((p) => p.id === id)!;
  const clubOf = (cid: string) => clubs.find((c) => c.id === cid);

  const deadline = transfersDeadline(gwQ.data?.deadline);
  const currentGw = gwQ.data?.number ?? fantasyState.currentGameweek;
  const finalized = !!fantasyState.results[currentGw]?.finalized;
  const locked = !!deadline?.isLocked || finalized;

  const currentSquad = team.squad.map((s) => playerOf(s.playerId));
  const currentSquadIdsAfter = currentSquad.map((p) => p.id);
  outIds.forEach((oid, i) => {
    const idx = currentSquadIdsAfter.indexOf(oid);
    if (idx >= 0 && inIds[i]) currentSquadIdsAfter[idx] = inIds[i];
  });

  const outPlayers = outIds.map(playerOf);
  const inPlayers = inIds.map(playerOf).filter(Boolean) as FantasyPlayer[];

  const impact = computeBudgetImpact({ outPlayers, inPlayers, bank: team.bank });
  const preview = previewTransfers({
    team,
    chips: fantasyState.chips,
    outIds,
    inIds,
    netCost:
      outPlayers.reduce((s, p) => s - p.price, 0) + inPlayers.reduce((s, p) => s + p.price, 0),
  });

  const canReview =
    preview.totalTransfers > 0 && outIds.length === inIds.length && !impact.overBudget && !locked;
  const hasWorkingChanges = outIds.length > 0 || inIds.length > 0;

  const startReplace = (playerId: string) => {
    if (locked) return;
    setPickerFor(playerId);
  };
  const removeFromOut = (playerId: string) => {
    const idx = outIds.indexOf(playerId);
    if (idx < 0) return;
    const nextOut = outIds.filter((x) => x !== playerId);
    const nextIn = inIds.filter((_, i) => i !== idx);
    setOutIds(nextOut);
    setInIds(nextIn);
    persistDraft(nextOut, nextIn);
  };
  const onPick = (p: FantasyPlayer) => {
    if (!pickerFor) return;
    const outP = playerOf(pickerFor);
    if (p.position !== outP.position) {
      toast.error(t("fantasy.team.hint.position_incompatible"));
      return;
    }
    const nextIds = currentSquadIdsAfter.map((id) => (id === pickerFor ? p.id : id));
    const clubCount = nextIds.filter((id) => playerOf(id).clubId === p.clubId).length;
    if (clubCount > 3) {
      toast.error(t("fantasy.validation.club_limit"));
      return;
    }
    let nextOut = outIds;
    let nextIn = inIds;
    if (!outIds.includes(pickerFor)) {
      nextOut = [...outIds, pickerFor];
      nextIn = [...inIds, p.id];
    } else {
      const idx = outIds.indexOf(pickerFor);
      nextIn = inIds.slice();
      nextIn[idx] = p.id;
    }
    setOutIds(nextOut);
    setInIds(nextIn);
    persistDraft(nextOut, nextIn);
    setPickerFor(null);
  };

  const resetAll = () => {
    setOutIds([]);
    setInIds([]);
    persistDraft([], []);
  };
  const openReview = () => {
    if (locked) {
      toast.error(t("fantasy.transfers.error.deadline"));
      return;
    }
    setConfirming(true);
  };

  const reloadLatest = async () => {
    setConflictOpen(false);
    if (draftKey) fantasyDraftsStore.remove(draftKey);
    setOutIds([]);
    setInIds([]);
    setDraftRestored(false);
    await owned.reload();
    toast.success(t("fantasy.status.saved_short"));
  };
  const keepWorking = () => setConflictOpen(false);

  const confirm = async () => {
    const res = applyConfirmedTransfers({
      team,
      chips: fantasyState.chips,
      outIds,
      inIds,
      netCost:
        outPlayers.reduce((s, p) => s - p.price, 0) + inPlayers.reduce((s, p) => s + p.price, 0),
      deadlineIso: gwQ.data?.deadline,
    });
    if (!res.ok) {
      const key: TranslationKey =
        res.error === "deadline_passed"
          ? "fantasy.transfers.error.deadline"
          : res.error === "over_budget"
            ? "fantasy.transfers.error.over_budget"
            : "fantasy.transfers.error.no_changes";
      toast.error(t(key));
      return;
    }
    const v = res.value;

    if (isCloud && owned.userId && owned.snapshot?.currentGameweekId) {
      const purchasePrices: Record<string, number> = {
        ...owned.snapshot.purchasePrices,
      };
      const transfers = outIds.map((oid, i) => {
        const inId = inIds[i];
        const oP = outPlayers.find((p) => p.id === oid)!;
        const iP = inPlayers.find((p) => p.id === inId)!;
        purchasePrices[inId] = iP.price;
        delete purchasePrices[oid];
        return {
          outSourceId: oid,
          inSourceId: inId,
          priceOut: oP.price,
          priceIn: iP.price,
          cost: iP.price - oP.price,
          hit: 0,
          chip: v.chips.active ?? null,
        };
      });
      const nextLifecycle = {
        ...fantasyState,
        chips: v.chips,
        transferHitPoints: fantasyState.transferHitPoints + v.hitPointsApplied,
      };
      const cloudRes = await runOwnedMutation(
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
            owned.repo.confirmTransfers({
              expectedVersion: owned.snapshot!.version,
              formation: team.formation,
              bank: v.nextBank,
              freeTransfers: v.nextFreeTransfers,
              pendingTransfers: v.pendingTransfers,
              squad: v.nextSquad,
              purchasePrices,
              currentGameweekId: owned.snapshot!.currentGameweekId!,
              lifecycle: nextLifecycle,
              transfers,
            }),
          args: undefined,
          matchingDraftKey: draftKey ?? undefined,
          savedIdleAfterMs: 2400,
        },
      );
      if (cloudRes.ok) {
        setSuccess(true);
        setConfirming(false);
        setConflictOpen(false);
        toast.success(t("fantasy.transfers.success"));
        if (v.freeHitSnapshotTaken) toast.message(t("fantasy.transfers.free_hit_snapshot_taken"));
        setTimeout(() => setSuccess(false), 2400);
        setOutIds([]);
        setInIds([]);
        setDraftRestored(false);
        return;
      }
      // Preserve draft on failure.
      if (draftKey) {
        fantasyDraftsStore.save<TransfersDraftPayload>(draftKey, { outIds, inIds });
      }
      const c = classifyRepoError(cloudRes.error);
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
    fantasyService.saveTeam({
      squad: v.nextSquad,
      bank: v.nextBank,
      freeTransfers: v.nextFreeTransfers,
      pendingTransfers: v.pendingTransfers,
    });
    fantasyStateStore.write({
      chips: v.chips,
      transferHitPoints: fantasyState.transferHitPoints + v.hitPointsApplied,
    });
    setFantasyState(fantasyStateStore.read());
    qc.invalidateQueries({ queryKey: ownedKey("team") });
    qc.invalidateQueries({ queryKey: ownedKey("summary") });
    setSuccess(true);
    setConfirming(false);
    toast.success(t("fantasy.transfers.success"));
    if (v.freeHitSnapshotTaken) toast.message(t("fantasy.transfers.free_hit_snapshot_taken"));
    setTimeout(() => setSuccess(false), 2400);
    setOutIds([]);
    setInIds([]);
  };

  const pickerOut = pickerFor ? playerOf(pickerFor) : null;
  const pickerMaxPrice = pickerOut
    ? maxAffordableReplacement(pickerOut.price, team.bank)
    : undefined;

  const chipLabel: string | null =
    preview.chipActive === "wildcard"
      ? t("fantasy.chip.wildcard")
      : preview.chipActive === "free_hit"
        ? t("fantasy.chip.free_hit")
        : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-foreground">
          <span className="text-brand">{t("fantasy.transfers.title")}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Stat
            label={t("fantasy.bank")}
            value={nf.format(preview.bankAfter)}
            accent={preview.overBudget}
          />
          <Stat label={t("fantasy.transfers.free")} value={String(preview.freeTransfersAfter)} />
          <Stat label={t("fantasy.transfers.hit")} value={`-${preview.hitPoints}`} />
          {chipLabel && <Stat label={t("fantasy.transfers.chip_active")} value={chipLabel} />}
        </div>
      </div>

      {locked && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-900"
        >
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            {t(finalized ? "fantasy.transfers.gw_closed" : "fantasy.transfers.deadline_locked")}
          </span>
        </div>
      )}

      {success && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-800"
        >
          <Check className="h-4 w-4 shrink-0" aria-hidden /> {t("fantasy.transfers.success")}
        </div>
      )}

      {/* H5 — Unsaved-changes badge (cloud mode only). */}
      {isCloud && (
        <div className="mt-3">
          <UnsavedBadge
            visible={hasWorkingChanges}
            variant={draftRestored ? "draft_restored" : "unsaved"}
          />
        </div>
      )}

      {/* H5 — Version-conflict resolution bar. */}
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

      <SectionHeader title={t("fantasy.team")} />
      <div className="grid gap-1.5">
        {(["GK", "DEF", "MID", "FWD"] as const).map((pos) => (
          <div key={pos}>
            <div className="mb-1 px-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
              {t(`player.pos.${pos}` as TranslationKey)}
            </div>
            <ul className="grid gap-1.5">
              {currentSquad
                .filter((p) => p.position === pos)
                .map((p) => {
                  const inOut = outIds.includes(p.id);
                  const replacementIdx = outIds.indexOf(p.id);
                  const replacement =
                    replacementIdx >= 0 ? inPlayers.find((_, i) => i === replacementIdx) : null;
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 ring-1 ring-black/5"
                    >
                      {clubOf(p.clubId) && <ClubCrest club={clubOf(p.clubId)!} size="sm" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={
                              inOut
                                ? "line-through text-muted-foreground text-sm font-bold"
                                : "text-sm font-bold text-foreground"
                            }
                          >
                            {tr(p.name)}
                          </span>
                          {p.status !== "available" && <PlayerStatusBadge status={p.status} />}
                        </div>
                        {replacement && (
                          <div className="mt-0.5 truncate text-[11px] font-semibold text-emerald-700">
                            → {tr(replacement.name)} ({nf.format(replacement.price)})
                          </div>
                        )}
                        {!replacement && (
                          <div className="text-[11px] text-muted-foreground">
                            {t("fantasy.price")} {nf.format(p.price)} · {t("fantasy.form")}{" "}
                            {nf.format(p.form)}
                          </div>
                        )}
                      </div>
                      {inOut ? (
                        <button
                          onClick={() => removeFromOut(p.id)}
                          className="min-h-11 rounded-lg bg-white px-3 py-2 text-[11px] font-semibold ring-1 ring-black/10"
                        >
                          {t("fantasy.transfers.reset")}
                        </button>
                      ) : (
                        <button
                          onClick={() => startReplace(p.id)}
                          disabled={locked}
                          className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-[color:var(--brand-primary)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-40"
                        >
                          <ArrowRightLeft className="h-3 w-3" aria-hidden />{" "}
                          {t("fantasy.transfers.title")}
                        </button>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={resetAll}
          className="min-h-11 rounded-xl border border-input bg-white/60 px-3 py-2 text-xs font-semibold hover:bg-white disabled:opacity-40"
          disabled={preview.totalTransfers === 0}
        >
          {t("fantasy.transfers.reset")}
        </button>
        <button
          onClick={() => requireAuth(() => openReview())}
          disabled={!canReview}
          className="min-h-11 rounded-xl bg-[color:var(--brand-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {t("fantasy.review")}
        </button>
      </div>

      {confirming && (
        <div className="mt-4">
          <TransferReviewPanel
            outPlayers={outPlayers}
            inPlayers={inPlayers}
            clubs={clubs}
            freeTransfers={preview.free}
            paidTransfers={preview.paid}
            bankAfter={preview.bankAfter}
            hitPoints={preview.hitPoints}
            chipLabel={chipLabel}
            totalTransfers={preview.totalTransfers}
            onCancel={() => setConfirming(false)}
            onConfirm={confirm}
          />
        </div>
      )}

      <PlayerPickerDrawer
        open={!!pickerFor}
        onClose={() => setPickerFor(null)}
        onPick={onPick}
        players={players.filter((p) => !currentSquadIdsAfter.includes(p.id) || p.id === pickerFor)}
        clubs={clubs}
        position={pickerOut?.position}
        maxPrice={pickerMaxPrice}
        title={t("fantasy.transfers.select_in")}
      />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl px-2 py-1 ring-1 ring-black/5 ${accent ? "bg-red-500/10" : "bg-white/60"}`}
    >
      <div
        className={`text-xs font-black tabular-nums ${accent ? "text-red-700" : "text-foreground"}`}
      >
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
