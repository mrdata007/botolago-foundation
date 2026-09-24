import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { AddPlayerScreen } from "@/components/fpl/AddPlayerScreen";
import { findClub } from "@/components/fpl/club-lookup";
import { FantasyUnavailableState } from "@/components/fantasy/FantasyUnavailableState";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyScreenGate } from "@/components/fpl/FantasyScreenGate";
import { FplStatBar } from "@/components/fpl/FplStatBar";
import { PlayerActionSheet } from "@/components/fpl/PlayerActionSheet";
import { SquadBuilderScreen, type BuilderSlot } from "@/components/fpl/SquadBuilderScreen";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import {
  ui,
  UiAlert,
  UiButton,
  UiCard,
  UiHeader,
  UiInput,
  UiKeyValueRow,
} from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { reportOperationalError } from "@/lib/operational-errors";
import { cn } from "@/lib/utils";
import {
  computeSummary,
  createTeamErrorKey,
  draftPurchasePrices,
  draftToSquad,
  initCreateDraft,
  normalizeTeamName,
  placePlayer,
  removePlayer,
  setCaptain as setCaptainOp,
  setTeamName as setTeamNameOp,
  TEAM_NAME_MAX_LENGTH,
  validateDraft,
  validateTeamName,
  type CreateTeamDraft,
  type DraftValidationCode,
} from "@/services/fantasy-create-service";
import { fantasyDraftsStore, type FantasyDraftKey } from "@/services/fantasy-drafts-store";
import { importDecisionService } from "@/services/fantasy-import-decision";
import { runOwnedMutation } from "@/services/fantasy-mutation-controller";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyStateStore } from "@/services/fantasy-state";
import type { FantasyPlayer, SquadPlayer } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/create")({
  component: CreateTeamPage,
});

const VALIDATION_KEYS: Record<DraftValidationCode, TranslationKey> = {
  team_name: "fantasy.create.error.team_name",
  size: "fantasy.create.error.size",
  position_count: "fantasy.create.error.position_count",
  duplicate: "fantasy.create.error.duplicate",
  club_limit: "fantasy.create.error.club_limit",
  budget: "fantasy.create.error.budget",
  formation: "fantasy.create.error.formation",
  captain_missing: "fantasy.create.error.captain_missing",
  vice_missing: "fantasy.create.error.vice_missing",
  captain_vice_same: "fantasy.create.error.captain_vice_same",
  captain_not_in_xi: "fantasy.create.error.captain_not_in_xi",
  vice_not_in_xi: "fantasy.create.error.vice_not_in_xi",
};

function isCreateDraft(v: unknown): v is CreateTeamDraft {
  if (!v || typeof v !== "object") return false;
  const d = v as Partial<CreateTeamDraft>;
  return typeof d.teamName === "string" && Array.isArray(d.slots) && d.slots.length === 15;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * First-time squad selection, reconstructed on the FPL "Transfers" composition
 * (FPL-002 with empty slots → FPL-003 Add Player → FPL-005 filled squad),
 * followed by the team-name step that FPL asks for before entering the squad.
 *
 * Option A: the same screen as Transfers — sub-page header, navy strip,
 * pitch card, the Add / Next dock above the bottom navigation — and the name
 * step keeps that header and strip over one card.
 */
function CreateTeamPage() {
  return (
    <FantasyFrame bottomNav>
      <CreateTeamBody />
    </FantasyFrame>
  );
}

function CreateTeamBody() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const screen = useFantasyScreen({ needsTeam: false });
  const owned = useFantasyOwned();
  const isCloud = owned.source === "cloud";
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  // A manager who already has a squad never lands here.
  useEffect(() => {
    if (screen.phase === "ready" && screen.team) void nav({ to: "/fantasy/team", replace: true });
  }, [screen.phase, screen.team, nav]);

  const draftKey = useMemo<FantasyDraftKey | null>(() => {
    if (owned.source === "local")
      return { uid: "__local__", teamId: "new", baseVersion: 0, kind: "create-team" };
    if (!isCloud || !owned.userId) return null;
    return {
      uid: owned.userId,
      teamId: owned.snapshot?.teamId ?? "new",
      baseVersion: owned.snapshot?.version ?? 0,
      kind: "create-team",
    };
  }, [isCloud, owned.source, owned.userId, owned.snapshot?.teamId, owned.snapshot?.version]);

  const [draft, setDraft] = useState<CreateTeamDraft>(() => initCreateDraft());
  const inited = useRef(false);
  useEffect(() => {
    inited.current = false;
  }, [draftKey?.uid, draftKey?.teamId, draftKey?.baseVersion]);
  useEffect(() => {
    if (inited.current || !draftKey) return;
    const entry = fantasyDraftsStore.read<CreateTeamDraft>(draftKey);
    if (entry && isCreateDraft(entry.payload)) setDraft(entry.payload);
    else
      setDraft(
        initCreateDraft(
          user?.displayName?.trim() ? `${user.displayName.trim().split(" ")[0]} FC` : "",
        ),
      );
    inited.current = true;
  }, [draftKey, user?.displayName]);
  useEffect(() => {
    if (!inited.current || !draftKey) return;
    fantasyDraftsStore.save<CreateTeamDraft>(draftKey, draft);
  }, [draft, draftKey]);

  const [view, setView] = useState<"squad" | "list">("squad");
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [pickerAny, setPickerAny] = useState(false);
  const [sheetSlot, setSheetSlot] = useState<number | null>(null);
  const [step, setStep] = useState<"squad" | "name">("squad");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<TranslationKey | null>(null);

  const players = screen.players;
  const clubs = screen.clubs;
  const gameweek = screen.gameweek;
  const summary = useMemo(() => computeSummary(draft, players), [draft, players]);
  const validation = useMemo(() => validateDraft(draft, players), [draft, players]);
  const playerOf = (id: string | null) => (id ? (players.find((p) => p.id === id) ?? null) : null);

  if (screen.phase !== "ready" || !gameweek) {
    return (
      <>
        <UiHeader kicker={t("fantasy.title")} title={t("fpl.squad_selection")} backTo="/fantasy" />
        <FantasyScreenGate state={screen} next="/fantasy/create" redirectNoTeam={false}>
          <div />
        </FantasyScreenGate>
      </>
    );
  }

  // The gameweek this squad joins. After the current deadline it is the next
  // gameweek (the server names it); with none to join, say so before the
  // manager builds fifteen players for nothing. Mock mode has no enrolment
  // field and keeps the current gameweek.
  const enrolment =
    gameweek.enrolment === undefined
      ? { id: null, number: gameweek.number, deadline: gameweek.deadline }
      : gameweek.enrolment;
  if (!enrolment) {
    return (
      <>
        <UiHeader kicker={t("fantasy.title")} title={t("fpl.squad_selection")} backTo="/fantasy" />
        <div className={cn("pt-4", ui.space.gutter)}>
          <FantasyUnavailableState reason="registration_closed" />
        </div>
      </>
    );
  }
  const enrolmentNotice =
    enrolment.number !== gameweek.number
      ? t("fantasy.create.enrolment_next")
          .replace("{current}", String(gameweek.number))
          .replace("{n}", String(enrolment.number))
      : null;

  const slots: BuilderSlot[] = draft.slots.map((s) => ({
    slot: s.slot,
    position: s.position,
    player: playerOf(s.playerId),
    isCaptain: s.isCaptain,
    isViceCaptain: s.isViceCaptain,
  }));
  const activeSlot =
    pickerSlot === null ? null : (draft.slots.find((s) => s.slot === pickerSlot) ?? null);
  const activeSlotPlayer = playerOf(activeSlot?.playerId ?? null);
  const pickerBank = round1(summary.bankRemaining + (activeSlotPlayer?.price ?? 0));
  const takenIds = draft.slots.map((s) => s.playerId).filter(Boolean) as string[];

  /**
   * The three-per-club count `placeInto` runs, exposed so the picker can show
   * the answer before the tap instead of after the toast. One rule, one
   * implementation, two readers.
   */
  const clubLimitFor = (player: FantasyPlayer, targetSlot: number) =>
    draft.slots.filter(
      (s) => s.slot !== targetSlot && playerOf(s.playerId)?.clubId === player.clubId,
    ).length >= 3;

  /** Positions that still have an empty slot — what "Add Player" can honour. */
  const openPositions = [...new Set(draft.slots.filter((s) => !s.playerId).map((s) => s.position))];

  const placeInto = (targetSlot: number, player: FantasyPlayer, budget: number) => {
    const clubCount = draft.slots.filter(
      (s) => s.slot !== targetSlot && playerOf(s.playerId)?.clubId === player.clubId,
    ).length;
    if (clubCount >= 3) {
      toast.error(t("fpl.club_limit"));
      return false;
    }
    if (player.price > budget + 0.001) {
      toast.error(t("fpl.budget_exceeded"));
      return false;
    }
    setDraft(placePlayer(draft, targetSlot, player.id));
    return true;
  };
  const onPick = (player: FantasyPlayer) => {
    if (pickerSlot === null) return;
    if (placeInto(pickerSlot, player, pickerBank)) setPickerSlot(null);
  };
  /** "Add Player" from the bottom bar: any position, lands in the first empty slot of that position. */
  const onPickAny = (player: FantasyPlayer) => {
    const target = draft.slots.find((s) => !s.playerId && s.position === player.position);
    if (!target) {
      toast.error(t("fpl.no_empty_slot_for_position"));
      return;
    }
    if (placeInto(target.slot, player, round1(summary.bankRemaining))) setPickerAny(false);
  };

  const firstEmpty = draft.slots.find((s) => !s.playerId)?.slot ?? null;

  const save = async () => {
    if (!validation.ok || saving || !draftKey) return;
    setSaving(true);
    setSaveError(null);
    try {
      const squad: SquadPlayer[] = draftToSquad(draft);
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
              teamName: normalizeTeamName(draft.teamName),
              managerName: user?.displayName?.trim() ? user.displayName.trim() : null,
              formation: draft.formation,
              bank: round1(summary.bankRemaining),
              freeTransfers: 1,
              pendingTransfers: 0,
              squad,
              purchasePrices: draftPurchasePrices(draft, players),
              expectedVersion: owned.snapshot?.version ?? 0,
              // The gameweek shown on this screen, never a closed one: the
              // server refuses anything but the gameweek a new team joins.
              currentGameweekId: enrolment.id ?? owned.snapshot?.currentGameweekId ?? null,
              lifecycle: owned.snapshot?.lifecycle ?? fantasyStateStore.read(),
            }),
          args: undefined,
          matchingDraftKey: draftKey,
          savedIdleAfterMs: 2400,
        },
      );
      if (res.ok) {
        if (owned.userId) importDecisionService.markImported(owned.userId);
        toast.success(t("fantasy.create.success"));
        await owned.reload();
        void nav({ to: "/fantasy/team" });
        return;
      }
      // The real refusal goes to the operational log (code only, no squad or
      // personal data); the manager gets the reason in words.
      reportOperationalError("fantasy.create_team", res.error.domainCode ?? res.error.code, {
        repoCode: res.error.code,
      });
      if (res.error.code === "already_exists") {
        await owned.reload();
        void nav({ to: "/fantasy/team", replace: true });
      }
      const key: TranslationKey = createTeamErrorKey(res.error);
      setSaveError(key);
      toast.error(t(key));
    } finally {
      setSaving(false);
    }
  };

  if (step === "name") {
    const nameCheck = validateTeamName(draft.teamName);
    const blocking = validation.errors.filter((e) => e !== "team_name");
    const nameInvalid = !nameCheck.ok && nameCheck.error !== "empty";
    return (
      <>
        <UiHeader
          kicker={t("fantasy.title")}
          title={t("fpl.squad_selection")}
          onBack={() => setStep("squad")}
        />
        {/* The squad and the budget it leaves, on the same navy strip as the
            pitch step; the card below only asks what is still open. */}
        <FplStatBar
          items={[
            {
              label: t("fpl.squad"),
              value: t("fpl.players_selected").replace("{n}", String(summary.filled)),
              text: true,
            },
            { label: t("fpl.left_in_bank"), value: nf.format(summary.bankRemaining) },
          ]}
        />
        {enrolmentNotice ? (
          <div className={cn("mt-4", ui.space.gutter)}>
            <UiAlert tone="info">{enrolmentNotice}</UiAlert>
          </div>
        ) : null}
        <form
          className={cn("mt-4", ui.space.gutter)}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <UiCard padding="lg">
            <UiInput
              label={t("fpl.team_name")}
              hint={t("fpl.team_name_help")}
              value={draft.teamName}
              maxLength={TEAM_NAME_MAX_LENGTH}
              onChange={(e) => setDraft(setTeamNameOp(draft, e.target.value))}
              placeholder={t("fpl.team_name")}
              fieldClassName={cn(ui.radius.card, "min-h-[var(--ui-row-min)]", ui.rule.strong)}
              autoFocus
            />
            {nameInvalid ? (
              <UiAlert tone="negative" className="mt-3">
                {t("fantasy.create.error.team_name")}
              </UiAlert>
            ) : null}
            <div className="mt-4">
              <UiKeyValueRow
                label={t("fpl.captain")}
                value={
                  playerOf(draft.slots.find((s) => s.isCaptain)?.playerId ?? null)?.name[lang] ??
                  t("fantasy.stat.none")
                }
              />
              <UiKeyValueRow
                label={t("fpl.vice_captain")}
                value={
                  playerOf(draft.slots.find((s) => s.isViceCaptain)?.playerId ?? null)?.name[
                    lang
                  ] ?? t("fantasy.stat.none")
                }
                className="border-b-0"
              />
            </div>
            {blocking.length > 0 ? (
              <UiAlert tone="negative" className="mt-3">
                <ul>
                  {blocking.map((code) => (
                    <li key={code}>{t(VALIDATION_KEYS[code])}</li>
                  ))}
                </ul>
              </UiAlert>
            ) : null}
            {saveError ? (
              <UiAlert tone="negative" className="mt-3">
                {t(saveError)}
              </UiAlert>
            ) : null}
            <UiButton
              type="submit"
              variant="gradient"
              className="mt-4"
              disabled={!nameCheck.ok || !validation.ok || saving}
            >
              {saving ? t("fpl.saving") : t("fpl.enter_squad")}
            </UiButton>
          </UiCard>
        </form>
      </>
    );
  }

  return (
    <>
      <SquadBuilderScreen
        title={t("fpl.squad_selection")}
        kicker={t("fantasy.title")}
        backTo="/fantasy"
        gameweek={enrolment.number}
        deadlineIso={enrolment.deadline}
        banner={enrolmentNotice}
        stats={[
          // No Wildcard column here: during the first selection it can only
          // ever read "Indisponible", and transfers are unlimited anyway.
          { label: t("fpl.free_transfers"), value: t("fpl.unlimited"), text: true },
          { label: t("fpl.cost"), value: "0" },
          { label: t("fpl.bank"), value: nf.format(summary.bankRemaining) },
        ]}
        slots={slots}
        clubs={clubs}
        players={players}
        view={view}
        onViewChange={setView}
        onSlotTap={(s) => (s.player ? setSheetSlot(s.slot) : setPickerSlot(s.slot))}
        onAddPlayer={() => {
          if (firstEmpty === null) toast.message(t("fpl.complete_squad_first"));
          else setPickerAny(true);
        }}
        onNext={() => {
          if (summary.filled < 15) {
            toast.error(t("fpl.complete_squad_first"));
            return;
          }
          setStep("name");
        }}
        nextDisabled={summary.filled < 15 || summary.overBudget || summary.overClubLimit.length > 0}
        onReset={() => setDraft(initCreateDraft(draft.teamName))}
        resetDisabled={summary.filled === 0}
        listColumns={[
          {
            key: "form",
            label: t("fpl.form"),
            // BG-0071: a dash, not 0.0, while no gameweek has scored.
            render: (p) => (p.form === null ? t("fantasy.stat.none") : nf.format(p.form)),
          },
          { key: "price", label: t("fpl.current_price"), render: (p) => nf.format(p.price) },
          {
            key: "sel",
            label: t("fantasy.picker.sort.ownership"),
            render: (p) => `${nf.format(p.ownership)}%`,
          },
        ]}
      />

      {pickerSlot !== null && activeSlot ? (
        <AddPlayerScreen
          players={players}
          clubs={clubs}
          bank={pickerBank}
          position={activeSlot.position}
          lockPosition
          clubLimitReached={(player) => clubLimitFor(player, activeSlot.slot)}
          disabledIds={takenIds.filter((id) => id !== activeSlot.playerId)}
          currentPlayerId={activeSlot.playerId}
          onPick={onPick}
          onRemove={
            activeSlot.playerId
              ? () => {
                  setDraft(removePlayer(draft, activeSlot.slot));
                  setPickerSlot(null);
                }
              : undefined
          }
          onClose={() => setPickerSlot(null)}
        />
      ) : pickerAny ? (
        <AddPlayerScreen
          players={players}
          clubs={clubs}
          bank={round1(summary.bankRemaining)}
          allowedPositions={openPositions}
          clubLimitReached={(player) => {
            const target = draft.slots.find((s) => !s.playerId && s.position === player.position);
            return target ? clubLimitFor(player, target.slot) : false;
          }}
          disabledIds={takenIds}
          onPick={onPickAny}
          onClose={() => setPickerAny(false)}
        />
      ) : null}

      <PlayerActionSheet
        open={sheetSlot !== null}
        player={
          sheetSlot !== null
            ? playerOf(draft.slots.find((s) => s.slot === sheetSlot)?.playerId ?? null)
            : null
        }
        club={
          sheetSlot !== null
            ? findClub(
                clubs,
                playerOf(draft.slots.find((s) => s.slot === sheetSlot)?.playerId ?? null)?.clubId,
              )
            : undefined
        }
        isStarter={sheetSlot !== null && sheetSlot < 12}
        onClose={() => setSheetSlot(null)}
        onCaptain={() => {
          const id = draft.slots.find((s) => s.slot === sheetSlot)?.playerId;
          if (id) setDraft(setCaptainOp(draft, id, false));
          setSheetSlot(null);
        }}
        onVice={() => {
          const id = draft.slots.find((s) => s.slot === sheetSlot)?.playerId;
          if (id) setDraft(setCaptainOp(draft, id, true));
          setSheetSlot(null);
        }}
        onSubstitute={() => {
          if (sheetSlot !== null) setPickerSlot(sheetSlot);
          setSheetSlot(null);
        }}
        onRemove={() => {
          if (sheetSlot !== null) setDraft(removePlayer(draft, sheetSlot));
          setSheetSlot(null);
        }}
      />
    </>
  );
}
