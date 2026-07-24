import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles, Trash2, Users, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { footballService } from "@/services/football";
import { fantasyService } from "@/services/fantasy-runtime";
import { DeadlineCountdown } from "@/components/common/DeadlineCountdown";
import { LoadingState } from "@/components/common/States";
import { PlayerPickerDrawer } from "@/components/fantasy/PlayerPickerDrawer";
import { Pitch } from "@/components/fantasy/Pitch";
import { PlayerShirt } from "@/components/fantasy/PlayerShirt";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { FantasyPlayer, Position, SquadPlayer } from "@/types/fantasy";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { useAuth } from "@/auth/AuthProvider";
import { fantasyStateStore } from "@/services/fantasy-state";
import {
  buildAutocompleteDraft,
  computeSummary,
  draftPurchasePrices,
  draftToSquad,
  initCreateDraft,
  placePlayer,
  removePlayer,
  setCaptain as setCaptainOp,
  setTeamName as setTeamNameOp,
  TEAM_NAME_MAX_LENGTH,
  TEAM_NAME_MIN_LENGTH,
  validateDraft,
  validateTeamName,
  type CreateTeamDraft,
  type DraftValidationCode,
} from "@/services/fantasy-create-service";
import { fantasyDraftsStore, type FantasyDraftKey } from "@/services/fantasy-drafts-store";
import { runOwnedMutation, classifyRepoError } from "@/services/fantasy-mutation-controller";
import { importDecisionService } from "@/services/fantasy-import-decision";

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

function CreateTeamPage() {
  const { t, tr, lang, dir } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });
  const owned = useFantasyOwned();
  const { requireAuth, user } = useAuth();

  const playersQ = useQuery({
    queryKey: ["fantasy-players"],
    queryFn: () => fantasyService.getPlayers(),
  });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });
  const gwQ = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
  });

  // Entry conditions:
  //   1. Authenticated cloud user.
  //   2. Cloud snapshot loaded AND empty (or the user explicitly picked start_new).
  // Otherwise, redirect to /fantasy/team (which handles local and existing-team paths).
  const isCloud = owned.source === "cloud";
  const emptyCloud = !!owned.snapshot?.emptyCloudSquad;
  const hasCloudTeam = !!owned.snapshot?.team && owned.snapshot.team.squad.length > 0;

  useEffect(() => {
    if (owned.isLoading && !owned.snapshot) return;
    if (!isCloud) {
      void nav({ to: "/fantasy/team" });
      return;
    }
    if (hasCloudTeam) {
      void nav({ to: "/fantasy/team" });
    }
  }, [isCloud, hasCloudTeam, owned.isLoading, owned.snapshot, nav]);

  // ---- Draft key + persistence ----

  const teamId = owned.snapshot?.teamId ?? "new";
  const baseVersion = owned.snapshot?.version ?? 0;
  const draftKey = useMemo<FantasyDraftKey | null>(() => {
    if (!isCloud || !owned.userId) return null;
    return { uid: owned.userId, teamId, baseVersion, kind: "create-team" };
  }, [isCloud, owned.userId, teamId, baseVersion]);

  const [draft, setDraft] = useState<CreateTeamDraft>(() => initCreateDraft());
  const initedRef = useRef(false);

  // Restore draft on mount / identity change.
  useEffect(() => {
    initedRef.current = false;
  }, [draftKey?.uid, draftKey?.teamId, draftKey?.baseVersion]);

  useEffect(() => {
    if (initedRef.current || !draftKey) return;
    const entry = fantasyDraftsStore.read<CreateTeamDraft>(draftKey);
    if (entry && isCreateDraft(entry.payload)) {
      setDraft(entry.payload);
    } else {
      // Default the name to the user's manager name if available.
      const defaultName = user?.displayName?.trim()
        ? `${user.displayName.trim().split(" ")[0]} FC`
        : "";
      setDraft(initCreateDraft(defaultName));
    }
    initedRef.current = true;
  }, [draftKey, user?.displayName]);

  // Persist draft on every change (once initialized).
  useEffect(() => {
    if (!initedRef.current || !draftKey) return;
    fantasyDraftsStore.save<CreateTeamDraft>(draftKey, draft);
  }, [draft, draftKey]);

  // ---- Derived state ----

  const players = useMemo(() => playersQ.data ?? [], [playersQ.data]);
  const clubs = useMemo(() => clubsQ.data ?? [], [clubsQ.data]);
  const summary = useMemo(() => computeSummary(draft, players), [draft, players]);
  const validation = useMemo(() => validateDraft(draft, players), [draft, players]);
  const teamNameCheck = validateTeamName(draft.teamName);
  const deadlineIso = gwQ.data?.deadline;

  // ---- Picker state ----

  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [captainSheet, setCaptainSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<TranslationKey | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const activeSlot = pickerSlot === null ? null : draft.slots.find((s) => s.slot === pickerSlot);
  const disabledPickerIds = draft.slots.map((s) => s.playerId).filter(Boolean) as string[];
  const currentSlotPlayer = activeSlot?.playerId
    ? players.find((p) => p.id === activeSlot.playerId)
    : null;
  // Max affordable = remaining bank + (this slot's current player price, if any).
  const pickerMaxPrice = activeSlot
    ? round1(summary.bankRemaining + (currentSlotPlayer?.price ?? 0))
    : undefined;

  // ---- Handlers ----

  const commit = (next: CreateTeamDraft) => setDraft(next);

  const onSlotClick = (slot: number) => {
    requireAuth(() => setPickerSlot(slot));
  };

  const onPickPlayer = (p: FantasyPlayer) => {
    if (pickerSlot === null) return;
    commit(placePlayer(draft, pickerSlot, p.id));
    setPickerSlot(null);
  };

  const onRemove = (slot: number) => {
    commit(removePlayer(draft, slot));
  };

  const onAutocomplete = async () => {
    if (autoBusy) return;
    setAutoBusy(true);
    try {
      const availablePlayers = players.length ? players : await fantasyService.getPlayers();
      const merged = buildAutocompleteDraft(draft, availablePlayers);
      if (!merged) {
        toast.error(t("fantasy.create.autocomplete_failed"));
        return;
      }
      commit(merged);
      toast.success(t("fantasy.create.autocomplete_done"));
    } catch {
      toast.error(t("fantasy.create.autocomplete_failed"));
    } finally {
      setAutoBusy(false);
    }
  };

  const onSetCaptain = (playerId: string, vice = false) => {
    commit(setCaptainOp(draft, playerId, vice));
  };

  const onSave = async () => {
    if (!validation.ok || saving || !isCloud || !draftKey) return;
    setSaving(true);
    setSaveError(null);
    try {
      const squad: SquadPlayer[] = draftToSquad(draft);
      const purchasePrices = draftPurchasePrices(draft, players);
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
              teamName: draft.teamName.trim(),
              managerName: user?.displayName?.trim() ? user.displayName.trim() : null,
              formation: draft.formation,
              bank: round1(summary.bankRemaining),
              freeTransfers: 1,
              pendingTransfers: 0,
              squad,
              purchasePrices,
              expectedVersion: baseVersion,
              currentGameweekId: owned.snapshot?.currentGameweekId ?? null,
              lifecycle: owned.snapshot?.lifecycle ?? fantasyStateStore.read(),
            }),
          args: undefined,
          matchingDraftKey: draftKey,
          savedIdleAfterMs: 2400,
        },
      );
      if (res.ok) {
        // Clear the start_new marker so we don't loop back here.
        if (owned.userId) importDecisionService.markImported(owned.userId);
        toast.success(t("fantasy.create.success"));
        // Ensure query cache reflects the new team before route change.
        await owned.reload();
        void nav({ to: "/fantasy/team" });
        return;
      }
      const c = classifyRepoError(res.error);
      const key: TranslationKey = c.isConflict
        ? "fantasy.error.version_conflict"
        : c.isNetwork
          ? "fantasy.error.network"
          : c.isPermission
            ? "fantasy.error.permission"
            : c.isValidation
              ? "fantasy.create.error.size"
              : "fantasy.error.import_generic";
      setSaveError(key);
      toast.error(t(key));
    } finally {
      setSaving(false);
    }
  };

  const onDiscard = () => {
    if (draftKey) fantasyDraftsStore.remove(draftKey);
    setDraft(initCreateDraft());
    setDiscardOpen(false);
    toast.success(t("fantasy.create.discarded"));
  };

  const onBack = () => {
    // Draft preserved by default; user can leave and return.
    void nav({ to: "/fantasy" });
  };

  // ---- Loading gate ----

  if (playersQ.isLoading || clubsQ.isLoading || (owned.isLoading && !owned.snapshot)) {
    return <LoadingState />;
  }
  if (playersQ.error || clubsQ.error || !playersQ.data || !clubsQ.data) {
    return (
      <div role="alert" className="surface-2 rounded-2xl p-4 text-sm text-foreground">
        {t("fantasy.create.error.pool_unavailable")}
      </div>
    );
  }
  if (!gwQ.data) {
    return (
      <div role="alert" className="surface-2 rounded-2xl p-4 text-sm text-foreground">
        {t("fantasy.create.error.no_gameweek")}
      </div>
    );
  }

  // ---- Render helpers ----

  const playerOf = (id: string) => players.find((p) => p.id === id);
  const clubOf = (cid: string) => clubs.find((c) => c.id === cid);
  const renderSlot = (slot: number) => {
    const s = draft.slots.find((x) => x.slot === slot);
    if (!s) return null;
    if (!s.playerId) return <EmptySlot position={s.position} onClick={() => onSlotClick(slot)} />;
    const p = playerOf(s.playerId);
    if (!p) return <EmptySlot position={s.position} onClick={() => onSlotClick(slot)} />;
    return (
      <div className="relative">
        <PlayerShirt
          player={p}
          club={clubOf(p.clubId)}
          metric={nf.format(p.price)}
          captain={s.isCaptain}
          vice={s.isViceCaptain}
          onClick={() => onSlotClick(slot)}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(slot);
          }}
          aria-label={t("fantasy.create.remove_slot")}
          className={cn(
            "absolute -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-white shadow-md ring-2 ring-white/80",
            dir === "rtl" ? "-left-1.5" : "-right-1.5",
          )}
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </div>
    );
  };

  const xiIds = draft.slots
    .filter((s) => s.slot < 12 && s.playerId)
    .map((s) => s.playerId!) as string[];
  const gkXi = xiIds.filter((id) => playerOf(id)?.position === "GK");
  const defXi = xiIds.filter((id) => playerOf(id)?.position === "DEF");
  const midXi = xiIds.filter((id) => playerOf(id)?.position === "MID");
  const fwdXi = xiIds.filter((id) => playerOf(id)?.position === "FWD");

  const gkSlot = draft.slots.find((s) => s.slot === 1)!;
  const defSlots = draft.slots.filter((s) => s.slot >= 2 && s.slot <= 5);
  const midSlots = draft.slots.filter((s) => s.slot >= 6 && s.slot <= 9);
  const fwdSlots = draft.slots.filter((s) => s.slot >= 10 && s.slot <= 11);
  const benchSlots = draft.slots.filter((s) => s.slot >= 12);

  const canSave = validation.ok && !saving;
  const displayedErrors = validation.errors;

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("fantasy.create.back")}
          className="grid h-11 w-11 place-items-center rounded-xl bg-white/60 ring-1 ring-black/5 hover:bg-white"
        >
          {dir === "rtl" ? (
            <ArrowRight className="h-4 w-4" aria-hidden />
          ) : (
            <ArrowLeft className="h-4 w-4" aria-hidden />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[color:var(--brand-accent)]">
            <Sparkles className="h-3 w-3" aria-hidden />
            {`${t("home.gameweek")} ${gwQ.data.number}`}
          </div>
          <h1 className="mt-1 truncate text-[22px] font-black tracking-tight text-foreground">
            <span className="text-brand">{t("fantasy.create.title")}</span>
          </h1>
        </div>
        <div className="shrink-0">{deadlineIso && <DeadlineCountdown iso={deadlineIso} />}</div>
      </div>

      {/* Team name */}
      <div className="mt-4">
        <label
          htmlFor="botolago-create-team-name"
          className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
        >
          {t("fantasy.create.team_name_label")}
        </label>
        <input
          id="botolago-create-team-name"
          type="text"
          value={draft.teamName}
          onChange={(e) => commit(setTeamNameOp(draft, e.target.value))}
          placeholder={t("fantasy.create.team_name_placeholder")}
          maxLength={TEAM_NAME_MAX_LENGTH}
          aria-describedby="botolago-create-team-name-desc"
          aria-invalid={!teamNameCheck.ok}
          dir="auto"
          className={cn(
            "mt-1.5 w-full rounded-xl border bg-white/70 px-3 py-3 text-base font-semibold text-foreground outline-none focus:ring-2",
            teamNameCheck.ok
              ? "border-input focus:ring-[color:var(--brand-primary)]/40"
              : "border-red-400 focus:ring-red-400/50",
          )}
        />
        <div
          id="botolago-create-team-name-desc"
          className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground"
        >
          <span>
            {t("fantasy.create.team_name_help")
              .replace("{min}", String(TEAM_NAME_MIN_LENGTH))
              .replace("{max}", String(TEAM_NAME_MAX_LENGTH))}
          </span>
          <span className="tabular-nums">
            {draft.teamName.trim().length}/{TEAM_NAME_MAX_LENGTH}
          </span>
        </div>
      </div>

      {/* Squad status */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatusTile
          label={t("fantasy.create.players_label")}
          value={`${summary.filled} / ${summary.total}`}
          tone={summary.filled === summary.total ? "ok" : "progress"}
        />
        <StatusTile
          label={t("fantasy.bank")}
          value={nf.format(Math.max(0, summary.bankRemaining))}
          tone={summary.overBudget ? "warn" : "ok"}
        />
        <StatusTile label={t("fantasy.team_value")} value={nf.format(summary.totalCost)} />
        <StatusTile
          label={t("fantasy.create.club_limit_label")}
          value={summary.overClubLimit.length > 0 ? String(summary.overClubLimit.length) : "0"}
          tone={summary.overClubLimit.length > 0 ? "warn" : "ok"}
        />
      </div>

      {/* Per-position progress */}
      <div className="mt-2 grid grid-cols-4 gap-2">
        {(["GK", "DEF", "MID", "FWD"] as Position[]).map((pos) => (
          <PositionTile
            key={pos}
            label={t(`player.pos.${pos}` as TranslationKey)}
            filled={summary.perPosition[pos].filled}
            required={summary.perPosition[pos].required}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAutocomplete}
          disabled={autoBusy}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white/70 px-3 py-2 text-xs font-bold text-foreground ring-1 ring-black/5 hover:bg-white disabled:opacity-40"
        >
          <Wand2 className="h-3.5 w-3.5" aria-hidden />
          {autoBusy ? t("fantasy.create.autocomplete_busy") : t("fantasy.create.autocomplete")}
        </button>
        <button
          type="button"
          onClick={() => setCaptainSheet(true)}
          disabled={xiIds.length < 2}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white/70 px-3 py-2 text-xs font-bold text-foreground ring-1 ring-black/5 hover:bg-white disabled:opacity-40"
        >
          {t("fantasy.set_captain")}
        </button>
        {summary.filled > 0 && (
          <button
            type="button"
            onClick={() => setDiscardOpen(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {t("fantasy.create.discard")}
          </button>
        )}
      </div>

      {/* Pitch */}
      <div className="mt-4">
        <Pitch
          gk={renderSlot(gkSlot.slot)}
          def={defSlots.map((s) => renderSlot(s.slot))}
          mid={midSlots.map((s) => renderSlot(s.slot))}
          fwd={fwdSlots.map((s) => renderSlot(s.slot))}
          bench={benchSlots.map((s) => renderSlot(s.slot))}
          benchLabel={t("fantasy.bench")}
        />
      </div>

      {/* Validation summary */}
      {displayedErrors.length > 0 && (
        <ul
          role="status"
          aria-live="polite"
          className="mt-4 space-y-1 rounded-2xl bg-amber-50/70 p-3 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-500/25"
        >
          {displayedErrors.map((code) => (
            <li key={code} className="flex items-start gap-1.5">
              <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
              <span className="break-words">{t(VALIDATION_KEYS[code])}</span>
            </li>
          ))}
        </ul>
      )}
      {saveError && (
        <p role="alert" className="mt-3 break-words text-[11px] font-semibold text-red-700">
          {t(saveError)}
        </p>
      )}

      {/* Player picker */}
      <PlayerPickerDrawer
        open={pickerSlot !== null}
        onClose={() => setPickerSlot(null)}
        onPick={onPickPlayer}
        players={players}
        clubs={clubs}
        position={activeSlot?.position}
        disabledIds={disabledPickerIds.filter((id) => id !== activeSlot?.playerId)}
        maxPrice={pickerMaxPrice}
        title={
          activeSlot
            ? `${t("fantasy.create.pick_for")} ${t(`player.pos.${activeSlot.position}` as TranslationKey)}`
            : t("fantasy.picker.title")
        }
      />

      {/* Captain sheet */}
      <Sheet open={captainSheet} onOpenChange={setCaptainSheet}>
        <SheetContent side={dir === "rtl" ? "left" : "right"} className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("fantasy.set_captain")}</SheetTitle>
          </SheetHeader>
          <ul className="mt-3 grid gap-1.5">
            {xiIds.map((id) => {
              const p = playerOf(id);
              if (!p) return null;
              const s = draft.slots.find((x) => x.playerId === id)!;
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 ring-1 ring-black/5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{tr(p.name)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {clubOf(p.clubId) ? tr(clubOf(p.clubId)!.shortName) : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSetCaptain(id, false)}
                    className={cn(
                      "min-h-11 min-w-11 rounded-lg px-3 py-2 text-[11px] font-semibold",
                      s.isCaptain
                        ? "bg-[color:var(--brand-accent)] text-white"
                        : "bg-white ring-1 ring-black/10",
                    )}
                  >
                    {t("fantasy.captain")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetCaptain(id, true)}
                    className={cn(
                      "min-h-11 min-w-11 rounded-lg px-3 py-2 text-[11px] font-semibold",
                      s.isViceCaptain
                        ? "bg-[color:var(--brand-primary)] text-white"
                        : "bg-white ring-1 ring-black/10",
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

      {/* Discard confirm */}
      {discardOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setDiscardOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl"
          >
            <h2 className="text-sm font-black text-foreground">
              {t("fantasy.create.discard_title")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground break-words">
              {t("fantasy.create.discard_desc")}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setDiscardOpen(false)}
                className="min-h-11 flex-1 rounded-xl bg-white px-3 py-2 text-xs font-bold ring-1 ring-black/10"
              >
                {t("fantasy.cancel")}
              </button>
              <button
                type="button"
                onClick={onDiscard}
                className="min-h-11 flex-1 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white"
              >
                {t("fantasy.create.discard")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky save bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/40 bg-white/85 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-md"
        dir={dir}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              {t("fantasy.bank")}
            </div>
            <div
              className={cn(
                "text-sm font-black tabular-nums",
                summary.overBudget ? "text-red-700" : "text-foreground",
              )}
            >
              {nf.format(Math.max(0, summary.bankRemaining))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => requireAuth(onSave)}
            disabled={!canSave}
            aria-label={t("fantasy.create.cta_primary")}
            className={cn(
              "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black text-white transition-opacity",
              canSave
                ? "bg-[color:var(--brand-primary)] hover:opacity-90"
                : "cursor-not-allowed bg-muted-foreground/40",
            )}
          >
            {saving ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />
                {t("fantasy.status.saving")}
              </>
            ) : (
              <>
                <Check className="h-4 w-4" aria-hidden />
                {t("fantasy.create.cta_primary")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Slot placeholder ----

function EmptySlot({ position, onClick }: { position: Position; onClick: () => void }) {
  const { t } = useI18n();
  const posLabel = t(`player.pos.${position}` as TranslationKey);
  const addLabel = t("fantasy.create.add_slot").replace("{pos}", posLabel);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={addLabel}
      className="group flex min-h-[76px] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-white/50 bg-white/8 px-1 py-2 text-white/90 transition-colors hover:bg-white/15"
    >
      <div className="grid h-8 w-8 place-items-center rounded-full bg-white/15 group-hover:bg-white/25">
        <Users className="h-4 w-4" aria-hidden />
      </div>
      <div className="text-[10px] font-black uppercase tracking-[0.14em]">{posLabel}</div>
    </button>
  );
}

// ---- Status tiles ----

function StatusTile({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: string;
  tone?: "ok" | "progress" | "warn";
}) {
  const toneClass =
    tone === "warn"
      ? "text-red-700"
      : tone === "progress"
        ? "text-[color:var(--brand-accent)]"
        : "text-foreground";
  return (
    <div className="surface-2 rounded-2xl px-2.5 py-2.5 text-center">
      <div className={cn("text-sm font-black tabular-nums", toneClass)}>{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function PositionTile({
  label,
  filled,
  required,
}: {
  label: string;
  filled: number;
  required: number;
}) {
  const complete = filled === required;
  const over = filled > required;
  return (
    <div
      className={cn(
        "rounded-xl px-2 py-2 text-center ring-1",
        over
          ? "bg-red-50 ring-red-500/30"
          : complete
            ? "bg-emerald-50 ring-emerald-500/30"
            : "bg-white/60 ring-black/5",
      )}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-sm font-black tabular-nums",
          over ? "text-red-700" : complete ? "text-emerald-700" : "text-foreground",
        )}
      >
        {filled} / {required}
      </div>
    </div>
  );
}

// ---- Helpers ----

function isCreateDraft(v: unknown): v is CreateTeamDraft {
  if (!v || typeof v !== "object") return false;
  const d = v as Partial<CreateTeamDraft>;
  return (
    typeof d.teamName === "string" &&
    typeof d.formation === "string" &&
    Array.isArray(d.slots) &&
    d.slots.length === 15
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
