import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { showStepUpNotice } from "@/auth/step-up-notice";
import { findClub } from "@/components/fpl/club-lookup";
import { countdownText, formatDeadline, useDeadlineCountdown } from "@/components/fpl/deadline";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { FplChipsRow } from "@/components/fpl/FplChipsRow";
import { FplPitch } from "@/components/fpl/FplPitch";
import { FplPlayerCard } from "@/components/fpl/FplPlayerCard";
import { FplStatBar, type FplStatItem } from "@/components/fpl/FplStatBar";
import { GameweekStatusText } from "@/components/fpl/GameweekStatusText";
import { PlayerActionSheet } from "@/components/fpl/PlayerActionSheet";
import { SquadListTable } from "@/components/fpl/SquadListTable";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import { useNextFixtures } from "@/components/fpl/useNextFixtures";
import { ui, UiButton, UiHeader, UiIconButton, UiSegmented } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { fantasyHead } from "@/lib/fantasy-meta";
import { cn } from "@/lib/utils";
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
import { useIntentKey } from "@/services/fantasy-intent-key";
import { runOwnedMutation, classifyRepoError } from "@/services/fantasy-mutation-controller";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyService } from "@/services/fantasy-runtime";
import { fantasyStateStore } from "@/services/fantasy-state";
import { FORMATIONS, type FormationKey, type SquadPlayer } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/team")({
  head: () => fantasyHead("team"),
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
 * FPL-008/009/010 "Pick Team" reconstructed: Back header, the chips, the
 * pitch with fixture plates and the labelled bench. Pending changes (lineup
 * edits or a chip activation) switch the header to "✕ Cancel / ✓ Confirm" as
 * in the reference.
 *
 * Option A (A-Team): the sub-page header carries the gameweek as its kicker;
 * the navy strip under it leads with the deadline — what Pick Team is
 * actually against — with its countdown, then the gameweek's average and best
 * scores once the gameweek has them; the chips are a scrolling row of pills;
 * "Terrain | Liste" is the pill toggle; the pitch is the pastel card with
 * club-colour shirts. The bottom navigation stays (every A board shows it),
 * and the substitute bar sits above it.
 */
function PickTeamPage() {
  return (
    <FantasyFrame bottomNav>
      <PickTeamBody />
    </FantasyFrame>
  );
}

/** "1j 13h 59min", spelled exactly as Home's gameweek countdown (`countdownText`). */
function useCountdownText(deadlineIso: string | undefined): string | null {
  const { t } = useI18n();
  const left = useDeadlineCountdown(deadlineIso);
  if (!left || left.passed) return null;
  return countdownText(left, t);
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
  const countdown = useCountdownText(gameweek?.deadline);

  const [view, setView] = useState<"squad" | "list">("squad");
  const [localSquad, setLocalSquad] = useState<SquadPlayer[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [pendingChip, setPendingChip] = useState<ChipKey | null>(null);
  const [saving, setSaving] = useState(false);
  // One idempotency key per lineup and per chip asked for, reused by a retry
  // of the same one (see `fantasy-intent-key.ts`).
  const lineupKey = useIntentKey();
  const chipKey = useIntentKey();

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
        <UiHeader kicker={t("fantasy.title")} title={t("fpl.pick_team")} backTo="/fantasy" />
        <FantasyScreenGate state={screen} next="/fantasy/team">
          <div />
        </FantasyScreenGate>
      </>
    );
  }

  const playerOf = (id: string) => players.find((p) => p.id === id);
  const clubOf = (id: string) => findClub(clubs, id);
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
        const teamId = owned.snapshot?.teamId ?? null;
        const expectedVersion = owned.snapshot?.version ?? 0;
        const currentGameweekId = owned.snapshot?.currentGameweekId ?? null;
        const idempotencyKey = lineupKey.for([teamId, expectedVersion, currentGameweekId, squad]);
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
                teamId,
                idempotencyKey,
                teamName: team.teamName,
                managerName: user?.displayName?.trim() || team.managerName || null,
                formation,
                bank: team.bank,
                freeTransfers: team.freeTransfers,
                pendingTransfers: team.pendingTransfers,
                squad,
                purchasePrices: owned.snapshot?.purchasePrices ?? {},
                expectedVersion,
                currentGameweekId,
                lifecycle: owned.snapshot?.lifecycle ?? fantasyStateStore.read(),
              }),
            args: undefined,
            matchingDraftKey: draftKey,
            savedIdleAfterMs: 2400,
          },
        );
        if (res.ok) {
          lineupKey.clear();
          setLocalSquad(null);
          setSelectedId(null);
          toast.success(t("fpl.team_saved"));
          return;
        }
        const c = classifyRepoError(res.error);
        // Refused until the one-time code is in: say that, once (the auth
        // layer says it too, under the same toast id), not "Accès refusé.
        // Reconnectez-vous" -- signing in again is not what is owed. The
        // lineup waits in its draft.
        if (c.isStepUp) showStepUpNotice(t);
        else
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
    if (!pendingChip || saving) return;
    setSaving(true);
    try {
      if (isCloud) {
        if (!owned.snapshot?.currentGameweekId) {
          toast.error(t("fantasy.chip.state.unavailable"));
          return;
        }
        const chip = pendingChip;
        const { teamId, version, currentGameweekId } = owned.snapshot;
        const idempotencyKey = chipKey.for([teamId, version, currentGameweekId, chip]);
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
                teamId,
                gameweekId: currentGameweekId,
                chip,
                expectedVersion: version,
                idempotencyKey,
              }),
            args: undefined,
            savedIdleAfterMs: 2400,
          },
        );
        if (res.ok) {
          chipKey.clear();
          toast.success(t("fantasy.chip.activated"));
        } else {
          const c = classifyRepoError(res.error);
          // Refused until the one-time code is in: the chip is not
          // "Indisponible". The auth layer's notice says what is owed, once.
          if (c.isStepUp) showStepUpNotice(t);
          else
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
    // A second tap while the first is on its way would be refused as stale.
    if (saving) return;
    if (isCloud) {
      if (!owned.snapshot?.currentGameweekId || !owned.snapshot.activeChipCancellable) {
        toast.error(t("fantasy.chip.state.unavailable"));
        return;
      }
      const { teamId, version, currentGameweekId } = owned.snapshot;
      setSaving(true);
      try {
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
                teamId,
                gameweekId: currentGameweekId,
                expectedVersion: version,
              }),
            args: undefined,
          },
        );
        if (res.ok) toast.success(t("fantasy.chip.cancelled"));
        // As for activating it: a code owed is said as such, once.
        else if (classifyRepoError(res.error).isStepUp) showStepUpNotice(t);
        else toast.error(t("fantasy.chip.state.unavailable"));
      } finally {
        setSaving(false);
      }
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

  // ---- Summary strip ----
  const whole = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  // Under the deadline: the time left while the team can still change; once
  // it is locked, the gameweek's own state, when the backend reports one.
  const deadlineSub: ReactNode =
    !deadlineLocked && countdown ? (
      <span className="inline-flex items-center gap-1">
        <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className={ui.text.tabular}>{countdown}</span>
      </span>
    ) : gameweek.status ? (
      <GameweekStatusText
        status={gameweek.status}
        deadlinePassed={deadlineLocked}
        className={ui.text.label}
      />
    ) : deadlineLocked ? (
      t("fpl.deadline_passed")
    ) : null;
  const stripItems: FplStatItem[] = [
    {
      label: t("fpl.deadline"),
      // No weekday: the countdown under it says how far off it is, and with
      // it the date needed two lines in a third of the strip (FR and AR).
      value: <bdi>{formatDeadline(gameweek.deadline, lang)}</bdi>,
      text: true,
      sub: deadlineSub,
    },
    // The gameweek's average and best team scores, only once they exist
    // (BG-0075: null until a team has been scored — never a 0).
    ...(gameweek.averagePoints !== null
      ? [{ label: t("fpl.average"), value: whole.format(gameweek.averagePoints) }]
      : []),
    ...(gameweek.highestPoints !== null
      ? [{ label: t("fpl.highest"), value: whole.format(gameweek.highestPoints) }]
      : []),
  ];
  const activeChipName =
    chipsState.active === "bench_boost"
      ? t("fantasy.chip.bench_boost")
      : chipsState.active === "free_hit"
        ? t("fantasy.chip.free_hit")
        : chipsState.active === "triple_captain"
          ? t("fantasy.chip.triple_captain")
          : chipsState.active === "wildcard"
            ? t("fantasy.chip.wildcard")
            : null;

  return (
    <>
      <UiHeader
        kicker={`${t("fpl.gameweek")} ${gameweek.number}`}
        title={t("fpl.pick_team")}
        backTo="/fantasy"
        leading={
          confirmPending ? (
            // A round ✕ in the Back control's place, not a second labelled
            // pill: with "✓ Confirmer" at the other end, two pills left the
            // title 130px for its 138 (measured) and cut "Composer l’équipe".
            <UiIconButton
              aria-label={t("fpl.cancel")}
              title={t("fpl.cancel")}
              onClick={cancelChanges}
            >
              <X aria-hidden />
            </UiIconButton>
          ) : undefined
        }
        trailing={
          confirmPending ? (
            <UiButton size="sm" variant="ink" onClick={onConfirm} disabled={saving}>
              <Check className="h-4 w-4" aria-hidden />
              {saving ? t("fpl.saving") : t("fpl.confirm")}
            </UiButton>
          ) : null
        }
      />
      <FplStatBar hero items={stripItems} />

      <div className={cn("pt-3", ui.space.gutter)}>
        <FplChipsRow chips={chipViews} onSelect={deadlineLocked ? undefined : onChipSelect} />
        {chipsState.active &&
        activeChipName &&
        !pendingChip &&
        (owned.snapshot?.activeChipCancellable || !isCloud) ? (
          <UiButton
            variant="soft"
            size="sm"
            onClick={() => void cancelActiveChip()}
            disabled={saving}
            className="mt-2"
          >
            <X className="h-4 w-4" aria-hidden />
            {t("fantasy.chip.deactivate")} · {activeChipName}
          </UiButton>
        ) : null}
      </div>

      <div className={cn("pt-3", ui.space.gutter)}>
        <UiSegmented
          variant="pill"
          value={view}
          onChange={setView}
          label={t("fantasy.view.toggle_label")}
          options={[
            { value: "squad", label: t("fantasy.view.pitch") },
            { value: "list", label: t("fpl.list") },
          ]}
        />
      </div>

      {view === "squad" ? (
        <FplPitch
          className="mx-[var(--ui-gutter)] mt-3"
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
      ) : (
        <SquadListTable
          className="mx-[var(--ui-gutter)] mt-3"
          squad={squad}
          players={players}
          clubs={clubs}
          onRowClick={onCardTap}
          columns={[
            {
              key: "form",
              label: t("fpl.form"),
              // BG-0071: a dash, not 0.0, while no gameweek has scored.
              render: (p) => (p.form === null ? t("fantasy.stat.none") : nf.format(p.form)),
            },
            { key: "price", label: t("fpl.current_price"), render: (p) => nf.format(p.price) },
            { key: "sel", label: t("fpl.selected"), render: (p) => `${nf.format(p.ownership)}%` },
          ]}
        />
      )}

      {selectedId ? (
        <>
          {/* Room for the bar below, so the bench can still scroll clear of it. */}
          <div aria-hidden className="h-[var(--ui-row-min)]" />
          <div
            className={cn(
              "fixed inset-x-0 bottom-[var(--bottomnav-h)] z-40 pb-2.5 md:bottom-0 md:pb-4",
              ui.space.content,
              ui.space.gutter,
            )}
          >
            <UiButton
              variant="ink"
              className={ui.shadow.lifted}
              onClick={() => setSelectedId(null)}
            >
              <X className="h-4 w-4" aria-hidden /> {t("fpl.cancel")} — {t("fpl.substitute")}
            </UiButton>
          </div>
        </>
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
