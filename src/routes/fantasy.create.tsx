import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";

import { useAuth } from "@/auth/AuthProvider";
import { showStepUpNotice } from "@/auth/step-up-notice";
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
import { fantasyHead } from "@/lib/fantasy-meta";
import { reportOperationalError } from "@/lib/operational-errors";
import { pendingInvite } from "@/components/predictions/leagues/invite-link";
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
import { classifyRepoError, runOwnedMutation } from "@/services/fantasy-mutation-controller";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyStateStore } from "@/services/fantasy-state";
import { useManagerCardLive } from "@/services/manager-card-status";
import { SQUAD_RULES, type FantasyPlayer, type SquadPlayer } from "@/types/fantasy";

// The card's save-step line and the builder's return line are their own chunk, requested only
// while the section is live: with the switch off this page imports nothing of the Manager Card.
const CardSaveLine = lazy(() =>
  import("@/components/manager-card/inline/curva-inline").then((module) => ({
    default: module.CardSaveLine,
  })),
);
const BuilderReturnLine = lazy(() =>
  import("@/components/manager-card/inline/curva-inline").then((module) => ({
    default: module.BuilderReturnLine,
  })),
);
const BUILDER_RETURN_LINE_ID = "card-builder-return-line";

export const Route = createFileRoute("/fantasy/create")({
  head: () => fantasyHead("create"),
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

/** The visitor's draft: the builder's own key for someone with no account yet. */
const GUEST_DRAFT_KEY: FantasyDraftKey = {
  uid: "__guest__",
  teamId: "new",
  baseVersion: 0,
  kind: "create-team",
};

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
  const { user, requireAuth } = useAuth();
  const live = useManagerCardLive();
  // No `needsAuth`: a visitor builds a team first, and an account is asked for
  // only when they press "Enregistrer".
  const screen = useFantasyScreen({ needsTeam: false, needsAuth: false });
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
    // A visitor's draft lives on this device under its own key, and moves to
    // the account's key once they sign in (see the restore below).
    if (owned.source === "guest") return GUEST_DRAFT_KEY;
    if (!isCloud || !owned.userId) return null;
    return {
      uid: owned.userId,
      teamId: owned.snapshot?.teamId ?? "new",
      baseVersion: owned.snapshot?.version ?? 0,
      kind: "create-team",
    };
  }, [isCloud, owned.source, owned.userId, owned.snapshot?.teamId, owned.snapshot?.version]);

  const [draft, setDraft] = useState<CreateTeamDraft>(() => initCreateDraft());
  // Live only: the draft a visitor built was taken over by the account just made (plan M1c).
  const [accountReturn, setAccountReturn] = useState(false);
  const inited = useRef(false);
  useEffect(() => {
    inited.current = false;
  }, [draftKey?.uid, draftKey?.teamId, draftKey?.baseVersion]);
  useEffect(() => {
    if (inited.current || !draftKey) return;
    const entry = fantasyDraftsStore.read<CreateTeamDraft>(draftKey);
    // Signed in with no draft of their own: the one built as a visitor on this
    // device is theirs now. It is taken once, and the visitor copy is removed.
    const visitorEntry =
      !entry && draftKey.uid !== GUEST_DRAFT_KEY.uid
        ? fantasyDraftsStore.read<CreateTeamDraft>(GUEST_DRAFT_KEY)
        : null;
    if (entry && isCreateDraft(entry.payload)) setDraft(entry.payload);
    else if (visitorEntry && isCreateDraft(visitorEntry.payload)) {
      setDraft(visitorEntry.payload);
      fantasyDraftsStore.remove(GUEST_DRAFT_KEY);
      if (live) setAccountReturn(true);
    } else
      setDraft(
        initCreateDraft(
          user?.displayName?.trim() ? `${user.displayName.trim().split(" ")[0]} FC` : "",
        ),
      );
    inited.current = true;
  }, [draftKey, user?.displayName, live]);
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
  const formRef = useRef<HTMLFormElement>(null);
  const resumedOnName = useRef(false);
  const focusedOnReturn = useRef(false);
  // Back in the builder after sign-up (live only): a squad that is complete and valid opens on the
  // name step, where the one thing left is saving it. Once, so Back to the squad stays possible.
  useEffect(() => {
    if (!live || !accountReturn || resumedOnName.current || screen.phase !== "ready") return;
    resumedOnName.current = true;
    if (validation.errors.every((code) => code === "team_name")) setStep("name");
  }, [live, accountReturn, screen.phase, validation]);
  // …with focus on the save button, or on the name while it is still missing, once the name step
  // is on screen. The field is not autofocused any more while live, so nothing else takes it.
  useEffect(() => {
    if (!live || !accountReturn || step !== "name" || focusedOnReturn.current) return;
    focusedOnReturn.current = true;
    const form = formRef.current;
    const save = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (save && !save.disabled) save.focus();
    else form?.querySelector<HTMLInputElement>("input")?.focus();
  }, [live, accountReturn, step]);
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
  // For the picker's budget bar and its "Club 3/3" note.
  const clubCountsFor = (excludingId: string | null) => {
    const counts = new Map<string, number>();
    for (const id of takenIds) {
      if (id === excludingId) continue;
      const clubId = playerOf(id)?.clubId;
      if (clubId) counts.set(clubId, (counts.get(clubId) ?? 0) + 1);
    }
    return counts;
  };
  const builderBudget = {
    total: SQUAD_RULES.budget,
    teamValue: round1(SQUAD_RULES.budget - summary.bankRemaining),
  };

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
    // A visitor: the draft is already kept on this device; the account is asked
    // for now, and the draft comes back with them.
    if (owned.source === "guest") {
      requireAuth(() => undefined, { reason: t("fantasy.create.sign_in_reason") });
      return;
    }
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
        // Counted on the server's confirmation only, never on a draft.
        track("fantasy_team_created");
        // Live: the next screen reads the card fresh. Never awaited, never on the way to it.
        if (live) {
          void import("@/components/manager-card/inline/curva-inline")
            .then((module) => module.invalidateMyManagerCard(qc))
            .catch(() => {});
        }
        if (owned.userId) importDecisionService.markImported(owned.userId);
        toast.success(t("fantasy.create.success"));
        await owned.reload();
        // Came from a Fantasy league invite: back to the join form, where the
        // code waits and the manager taps "Rejoindre" themselves.
        void nav({
          to: pendingInvite()?.game === "fantasy" ? "/fantasy/leagues/join" : "/fantasy/team",
        });
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
      // Refused until the one-time code is in: the alert says so, and the toast
      // is the auth layer's (one, under its id) rather than the same sentence
      // a second time in red. The squad waits in its draft.
      if (classifyRepoError(res.error).isStepUp) showStepUpNotice(t);
      else toast.error(t(key));
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
          ref={formRef}
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
              // Live: the keyboard stays closed, so the card's line and « Entrer l’effectif » are
              // seen before it opens.
              autoFocus={!live}
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
            {live ? (
              <Suspense fallback={null}>
                <CardSaveLine
                  signedIn={!!user}
                  displayName={user?.displayName}
                  teamName={draft.teamName}
                  clubs={clubs}
                  favoriteClubId={user?.favoriteClubId}
                />
              </Suspense>
            ) : null}
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
            {owned.source === "guest" ? (
              <p className={cn("mt-3", ui.text.meta, ui.tone.muted)} data-testid="guest-draft-note">
                {t("fantasy.create.guest_note")}
              </p>
            ) : null}
            {live && accountReturn ? (
              <Suspense fallback={null}>
                <BuilderReturnLine id={BUILDER_RETURN_LINE_ID} />
              </Suspense>
            ) : null}
            <UiButton
              type="submit"
              variant="gradient"
              className="mt-4"
              disabled={!nameCheck.ok || !validation.ok || saving}
              aria-describedby={live && accountReturn ? BUILDER_RETURN_LINE_ID : undefined}
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
          budget={builderBudget}
          clubCounts={clubCountsFor(activeSlot.playerId)}
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
          budget={builderBudget}
          clubCounts={clubCountsFor(null)}
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
