import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { FplChipsRow } from "@/components/fpl/FplChipsRow";
import { FplPitch } from "@/components/fpl/FplPitch";
import { FplPlayerCard } from "@/components/fpl/FplPlayerCard";
import { PlayerActionSheet } from "@/components/fpl/PlayerActionSheet";
import { SquadListTable } from "@/components/fpl/SquadListTable";
import { FplButton, FplDeadlineLine, FplHeader, FplSegmented } from "@/components/fpl/primitives";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import { useNextFixtures } from "@/components/fpl/useNextFixtures";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import {
  activateChip,
  canActivateChip,
  chipDisplayState,
  deactivateChip,
  evaluateDeadline,
  type ChipKey,
  type ChipsState,
} from "@/lib/fantasy-engine";
import { reslotForFormation, swapSquadMembers } from "@/lib/reslot";
import { validateTeam } from "@/lib/team-validation";
import { fantasyDraftsStore, type FantasyDraftKey } from "@/services/fantasy-drafts-store";
import { runOwnedMutation, classifyRepoError } from "@/services/fantasy-mutation-controller";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyService } from "@/services/fantasy-runtime";
import { fantasyStateStore } from "@/services/fantasy-state";
import { FORMATIONS, type FormationKey, type SquadPlayer } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/team")({
  component: PickTeamPage,
});

interface TeamDraftPayload {
  squad: SquadPlayer[];
  formation: FormationKey;
}
function isTeamDraftPayload(v: unknown): v is TeamDraftPayload {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<TeamDraftPayload>;
  return Array.isArray(p.squad) && typeof p.formation === "string";
}

const PICK_TEAM_CHIPS: ChipKey[] = ["bench_boost", "free_hit", "triple_captain"];

/** Derive the formation from the starting XI so a swap DEF↔MID or bench move re-slots correctly. */
function formationOf(
  squad: SquadPlayer[],
  posOf: (id: string) => string | undefined,
): FormationKey {
  const xi = squad.filter((s) => s.slot < 12);
  const count = (pos: string) => xi.filter((s) => posOf(s.playerId) === pos).length;
  const key = `${count("DEF")}-${count("MID")}-${count("FWD")}` as FormationKey;
  return key in FORMATIONS ? key : "4-4-2";
}

/**
 * FPL-008/009/010 "Pick Team" reconstructed: Back header with deadline line
 * and Squad/List control, chip cards, the pitch with fixture plates and the
 * labelled bench. Pending changes (lineup edits or a chip activation) switch
 * the header to "✕ Cancel / ✓ Confirm" as in the reference.
 */
function PickTeamPage() {
  return (
    <FantasyFrame>
      <PickTeamBody />
    </FantasyFrame>
  );
}

function PickTeamBody() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const { user } = useAuth();
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
  const fixtures = useNextFixtures(clubs, gameweek?.number ?? null, screen.phase === "ready");

  const [view, setView] = useState<"squad" | "list">("squad");
  const [localSquad, setLocalSquad] = useState<SquadPlayer[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [pendingChip, setPendingChip] = useState<ChipKey | null>(null);
  const [saving, setSaving] = useState(false);

  const chipsState: ChipsState = isCloud
    ? (owned.snapshot?.lifecycle.chips ?? { active: null, used: [] })
    : fantasyStateStore.read().chips;

  const deadlineLocked = gameweek ? evaluateDeadline(gameweek.deadline).isLocked : false;

  // ---- Draft persistence (cloud only) ----
  const draftKey = useMemo<FantasyDraftKey | null>(() => {
    if (!isCloud || !owned.userId) return null;
    return {
      uid: owned.userId,
      teamId: owned.snapshot?.teamId ?? "new",
      baseVersion: owned.snapshot?.version ?? 0,
      kind: "team",
    };
  }, [isCloud, owned.userId, owned.snapshot?.teamId, owned.snapshot?.version]);
  const draftInit = useRef(false);
  useEffect(() => {
    draftInit.current = false;
  }, [draftKey?.uid, draftKey?.teamId, draftKey?.baseVersion]);
  useEffect(() => {
    if (!draftKey || !team || draftInit.current) return;
    const entry = fantasyDraftsStore.read<TeamDraftPayload>(draftKey);
    if (entry && isTeamDraftPayload(entry.payload) && entry.payload.squad.length === 15) {
      setLocalSquad(entry.payload.squad);
    }
    draftInit.current = true;
  }, [draftKey, team]);

  if (screen.phase !== "ready" || !team || !gameweek) {
    return (
      <>
        <FplHeader title={t("fpl.pick_team")} backTo="/fantasy" />
        <FantasyScreenGate state={screen} next="/fantasy/team">
          <div />
        </FantasyScreenGate>
      </>
    );
  }

  const playerOf = (id: string) => players.find((p) => p.id === id);
  const clubOf = (id: string) => clubs.find((c) => c.id === id);
  const posOf = (id: string) => playerOf(id)?.position;
  const squad = localSquad ?? team.squad;
  const formation = formationOf(squad, posOf);
  const cfg = FORMATIONS[formation];
  const dirty = localSquad !== null;

  const persistDraft = (next: SquadPlayer[]) => {
    if (!draftKey) return;
    fantasyDraftsStore.save<TeamDraftPayload>(draftKey, {
      squad: next,
      formation: formationOf(next, posOf),
    });
  };
  const applyLocal = (next: SquadPlayer[]) => {
    setLocalSquad(next);
    persistDraft(next);
  };
  const cancelChanges = () => {
    setLocalSquad(null);
    setSelectedId(null);
    setPendingChip(null);
    if (draftKey) fantasyDraftsStore.remove(draftKey);
  };

  // ---- Interactions ----
  const onCardTap = (playerId: string) => {
    if (deadlineLocked) {
      toast.error(t("fpl.deadline_passed"));
      return;
    }
    if (selectedId) {
      if (selectedId === playerId) {
        setSelectedId(null);
        return;
      }
      const next = swapSquadMembers(squad, players, formation, selectedId, playerId);
      if (!next) {
        toast.error(t("fantasy.team.hint.position_incompatible"));
        return;
      }
      const nextFormation = formationOf(next, posOf);
      applyLocal(reslotForFormation({ squad: next, players, formation: nextFormation }));
      setSelectedId(null);
      return;
    }
    setSheetFor(playerId);
  };

  const setCaptain = (playerId: string, vice: boolean) => {
    const next = squad.map((s) =>
      vice
        ? {
            ...s,
            isViceCaptain: s.playerId === playerId,
            isCaptain: s.isCaptain && s.playerId !== playerId,
          }
        : {
            ...s,
            isCaptain: s.playerId === playerId,
            isViceCaptain: s.isViceCaptain && s.playerId !== playerId,
          },
    );
    applyLocal(next);
    setSheetFor(null);
  };

  const save = async () => {
    const validation = validateTeam(squad, formation, players);
    if (!validation.ok) {
      toast.error(t(`fantasy.team.error.${validation.error}` as TranslationKey));
      return;
    }
    if (deadlineLocked) {
      toast.error(t("fpl.deadline_passed"));
      cancelChanges();
      return;
    }
    setSaving(true);
    try {
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
                managerName: user?.displayName?.trim() || team.managerName || null,
                formation,
                bank: team.bank,
                freeTransfers: team.freeTransfers,
                pendingTransfers: team.pendingTransfers,
                squad,
                purchasePrices: owned.snapshot?.purchasePrices ?? {},
                expectedVersion: owned.snapshot?.version ?? 0,
                currentGameweekId: owned.snapshot?.currentGameweekId ?? null,
                lifecycle: owned.snapshot?.lifecycle ?? fantasyStateStore.read(),
              }),
            args: undefined,
            matchingDraftKey: draftKey,
            savedIdleAfterMs: 2400,
          },
        );
        if (res.ok) {
          setLocalSquad(null);
          setSelectedId(null);
          toast.success(t("fpl.team_saved"));
          return;
        }
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
      fantasyService.saveTeam({ formation, squad });
      await qc.invalidateQueries({ queryKey: ["owned-fantasy"] });
      setLocalSquad(null);
      toast.success(t("fpl.team_saved"));
    } finally {
      setSaving(false);
    }
  };

  // ---- Chips ----
  const chipViews = PICK_TEAM_CHIPS.map((key) => ({
    key,
    state: pendingChip === key ? ("active" as const) : chipDisplayState(chipsState, key),
  }));
  const onChipSelect = (key: ChipKey) => {
    const check = canActivateChip(chipsState, key, { deadlinePassed: deadlineLocked });
    if (!check.ok) {
      toast.error(t((check.reasonKey ?? "fantasy.engine.chip_conflict") as TranslationKey));
      return;
    }
    setPendingChip(key);
  };
  const confirmChip = async () => {
    if (!pendingChip) return;
    setSaving(true);
    try {
      if (isCloud) {
        if (!owned.snapshot?.currentGameweekId) {
          toast.error(t("fantasy.chip.state.unavailable"));
          return;
        }
        const chip = pendingChip;
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
                chip,
                expectedVersion: owned.snapshot!.version,
              }),
            args: undefined,
            savedIdleAfterMs: 2400,
          },
        );
        if (res.ok) toast.success(t("fantasy.chip.activated"));
        else {
          const c = classifyRepoError(res.error);
          toast.error(
            t(c.isConflict ? "fantasy.error.version_conflict" : "fantasy.chip.state.unavailable"),
          );
          if (c.isConflict) await owned.reload();
        }
      } else {
        fantasyStateStore.write({
          chips: activateChip(chipsState, pendingChip, { gameweek: gameweek.number, team }),
        });
        toast.success(t("fantasy.chip.activated"));
      }
    } finally {
      setPendingChip(null);
      setSaving(false);
    }
  };
  const cancelActiveChip = async () => {
    if (isCloud) {
      if (!owned.snapshot?.currentGameweekId || !owned.snapshot.activeChipCancellable) {
        toast.error(t("fantasy.chip.state.unavailable"));
        return;
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
            owned.repo.cancelChip({
              gameweekId: owned.snapshot!.currentGameweekId!,
              expectedVersion: owned.snapshot!.version,
            }),
          args: undefined,
        },
      );
      if (res.ok) toast.success(t("fantasy.chip.cancelled"));
      else toast.error(t("fantasy.chip.state.unavailable"));
      return;
    }
    fantasyStateStore.write({ chips: deactivateChip(chipsState) });
    toast.success(t("fantasy.chip.cancelled"));
  };

  const confirmPending = dirty || pendingChip !== null;
  const onConfirm = () => (pendingChip ? void confirmChip() : void save());

  // ---- Pitch composition ----
  const xi = squad.filter((s) => s.slot < 12).sort((a, b) => a.slot - b.slot);
  const bench = squad.filter((s) => s.slot >= 12).sort((a, b) => a.slot - b.slot);
  const rowFor = (pos: string, limit: number) =>
    xi.filter((s) => posOf(s.playerId) === pos).slice(0, limit);
  const card = (s: SquadPlayer) => {
    const p = playerOf(s.playerId);
    if (!p) return <div key={s.playerId} />;
    return (
      <FplPlayerCard
        key={s.playerId}
        player={p}
        club={clubOf(p.clubId)}
        sub={fixtures.labels.get(p.clubId) ?? nf.format(p.price)}
        captain={!!s.isCaptain}
        vice={!!s.isViceCaptain}
        highlighted={selectedId === s.playerId}
        onClick={() => onCardTap(s.playerId)}
      />
    );
  };
  const benchLabels = bench.map((s, index) =>
    index === 0
      ? t("fpl.gkp")
      : `${index}. ${t(`player.pos.${posOf(s.playerId) ?? "DEF"}` as TranslationKey)}`,
  );

  const activeBenchBoost = pendingChip === "bench_boost" || chipsState.active === "bench_boost";

  return (
    <>
      <FplHeader
        title={t("fpl.pick_team")}
        backTo={confirmPending ? undefined : "/fantasy"}
        onBack={confirmPending ? cancelChanges : undefined}
        right={
          confirmPending ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className="inline-flex min-h-9 items-center gap-1 rounded-[6px] bg-[color:var(--fpl-ink)] px-3 text-[14px] font-extrabold text-[color:var(--fpl-green)] disabled:opacity-60"
            >
              <Check className="h-4 w-4" aria-hidden />
              {saving ? t("fpl.saving") : t("fpl.confirm")}
            </button>
          ) : null
        }
      >
        <FplDeadlineLine gameweek={gameweek.number} deadlineIso={gameweek.deadline} />
        <FplSegmented
          className="mt-3"
          value={view}
          onChange={setView}
          options={[
            { value: "squad", label: t("fpl.squad") },
            { value: "list", label: t("fpl.list") },
          ]}
        />
      </FplHeader>
      {confirmPending ? <style>{`.fpl-cancel-label{display:none}`}</style> : null}

      <div className="px-3 pt-3">
        <FplChipsRow chips={chipViews} onSelect={deadlineLocked ? undefined : onChipSelect} />
        {chipsState.active &&
        !pendingChip &&
        (owned.snapshot?.activeChipCancellable || !isCloud) ? (
          <button
            type="button"
            onClick={() => void cancelActiveChip()}
            className="mt-2 w-full text-center text-[12px] font-bold text-[color:var(--fpl-ink)] underline"
          >
            {t("fantasy.chip.deactivate")}
          </button>
        ) : null}
      </div>

      {view === "squad" ? (
        <div className="mt-3">
          <FplPitch
            rows={[
              rowFor("GK", 1).map(card),
              rowFor("DEF", cfg.DEF).map(card),
              rowFor("MID", cfg.MID).map(card),
              rowFor("FWD", cfg.FWD).map(card),
            ]}
            bench={bench.map(card)}
            benchLabels={benchLabels}
            benchHighlighted={activeBenchBoost}
          />
        </div>
      ) : (
        <div className="mt-3">
          <SquadListTable
            squad={squad}
            players={players}
            clubs={clubs}
            onRowClick={onCardTap}
            columns={[
              { key: "form", label: t("fpl.form"), render: (p) => p.form.toFixed(1) },
              { key: "price", label: t("fpl.current_price"), render: (p) => nf.format(p.price) },
              { key: "sel", label: t("fpl.selected"), render: (p) => `${p.ownership.toFixed(1)}%` },
            ]}
          />
        </div>
      )}

      {selectedId ? (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <FplButton variant="ink" onClick={() => setSelectedId(null)}>
            <X className="h-4 w-4" aria-hidden /> {t("fpl.cancel")} — {t("fpl.substitute")}
          </FplButton>
        </div>
      ) : null}

      <PlayerActionSheet
        open={!!sheetFor}
        player={sheetFor ? (playerOf(sheetFor) ?? null) : null}
        club={sheetFor ? clubOf(playerOf(sheetFor)?.clubId ?? "") : undefined}
        isStarter={!!sheetFor && (squad.find((s) => s.playerId === sheetFor)?.slot ?? 99) < 12}
        onClose={() => setSheetFor(null)}
        onCaptain={sheetFor ? () => setCaptain(sheetFor, false) : undefined}
        onVice={sheetFor ? () => setCaptain(sheetFor, true) : undefined}
        onSubstitute={
          sheetFor
            ? () => {
                setSelectedId(sheetFor);
                setSheetFor(null);
              }
            : undefined
        }
      />
    </>
  );
}
