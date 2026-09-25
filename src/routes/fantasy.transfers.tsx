import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AddPlayerScreen } from "@/components/fpl/AddPlayerScreen";
import { findClub } from "@/components/fpl/club-lookup";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { PlayerActionSheet } from "@/components/fpl/PlayerActionSheet";
import { SquadBuilderScreen, type BuilderSlot } from "@/components/fpl/SquadBuilderScreen";
import { TransferConfirmScreen } from "@/components/fpl/TransferConfirmScreen";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import { UiHeader } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import {
  activateChip,
  canActivateChip,
  chipDisplayState,
  evaluateDeadline,
  type ChipKey,
  type ChipsState,
} from "@/lib/fantasy-engine";
import { fantasyHead } from "@/lib/fantasy-meta";
import { fantasyDraftsStore, type FantasyDraftKey } from "@/services/fantasy-drafts-store";
import { runOwnedMutation, classifyRepoError } from "@/services/fantasy-mutation-controller";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyService } from "@/services/fantasy-runtime";
import { fantasyStateStore } from "@/services/fantasy-state";
import { applyConfirmedTransfers, previewTransfers } from "@/services/transfers-service";
import type { FantasyPlayer } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/transfers")({
  head: () => fantasyHead("transfers"),
  component: TransfersPage,
});

interface TransfersDraftPayload {
  outIds: string[];
  inIds: string[];
}
function isTransfersDraftPayload(v: unknown): v is TransfersDraftPayload {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<TransfersDraftPayload>;
  return Array.isArray(p.outIds) && Array.isArray(p.inIds);
}

/**
 * FPL-002/004/005/006/007 "Transfers" reconstructed on the shared squad
 * builder. Two entry points, both from the reference: "Add Player" picks the
 * incoming player first and the pitch then asks which same-position player
 * leaves (FPL-004, dimmed cards + "Incoming Player" strip), or tapping a card
 * opens its actions ("Transfer out" → Add Player locked to that position).
 * The incoming player is shown highlighted, the stat bar tracks free
 * transfers / wildcard / cost / bank, and "Next" opens the confirmation screen.
 *
 * Option A (A-Players): "FANTASY · Transferts" in the sub-page header, the
 * figures on the navy strip, the pitch card, and the Add / Next dock above
 * the bottom navigation.
 */
function TransfersPage() {
  return (
    <FantasyFrame bottomNav>
      <TransfersBody />
    </FantasyFrame>
  );
}

function TransfersBody() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const screen = useFantasyScreen();
  const owned = useFantasyOwned();
  const isCloud = owned.source === "cloud";
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const team = screen.team;
  const players = screen.players;
  const clubs = screen.clubs;
  const gameweek = screen.gameweek;

  const chipsState: ChipsState = isCloud
    ? (owned.snapshot?.lifecycle.chips ?? { active: null, used: [] })
    : fantasyStateStore.read().chips;

  const [outIds, setOutIds] = useState<string[]>([]);
  const [inIds, setInIds] = useState<(string | null)[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickerAny, setPickerAny] = useState(false);
  const [incoming, setIncoming] = useState<FantasyPlayer | null>(null);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [view, setView] = useState<"squad" | "list">("squad");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const draftKey = useMemo<FantasyDraftKey | null>(() => {
    if (!isCloud || !owned.userId) return null;
    return {
      uid: owned.userId,
      teamId: owned.snapshot?.teamId ?? "new",
      baseVersion: owned.snapshot?.version ?? 0,
      kind: "transfers",
    };
  }, [isCloud, owned.userId, owned.snapshot?.teamId, owned.snapshot?.version]);
  const draftInit = useRef(false);
  useEffect(() => {
    draftInit.current = false;
  }, [draftKey?.uid, draftKey?.teamId, draftKey?.baseVersion]);
  useEffect(() => {
    if (!draftKey || !team || draftInit.current) return;
    const entry = fantasyDraftsStore.read<TransfersDraftPayload>(draftKey);
    if (entry && isTransfersDraftPayload(entry.payload)) {
      setOutIds(entry.payload.outIds);
      setInIds(entry.payload.inIds);
    }
    draftInit.current = true;
  }, [draftKey, team]);
  const persistDraft = (nextOut: string[], nextIn: (string | null)[]) => {
    if (!draftKey) return;
    if (nextOut.length === 0) fantasyDraftsStore.remove(draftKey);
    else
      fantasyDraftsStore.save<TransfersDraftPayload>(draftKey, {
        outIds: nextOut,
        inIds: nextIn.filter(Boolean) as string[],
      });
  };

  const completePairs = outIds
    .map((outId, index) => ({ outId, inId: inIds[index] ?? null }))
    .filter((pair): pair is { outId: string; inId: string } => !!pair.inId);

  const serverPreview = useQuery({
    queryKey: [
      "fantasy-transfer-preview",
      owned.snapshot?.teamId,
      owned.snapshot?.version,
      completePairs.map((p) => `${p.outId}:${p.inId}`).join("|"),
      chipsState.active,
    ],
    queryFn: () =>
      owned.repo.previewTransfers({
        expectedVersion: owned.snapshot!.version,
        currentGameweekId: owned.snapshot!.currentGameweekId!,
        transfers: completePairs.map((pair) => {
          const outP = players.find((p) => p.id === pair.outId)!;
          const inP = players.find((p) => p.id === pair.inId)!;
          return {
            outSourceId: pair.outId,
            inSourceId: pair.inId,
            priceOut: outP.price,
            priceIn: inP.price,
            cost: inP.price - outP.price,
            hit: 0,
            chip: chipsState.active,
          };
        }),
        chip: chipsState.active,
      }),
    enabled:
      isCloud &&
      !!owned.snapshot?.teamId &&
      !!owned.snapshot.currentGameweekId &&
      completePairs.length > 0 &&
      completePairs.length === outIds.length,
    retry: false,
  });

  if (screen.phase !== "ready" || !team || !gameweek) {
    return (
      <>
        <UiHeader kicker={t("fantasy.title")} title={t("fpl.transfers")} backTo="/fantasy" />
        <FantasyScreenGate state={screen} next="/fantasy/transfers">
          <div />
        </FantasyScreenGate>
      </>
    );
  }

  const playerOf = (id: string) => players.find((p) => p.id === id);
  const locked = evaluateDeadline(gameweek.deadline).isLocked;

  // Squad after pending transfers.
  const slots: BuilderSlot[] = team.squad
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((s) => {
      const current = playerOf(s.playerId);
      const outIndex = outIds.indexOf(s.playerId);
      const incomingId = outIndex >= 0 ? (inIds[outIndex] ?? null) : null;
      const incoming = incomingId ? (playerOf(incomingId) ?? null) : null;
      const position = current?.position ?? "MID";
      if (outIndex >= 0) {
        return { slot: s.slot, position, player: incoming, highlighted: !!incoming };
      }
      return {
        slot: s.slot,
        position,
        player: current ?? null,
        isCaptain: s.isCaptain,
        isViceCaptain: s.isViceCaptain,
      };
    });
  const originalIdOf = (slot: BuilderSlot) =>
    team.squad.find((s) => s.slot === slot.slot)?.playerId ?? null;
  const squadIdsAfter = slots.map((s) => s.player?.id).filter(Boolean) as string[];

  const outPlayers = completePairs.map((p) => playerOf(p.outId)!).filter(Boolean);
  const inPlayers = completePairs.map((p) => playerOf(p.inId)!).filter(Boolean);
  const netCost =
    inPlayers.reduce((sum, p) => sum + p.price, 0) -
    outPlayers.reduce((sum, p) => sum + p.price, 0);
  // Bank for the picker: current bank plus the value freed by every player marked out (including those not yet replaced).
  const freedValue = outIds.reduce((sum, id) => sum + (playerOf(id)?.price ?? 0), 0);
  const committedIn = inIds.reduce((sum, id) => sum + (id ? (playerOf(id)?.price ?? 0) : 0), 0);
  const pickerBank = Math.round((team.bank + freedValue - committedIn) * 10) / 10;

  const localPreview = previewTransfers({
    team,
    chips: chipsState,
    outIds: completePairs.map((p) => p.outId),
    inIds: completePairs.map((p) => p.inId),
    netCost,
  });
  const preview =
    isCloud && serverPreview.data
      ? {
          totalTransfers: serverPreview.data.transferCount,
          free: serverPreview.data.freeTransfersUsed,
          paid: serverPreview.data.transferCount - serverPreview.data.freeTransfersUsed,
          hitPoints: serverPreview.data.pointHit,
          bankAfter: serverPreview.data.bankAfter,
          freeTransfersAfter:
            serverPreview.data.freeTransfersBefore - serverPreview.data.freeTransfersUsed,
          overBudget: false,
        }
      : localPreview;

  const pendingOutWithoutIn = outIds.length !== completePairs.length;
  const canNext =
    completePairs.length > 0 &&
    !pendingOutWithoutIn &&
    !locked &&
    !preview.overBudget &&
    (!isCloud || (!!serverPreview.data && !serverPreview.isError));

  // ---- Interactions ----
  const startReplace = (playerId: string) => {
    if (locked) {
      toast.error(t("fpl.deadline_passed"));
      return;
    }
    setPickerFor(playerId);
  };
  const markOut = (playerId: string) => {
    if (outIds.includes(playerId)) return;
    const nextOut = [...outIds, playerId];
    const nextIn = [...inIds, null];
    setOutIds(nextOut);
    setInIds(nextIn);
    persistDraft(nextOut, nextIn);
  };
  const undoOut = (playerId: string) => {
    const index = outIds.indexOf(playerId);
    if (index < 0) return;
    const nextOut = outIds.filter((_, i) => i !== index);
    const nextIn = inIds.filter((_, i) => i !== index);
    setOutIds(nextOut);
    setInIds(nextIn);
    persistDraft(nextOut, nextIn);
  };
  const onPick = (player: FantasyPlayer) => {
    if (!pickerFor) return;
    const outP = playerOf(pickerFor);
    if (!outP || player.position !== outP.position) {
      toast.error(t("fantasy.team.hint.position_incompatible"));
      return;
    }
    const nextIds = squadIdsAfter.filter(
      (id) => id !== pickerFor && id !== (inIds[outIds.indexOf(pickerFor)] ?? ""),
    );
    if (nextIds.filter((id) => playerOf(id)?.clubId === player.clubId).length >= 3) {
      toast.error(t("fpl.club_limit"));
      return;
    }
    let nextOut = outIds;
    let nextIn = inIds.slice();
    const index = outIds.indexOf(pickerFor);
    if (index < 0) {
      nextOut = [...outIds, pickerFor];
      nextIn = [...inIds, player.id];
    } else {
      nextIn[index] = player.id;
    }
    // Same player back in → cancel the transfer.
    if (player.id === pickerFor) {
      const i = nextOut.indexOf(pickerFor);
      nextOut = nextOut.filter((_, k) => k !== i);
      nextIn = nextIn.filter((_, k) => k !== i);
    }
    setOutIds(nextOut);
    setInIds(nextIn);
    persistDraft(nextOut, nextIn);
    setPickerFor(null);
  };
  const reset = () => {
    setOutIds([]);
    setInIds([]);
    setIncoming(null);
    persistDraft([], []);
  };
  /** Add Player (incoming first): fill a pending same-position slot, otherwise ask which player leaves. */
  const onPickIncoming = (player: FantasyPlayer) => {
    setPickerAny(false);
    if (squadIdsAfter.includes(player.id)) return;
    const pendingIndex = outIds.findIndex(
      (id, index) => !inIds[index] && playerOf(id)?.position === player.position,
    );
    if (pendingIndex >= 0) {
      const outId = outIds[pendingIndex]!;
      const others = squadIdsAfter.filter((id) => id !== outId);
      if (others.filter((id) => playerOf(id)?.clubId === player.clubId).length >= 3) {
        toast.error(t("fpl.club_limit"));
        return;
      }
      const nextIn = inIds.slice();
      nextIn[pendingIndex] = player.id;
      setInIds(nextIn);
      persistDraft(outIds, nextIn);
      return;
    }
    setIncoming(player);
  };
  /** Replace mode: the tapped same-position card leaves for the chosen incoming player. */
  const completeIncoming = (slot: BuilderSlot) => {
    if (!incoming) return;
    const originalId = originalIdOf(slot);
    if (!originalId) return;
    const leavingId = slot.player?.id ?? null;
    const others = squadIdsAfter.filter((id) => id !== leavingId);
    if (others.filter((id) => playerOf(id)?.clubId === incoming.clubId).length >= 3) {
      toast.error(t("fpl.club_limit"));
      return;
    }
    const leavingPrice = slot.player?.price ?? 0;
    if (incoming.price > pickerBank + leavingPrice + 0.001) {
      toast.error(t("fpl.budget_exceeded"));
      return;
    }
    let nextOut = outIds.slice();
    let nextIn = inIds.slice();
    const index = outIds.indexOf(originalId);
    if (index < 0) {
      nextOut = [...nextOut, originalId];
      nextIn = [...nextIn, incoming.id];
    } else {
      nextIn[index] = incoming.id;
    }
    if (incoming.id === originalId) {
      const i = nextOut.indexOf(originalId);
      nextOut = nextOut.filter((_, k) => k !== i);
      nextIn = nextIn.filter((_, k) => k !== i);
    }
    setOutIds(nextOut);
    setInIds(nextIn);
    persistDraft(nextOut, nextIn);
    setIncoming(null);
  };

  const activateTransferChip = async (key: ChipKey) => {
    const check = canActivateChip(chipsState, key, { deadlinePassed: locked });
    if (!check.ok) {
      toast.error(t((check.reasonKey ?? "fantasy.engine.chip_conflict") as TranslationKey));
      return;
    }
    if (isCloud) {
      if (!owned.snapshot?.currentGameweekId) return;
      setBusy(true);
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
            owned.repo.activateChip({
              gameweekId: owned.snapshot!.currentGameweekId!,
              chip: key,
              expectedVersion: owned.snapshot!.version,
            }),
          args: undefined,
        },
      );
      setBusy(false);
      if (res.ok) toast.success(t("fantasy.chip.activated"));
      else toast.error(t("fantasy.chip.state.unavailable"));
      return;
    }
    fantasyStateStore.write({
      chips: activateChip(chipsState, key, { gameweek: gameweek.number, team }),
    });
    toast.success(t("fantasy.chip.activated"));
  };

  const confirm = async () => {
    const applied = applyConfirmedTransfers({
      team,
      chips: chipsState,
      outIds: completePairs.map((p) => p.outId),
      inIds: completePairs.map((p) => p.inId),
      netCost,
      deadlineIso: gameweek.deadline,
    });
    if (!applied.ok) {
      toast.error(
        t(
          applied.error === "deadline_passed"
            ? "fantasy.transfers.error.deadline"
            : applied.error === "over_budget"
              ? "fantasy.transfers.error.over_budget"
              : "fantasy.transfers.error.no_changes",
        ),
      );
      return;
    }
    const v = applied.value;
    setBusy(true);
    try {
      if (isCloud && owned.snapshot?.currentGameweekId) {
        const purchasePrices: Record<string, number> = { ...owned.snapshot.purchasePrices };
        const transfers = completePairs.map((pair) => {
          const outP = playerOf(pair.outId)!;
          const inP = playerOf(pair.inId)!;
          purchasePrices[pair.inId] = inP.price;
          delete purchasePrices[pair.outId];
          return {
            outSourceId: pair.outId,
            inSourceId: pair.inId,
            priceOut: outP.price,
            priceIn: inP.price,
            cost: inP.price - outP.price,
            hit: 0,
            chip: v.chips.active ?? null,
          };
        });
        const lifecycle = owned.snapshot.lifecycle;
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
              owned.repo.confirmTransfers({
                expectedVersion: owned.snapshot!.version,
                formation: team.formation,
                bank: v.nextBank,
                freeTransfers: v.nextFreeTransfers,
                pendingTransfers: v.pendingTransfers,
                squad: v.nextSquad,
                purchasePrices,
                currentGameweekId: owned.snapshot!.currentGameweekId!,
                lifecycle: {
                  ...lifecycle,
                  chips: v.chips,
                  transferHitPoints: lifecycle.transferHitPoints + v.hitPointsApplied,
                },
                transfers,
              }),
            args: undefined,
            matchingDraftKey: draftKey ?? undefined,
            savedIdleAfterMs: 2400,
          },
        );
        if (res.ok) {
          toast.success(t("fpl.transfers_confirmed"));
          setOutIds([]);
          setInIds([]);
          setConfirming(false);
          return;
        }
        if (draftKey)
          fantasyDraftsStore.save<TransfersDraftPayload>(draftKey, {
            outIds,
            inIds: inIds.filter(Boolean) as string[],
          });
        const c = classifyRepoError(res.error);
        toast.error(
          t(
            c.isConflict
              ? "fantasy.error.version_conflict"
              : c.isNetwork
                ? "fantasy.error.network"
                : c.isPermission
                  ? "fantasy.error.permission"
                  : "fantasy.error.transfer_failed",
          ),
        );
        if (c.isConflict) await owned.reload();
        return;
      }
      fantasyService.saveTeam({
        squad: v.nextSquad,
        bank: v.nextBank,
        freeTransfers: v.nextFreeTransfers,
        pendingTransfers: v.pendingTransfers,
      });
      fantasyStateStore.write({
        chips: v.chips,
        transferHitPoints: fantasyStateStore.read().transferHitPoints + v.hitPointsApplied,
      });
      await qc.invalidateQueries({ queryKey: ["owned-fantasy"] });
      toast.success(t("fpl.transfers_confirmed"));
      setOutIds([]);
      setInIds([]);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  if (confirming) {
    return (
      <TransferConfirmScreen
        pairs={completePairs.map((p) => ({ out: playerOf(p.outId)!, in: playerOf(p.inId)! }))}
        clubs={clubs}
        gameweek={gameweek.number}
        deadlineIso={gameweek.deadline}
        freeUsed={preview.free}
        paidUsed={preview.paid}
        hitPoints={preview.hitPoints}
        bankAfter={preview.bankAfter}
        chips={(["wildcard", "free_hit"] as ChipKey[]).map((key) => ({
          key,
          state: chipDisplayState(chipsState, key),
        }))}
        onChip={(key) => void activateTransferChip(key)}
        onEdit={() => setConfirming(false)}
        onConfirm={() => void confirm()}
        busy={busy}
      />
    );
  }

  const wildcardState = chipDisplayState(chipsState, "wildcard");
  const freeTransfersLabel =
    chipsState.active === "wildcard" || chipsState.active === "free_hit"
      ? t("fpl.unlimited")
      : String(team.freeTransfers);
  const pickerOut = pickerFor ? playerOf(pickerFor) : undefined;
  const maxSquadPrice = Math.max(0, ...squadIdsAfter.map((id) => playerOf(id)?.price ?? 0));
  const sheetSlot = sheetFor ? slots.find((s) => originalIdOf(s) === sheetFor) : undefined;
  const sheetPlayer = sheetSlot?.player ?? (sheetFor ? (playerOf(sheetFor) ?? null) : null);
  const pickerIndex = pickerFor ? outIds.indexOf(pickerFor) : -1;
  const pickerCurrentIn = pickerIndex >= 0 ? inIds[pickerIndex] : null;
  const pickerBudget =
    Math.round(
      (pickerBank +
        (pickerIndex < 0 ? (pickerOut?.price ?? 0) : 0) +
        (pickerCurrentIn ? (playerOf(pickerCurrentIn)?.price ?? 0) : 0)) *
        10,
    ) / 10;

  /**
   * The three-per-club rule, answered for the picker BEFORE the tap — the same
   * count `onPick` runs when the tap arrives, not a second implementation of
   * the rule. Replacing a named player: the squad minus that player (and minus
   * whoever is already pencilled in for him) must hold fewer than three from
   * the incoming player's club.
   */
  const clubLimitForReplacement = (player: FantasyPlayer) => {
    if (!pickerFor) return false;
    const others = squadIdsAfter.filter((id) => id !== pickerFor && id !== pickerCurrentIn);
    return others.filter((id) => playerOf(id)?.clubId === player.clubId).length >= 3;
  };

  /**
   * Incoming-first ("Add Player"): nobody has been named to leave yet, so the
   * pick is legal as long as SOME same-position squad member could make room.
   * With three from a club already and none of them in this player's position,
   * no legal swap exists and the row is blocked up front.
   */
  const clubLimitForIncoming = (player: FantasyPlayer) => {
    const sameClub = squadIdsAfter.filter((id) => playerOf(id)?.clubId === player.clubId);
    if (sameClub.length < 3) return false;
    return !sameClub.some((id) => playerOf(id)?.position === player.position);
  };

  return (
    <>
      <SquadBuilderScreen
        title={t("fpl.transfers")}
        kicker={t("fantasy.title")}
        backTo="/fantasy"
        gameweek={gameweek.number}
        deadlineIso={gameweek.deadline}
        stats={[
          {
            label: t("fpl.free_transfers"),
            value: freeTransfersLabel,
            // "Illimité" under a Wildcard / Free Hit is a word, not a figure.
            text: chipsState.active === "wildcard" || chipsState.active === "free_hit",
            // The board's three columns (A-Players): the Wildcard's state
            // rides under the free transfers it multiplies, rather than as a
            // fourth column too narrow for "INDISPONIBLE".
            sub: `${t("fpl.wildcard")} · ${
              wildcardState === "active"
                ? t("fpl.state.active")
                : wildcardState === "available"
                  ? t("fpl.state.play")
                  : t("fpl.state.unavailable")
            }`,
          },
          { label: t("fpl.cost"), value: String(preview.hitPoints) },
          {
            label: t("fpl.bank"),
            value: nf.format(completePairs.length > 0 ? preview.bankAfter : pickerBank),
          },
        ]}
        slots={slots}
        clubs={clubs}
        players={players}
        view={view}
        onViewChange={setView}
        incoming={incoming}
        onCancelIncoming={() => setIncoming(null)}
        onSlotTap={(s) => {
          const originalId = originalIdOf(s);
          if (!originalId) return;
          if (incoming) {
            completeIncoming(s);
            return;
          }
          if (!s.player) {
            startReplace(originalId);
            return;
          }
          setSheetFor(originalId);
        }}
        onAddPlayer={() => {
          if (locked) {
            toast.error(t("fpl.deadline_passed"));
            return;
          }
          const pending = outIds.find((id, index) => !inIds[index]);
          if (pending) startReplace(pending);
          else setPickerAny(true);
        }}
        onNext={() => setConfirming(true)}
        nextDisabled={!canNext}
        onReset={reset}
        resetDisabled={outIds.length === 0 && !incoming}
        listColumns={[
          {
            key: "form",
            label: t("fpl.form"),
            // BG-0071: a dash, not 0.0, while no gameweek has scored.
            render: (p) => (p.form === null ? t("fantasy.stat.none") : nf.format(p.form)),
          },
          { key: "price", label: t("fpl.current_price"), render: (p) => nf.format(p.price) },
          { key: "sell", label: t("fpl.selling_price"), render: (p) => nf.format(p.price) },
          {
            key: "buy",
            label: t("fpl.purchase_price"),
            render: (p) => nf.format(owned.snapshot?.purchasePrices[p.id] ?? p.price),
          },
        ]}
      />

      {pickerFor && pickerOut ? (
        <AddPlayerScreen
          players={players}
          clubs={clubs}
          bank={pickerBudget}
          position={pickerOut.position}
          lockPosition
          clubLimitReached={clubLimitForReplacement}
          disabledIds={[...squadIdsAfter.filter((id) => id !== pickerCurrentIn), pickerFor]}
          currentPlayerId={pickerCurrentIn}
          onPick={onPick}
          onClose={() => setPickerFor(null)}
        />
      ) : pickerAny ? (
        <AddPlayerScreen
          players={players}
          clubs={clubs}
          bank={Math.round((pickerBank + maxSquadPrice) * 10) / 10}
          clubLimitReached={clubLimitForIncoming}
          disabledIds={squadIdsAfter}
          onPick={onPickIncoming}
          onClose={() => setPickerAny(false)}
        />
      ) : null}

      <PlayerActionSheet
        open={sheetFor !== null}
        player={sheetPlayer}
        club={sheetPlayer ? findClub(clubs, sheetPlayer.clubId) : undefined}
        isStarter={false}
        onClose={() => setSheetFor(null)}
        onTransferOut={
          sheetFor && !outIds.includes(sheetFor)
            ? () => {
                const id = sheetFor;
                setSheetFor(null);
                if (locked) {
                  toast.error(t("fpl.deadline_passed"));
                  return;
                }
                markOut(id);
                startReplace(id);
              }
            : undefined
        }
        onUndo={
          sheetFor && outIds.includes(sheetFor)
            ? () => {
                undoOut(sheetFor);
                setSheetFor(null);
              }
            : undefined
        }
      />
    </>
  );
}
