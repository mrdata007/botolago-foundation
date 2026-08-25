import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { footballService } from "@/services/football";
import { fantasyService } from "@/services/fantasy-runtime";
import { ErrorState, LoadingState } from "@/components/common/States";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ClubCrest } from "@/components/common/ClubCrest";
import { DeadlineCountdown } from "@/components/common/DeadlineCountdown";
import { PlayerStatusBadge } from "@/components/fantasy/PlayerStatusBadge";
import { PlayerPickerDrawer } from "@/components/fantasy/PlayerPickerDrawer";
import { TransferReviewPanel } from "@/components/fantasy/TransferReviewPanel";
import { UnsavedBadge } from "@/components/fantasy/UnsavedBadge";
import { ConflictBar } from "@/components/fantasy/ConflictBar";
import { FantasyAccessGate } from "@/components/fantasy/FantasyAccessGate";
import { computeBudgetImpact, maxAffordableReplacement } from "@/lib/budget";
import type { FantasyPlayer } from "@/types/fantasy";
import { useI18n } from "@/i18n/provider";
import { ArrowRightLeft, Check, CircleHelp, Lock } from "lucide-react";
import type { TranslationKey } from "@/i18n/dictionaries";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { fantasyStateStore, type FantasyPersistedState } from "@/services/fantasy-state";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import {
  applyConfirmedTransfers,
  previewTransfers,
  reconcileTransfersDraft,
  transfersDeadline,
  type TransfersDraftSelection,
} from "@/services/transfers-service";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyDraftsStore, type FantasyDraftKey } from "@/services/fantasy-drafts-store";
import { runOwnedMutation, classifyRepoError } from "@/services/fantasy-mutation-controller";
import { adaptFantasyRules } from "@/services/fantasy-create-service";
import { FantasyCatalogUnavailable } from "@/components/fantasy/FantasyCatalogUnavailable";
import { hasSquadCatalogCoverage } from "@/lib/team-validation";

const RECRUIT_PLAYER_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export const Route = createFileRoute("/fantasy/transfers")({
  validateSearch: (search: Record<string, unknown>) => {
    const player = typeof search.player === "string" ? search.player : "";
    return { player: RECRUIT_PLAYER_ID.test(player) ? player : undefined };
  },
  component: TransfersPage,
});

// H5 — Persisted working state for the Transfers route.
type TransfersDraftPayload = TransfersDraftSelection;

function TransfersPage() {
  const { t, tr, lang } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { player: requestedRecruitId } = Route.useSearch();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });

  const { key: ownedKey } = useFantasyDataSource();
  const owned = useFantasyOwned();
  const isCloud = owned.source === "cloud";
  const hasCloudTeam = !isCloud || Boolean(owned.snapshot?.teamId);

  // A cloud snapshot without a team id is the first-time-user state, not an empty team.
  const team = isCloud
    ? owned.snapshot?.teamId
      ? owned.snapshot.team
      : null
    : (owned.snapshot?.team ?? null);

  const playersQ = useQuery({
    queryKey: ["fantasy-players"],
    queryFn: () => fantasyService.getPlayers(),
    enabled: owned.source !== "guest" && hasCloudTeam,
  });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
    enabled: owned.source !== "guest" && hasCloudTeam,
  });
  const gwQ = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
    enabled: owned.source !== "guest" && hasCloudTeam,
  });
  const rulesQ = useQuery({
    queryKey: ["fantasy-create", "rules"],
    queryFn: () => fantasyService.getRules(),
    enabled: owned.source !== "guest" && hasCloudTeam,
  });
  const fixturesQ = useQuery({
    queryKey: ["fantasy-create", "fixtures"],
    queryFn: () => fantasyService.getFixtureDifficulty(),
    enabled: owned.source !== "guest" && hasCloudTeam,
    retry: 1,
  });
  const activeRules = useMemo(
    () => (rulesQ.data ? adaptFantasyRules(rulesQ.data) : null),
    [rulesQ.data],
  );

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
  const { requireAuth, status: authStatus } = useAuth();
  const hasWorkingChanges = outIds.length > 0 || inIds.length > 0;

  useEffect(() => {
    if (!hasWorkingChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasWorkingChanges]);

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
    if (!isCloud || !draftKey || !team || !playersQ.data) return;
    if (draftInitRef.current) return;
    const entry = fantasyDraftsStore.read<TransfersDraftPayload>(draftKey);
    if (entry) {
      const reconciled = reconcileTransfersDraft(entry.payload, team, playersQ.data);
      setOutIds(reconciled.outIds);
      setInIds(reconciled.inIds);
      setDraftRestored(reconciled.outIds.length > 0);
      if (reconciled.outIds.length === 0) fantasyDraftsStore.remove(draftKey);
      else if (JSON.stringify(reconciled) !== JSON.stringify(entry.payload)) {
        fantasyDraftsStore.save(draftKey, reconciled);
      }
    }
    draftInitRef.current = true;
  }, [isCloud, draftKey, playersQ.data, team]);

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

  const previewPlayers = playersQ.data ?? [];
  const transferPairs = outIds.map((outSourceId, index) => {
    const outPlayer = previewPlayers.find((player) => player.id === outSourceId);
    const inSourceId = inIds[index] ?? "";
    const inPlayer = previewPlayers.find((player) => player.id === inSourceId);
    return {
      outSourceId,
      inSourceId,
      priceOut: outPlayer?.price ?? 0,
      priceIn: inPlayer?.price ?? 0,
      cost: (inPlayer?.price ?? 0) - (outPlayer?.price ?? 0),
      hit: 0,
      chip: fantasyState.chips.active,
    };
  });
  const serverPreviewQ = useQuery({
    queryKey: [
      "fantasy-transfer-preview",
      owned.snapshot?.teamId,
      owned.snapshot?.version,
      owned.snapshot?.currentGameweekId,
      transferPairs.map((pair) => `${pair.outSourceId}:${pair.inSourceId}`).join("|"),
      fantasyState.chips.active,
    ],
    queryFn: () =>
      owned.repo.previewTransfers({
        expectedVersion: owned.snapshot!.version,
        currentGameweekId: owned.snapshot!.currentGameweekId!,
        transfers: transferPairs,
        chip: fantasyState.chips.active,
      }),
    enabled:
      isCloud &&
      !!owned.snapshot?.teamId &&
      !!owned.snapshot.currentGameweekId &&
      outIds.length > 0 &&
      outIds.length === inIds.length &&
      inIds.every(Boolean),
    retry: false,
  });

  if (owned.source === "guest") {
    return authStatus === "loading" ? (
      <LoadingState />
    ) : (
      <FantasyAccessGate next="/fantasy/transfers" />
    );
  }

  if (playersQ.isError || clubsQ.isError || gwQ.isError || rulesQ.isError || owned.loadError) {
    return (
      <ErrorState
        onRetry={() => {
          void playersQ.refetch();
          void clubsQ.refetch();
          void gwQ.refetch();
          void rulesQ.refetch();
          void owned.reload();
        }}
      />
    );
  }
  if (
    (isCloud && owned.isLoading) ||
    playersQ.isLoading ||
    clubsQ.isLoading ||
    gwQ.isLoading ||
    rulesQ.isLoading
  ) {
    return <LoadingState />;
  }
  if (!team) {
    return (
      <Link
        to="/fantasy/create"
        className="surface-4 flex min-h-24 items-center justify-center rounded-2xl px-4 text-center text-sm font-black text-[color:var(--brand-primary)]"
      >
        {t("fantasy.create.title")}
      </Link>
    );
  }
  if (!playersQ.data || !clubsQ.data) return <LoadingState />;
  if (!activeRules || playersQ.data.length === 0 || clubsQ.data.length === 0) {
    return (
      <FantasyCatalogUnavailable
        detailKey={
          clubsQ.data.length === 0
            ? "fantasy.atlas.create.unavailable.clubs"
            : !activeRules
              ? "fantasy.atlas.create.unavailable.rules"
              : "fantasy.atlas.create.unavailable.catalog"
        }
        onRetry={() => {
          void playersQ.refetch();
          void clubsQ.refetch();
          void rulesQ.refetch();
        }}
      />
    );
  }
  const players = playersQ.data;
  const clubs = clubsQ.data;
  if (!hasSquadCatalogCoverage(team.squad, players)) {
    return (
      <FantasyCatalogUnavailable
        onRetry={() => {
          void playersQ.refetch();
          void owned.reload();
        }}
      />
    );
  }
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

  const requestedRecruit = requestedRecruitId
    ? players.find((player) => player.id === requestedRecruitId)
    : undefined;
  const recruitTarget =
    requestedRecruit && !currentSquadIdsAfter.includes(requestedRecruit.id)
      ? requestedRecruit
      : undefined;

  const outPlayers = outIds.map(playerOf);
  const inPlayers = inIds.map(playerOf).filter(Boolean) as FantasyPlayer[];

  const impact = computeBudgetImpact({ outPlayers, inPlayers, bank: team.bank });
  const localPreview = previewTransfers({
    team,
    chips: fantasyState.chips,
    outIds,
    inIds,
    netCost:
      outPlayers.reduce((s, p) => s - p.price, 0) + inPlayers.reduce((s, p) => s + p.price, 0),
    hitCost: activeRules.transferHitCost,
  });
  const preview =
    isCloud && serverPreviewQ.data
      ? {
          ...localPreview,
          totalTransfers: serverPreviewQ.data.transferCount,
          bankAfter: serverPreviewQ.data.bankAfter,
          freeTransfersAfter:
            serverPreviewQ.data.freeTransfersBefore - serverPreviewQ.data.freeTransfersUsed,
          free: serverPreviewQ.data.freeTransfersUsed,
          paid: serverPreviewQ.data.transferCount - serverPreviewQ.data.freeTransfersUsed,
          hitPoints: serverPreviewQ.data.pointHit,
          chipActive: serverPreviewQ.data.chipType,
          overBudget: false,
        }
      : localPreview;

  const canReview =
    preview.totalTransfers > 0 &&
    outIds.length === inIds.length &&
    !impact.overBudget &&
    !locked &&
    (!isCloud || (!!serverPreviewQ.data && !serverPreviewQ.isError));

  const applyPick = (outId: string, playerIn: FantasyPlayer) => {
    const playerOut = playerOf(outId);
    if (playerIn.position !== playerOut.position) {
      toast.error(t("fantasy.team.hint.position_incompatible"));
      return false;
    }
    if (playerIn.price > maxAffordableReplacement(playerOut.price, team.bank)) {
      toast.error(t("fantasy.transfers.error.over_budget"));
      return false;
    }
    const nextIds = currentSquadIdsAfter.map((id) => (id === outId ? playerIn.id : id));
    const clubCount = nextIds.filter((id) => playerOf(id).clubId === playerIn.clubId).length;
    if (clubCount > activeRules.maxPerClub) {
      toast.error(t("fantasy.validation.club_limit"));
      return false;
    }
    let nextOut = outIds;
    let nextIn = inIds;
    if (!outIds.includes(outId)) {
      nextOut = [...outIds, outId];
      nextIn = [...inIds, playerIn.id];
    } else {
      const idx = outIds.indexOf(outId);
      nextIn = inIds.slice();
      nextIn[idx] = playerIn.id;
    }
    setOutIds(nextOut);
    setInIds(nextIn);
    persistDraft(nextOut, nextIn);
    setPickerFor(null);
    return true;
  };
  const startReplace = (playerId: string) => {
    if (locked) return;
    if (recruitTarget) {
      if (applyPick(playerId, recruitTarget)) {
        void navigate({ to: "/fantasy/transfers", search: {}, replace: true });
      }
      return;
    }
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
  const onPick = (playerIn: FantasyPlayer) => {
    if (!pickerFor) return;
    applyPick(pickerFor, playerIn);
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
      hitCost: activeRules.transferHitCost,
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
  const transferDisabledReasonFor = (candidate: FantasyPlayer) => {
    if (!pickerFor) return null;
    const candidateSquad = currentSquadIdsAfter.map((id) => (id === pickerFor ? candidate.id : id));
    const clubCount = candidateSquad.filter(
      (id) => playerOf(id).clubId === candidate.clubId,
    ).length;
    return clubCount > activeRules.maxPerClub ? t("fantasy.validation.club_limit") : null;
  };

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
          {gwQ.data && <DeadlineCountdown iso={gwQ.data.deadline} />}
          <Stat
            label={t("fantasy.bank")}
            value={nf.format(preview.bankAfter)}
            accent={preview.overBudget}
          />
          <Stat label={t("fantasy.transfers.free")} value={String(preview.freeTransfersAfter)} />
          <Stat label={t("fantasy.transfers.hit")} value={String(-preview.hitPoints)} />
          {chipLabel && <Stat label={t("fantasy.transfers.chip_active")} value={chipLabel} />}
        </div>
      </div>

      {requestedRecruit && (
        <div
          data-testid="transfer-recruit-target"
          role="status"
          className="mt-3 rounded-xl border border-[color:var(--brand-accent)]/40 bg-[color:var(--brand-accent)]/10 px-3 py-2 text-sm font-semibold text-foreground"
        >
          {t(
            recruitTarget
              ? "fantasy.transfers.recruit_target"
              : "fantasy.transfers.recruit_already_owned",
          ).replace("{player}", tr(requestedRecruit.name))}
        </div>
      )}

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

      {isCloud && serverPreviewQ.isError && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-semibold text-red-800"
        >
          {t("fantasy.error.transfer_failed")}
        </div>
      )}

      <details className="mt-3 rounded-2xl border border-[var(--glass-border)] bg-white/60 p-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]">
          <CircleHelp className="h-4 w-4 text-[color:var(--brand-accent)]" aria-hidden />
          {t("fantasy.transfers.help_title")}
        </summary>
        <ul className="mt-2 grid gap-2 text-xs leading-relaxed text-muted-foreground">
          <li>
            {t("fantasy.transfers.help_allowance")
              .replace("{free}", String(team.freeTransfers))
              .replace("{rollover}", String(activeRules.maxFreeTransferRollover))}
          </li>
          <li>
            {t("fantasy.transfers.help_cost").replace(
              "{cost}",
              String(activeRules.transferHitCost),
            )}
          </li>
          <li>
            {t("fantasy.transfers.help_club").replace("{count}", String(activeRules.maxPerClub))}
          </li>
          <li>{t("fantasy.transfers.help_cancel")}</li>
        </ul>
      </details>

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
                          disabled={
                            locked ||
                            Boolean(recruitTarget && recruitTarget.position !== p.position)
                          }
                          className="inline-flex min-h-11 items-center gap-1 rounded-lg cta-brand px-3 py-2 text-[11px] font-semibold disabled:opacity-40"
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
          className="min-h-11 rounded-xl cta-brand px-4 py-2 text-sm font-bold disabled:opacity-40"
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
        disabledReasonFor={transferDisabledReasonFor}
        fixtures={fixturesQ.data ?? []}
        gameweek={gwQ.data?.number}
        inspectBeforePick
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
