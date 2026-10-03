/**
 * `/fantasy/create`, on the product's own squad-selection screen
 * (`SquadBuilderScreen`, `AddPlayerScreen`, `PlayerActionSheet`) and the
 * team-name step src/routes/fantasy.create.tsx follows it with.
 *
 * The demo asks for the starting eleven only. The full game builds fifteen
 * (two keepers, five defenders, five midfielders, three forwards) and lines
 * up eleven of them each gameweek; the pitch shows the eleven that score.
 */
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AddPlayerScreen } from "@/components/fpl/AddPlayerScreen";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FplStatBar } from "@/components/fpl/FplStatBar";
import { PlayerActionSheet } from "@/components/fpl/PlayerActionSheet";
import { SquadBuilderScreen, type BuilderSlot } from "@/components/fpl/SquadBuilderScreen";
import {
  ui,
  UiAlert,
  UiButton,
  UiCard,
  UiChip,
  UiHeader,
  UiInput,
  UiKeyValueRow,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import {
  TEAM_NAME_MAX_LENGTH,
  normalizeTeamName,
  validateTeamName,
} from "@/services/fantasy-create-service";
import type { FantasyPlayer } from "@/types/fantasy";

import { useDemoCopy } from "../copy";
import {
  DEMO_GAMEWEEK,
  MAX_PER_CLUB,
  clubById,
  clubs,
  deadlineOf,
  playerById,
  players,
} from "../data/world";
import { DEMO_FORMATIONS, armbandOrder, positionsFor, summarize, useDemo } from "../state";

const round1 = (value: number) => Math.round(value * 10) / 10;

export function CreateScreen() {
  const { state } = useDemo();
  const navigate = useNavigate();
  const [step, setStep] = useState<"squad" | "name">("squad");

  // A confirmed team goes to the matchday; a played one to its points.
  useEffect(() => {
    if (state.played) void navigate({ to: "/fantasy/points", replace: true });
    else if (state.saved) void navigate({ to: "/fantasy/matchday", replace: true });
  }, [state.saved, state.played, navigate]);

  return (
    <FantasyFrame bottomNav>
      {step === "squad" ? (
        <SquadStep onNext={() => setStep("name")} />
      ) : (
        <NameStep onBack={() => setStep("squad")} />
      )}
    </FantasyFrame>
  );
}

function SquadStep({ onNext }: { onNext: () => void }) {
  const { t, lang } = useI18n();
  const copy = useDemoCopy();
  const { state, actions } = useDemo();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const [view, setView] = useState<"squad" | "list">("squad");
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [pickerAny, setPickerAny] = useState(false);
  const [sheetSlot, setSheetSlot] = useState<number | null>(null);

  const positions = positionsFor(state.formation);
  const summary = summarize(state);
  const takenIds = state.picks.filter((id): id is string => !!id);

  const slots: BuilderSlot[] = positions.map((position, index) => ({
    slot: index + 1,
    position,
    player: playerById(state.picks[index]) ?? null,
    isCaptain: !!state.picks[index] && state.picks[index] === state.captainId,
    isViceCaptain: !!state.picks[index] && state.picks[index] === state.viceId,
  }));

  const clubCountWithout = (player: FantasyPlayer, slotIndex: number) =>
    state.picks.filter(
      (id, index) => index !== slotIndex && playerById(id)?.clubId === player.clubId,
    ).length;

  const place = (slotIndex: number, player: FantasyPlayer, budget: number) => {
    if (clubCountWithout(player, slotIndex) >= MAX_PER_CLUB) {
      toast.error(t("fpl.club_limit"));
      return false;
    }
    if (player.price > budget + 0.001) {
      toast.error(t("fpl.budget_exceeded"));
      return false;
    }
    actions.place(slotIndex, player.id);
    return true;
  };

  const activeIndex = pickerSlot === null ? null : pickerSlot - 1;
  const activePlayer = activeIndex === null ? undefined : playerById(state.picks[activeIndex]);
  const pickerBank = round1(summary.bank + (activePlayer?.price ?? 0));
  const openPositions = [...new Set(positions.filter((_, index) => !state.picks[index]))];
  const sheetIndex = sheetSlot === null ? null : sheetSlot - 1;
  const sheetPlayer = sheetIndex === null ? null : (playerById(state.picks[sheetIndex]) ?? null);

  const next = () => {
    if (summary.filled < 11) {
      toast.error(copy("completeFirst"));
      return;
    }
    // Name a captain and a vice for the manager who has not: the two most
    // likely to score. The name step shows both, and Back returns here to
    // change them.
    if (!state.captainId || !state.viceId) {
      const ranked = armbandOrder(state.picks);
      if (!state.captainId) actions.setCaptain(ranked.find((id) => id !== state.viceId)!);
      if (!state.viceId)
        actions.setVice(ranked.find((id) => id !== (state.captainId ?? ranked[0]))!);
    }
    onNext();
  };

  return (
    <>
      <SquadBuilderScreen
        title={copy("pickEleven")}
        kicker={t("fantasy.title")}
        backTo="/fantasy"
        gameweek={DEMO_GAMEWEEK}
        deadlineIso={deadlineOf(DEMO_GAMEWEEK)}
        stats={[
          { label: copy("players"), value: copy("elevenOf", { n: summary.filled }), text: true },
          { label: copy("formation"), value: <bdi>{state.formation}</bdi>, text: true },
          { label: t("fpl.bank"), value: nf.format(summary.bank) },
        ]}
        slots={slots}
        clubs={clubs}
        players={players}
        view={view}
        onViewChange={setView}
        onSlotTap={(slot) => (slot.player ? setSheetSlot(slot.slot) : setPickerSlot(slot.slot))}
        onAddPlayer={() => {
          if (summary.filled >= 11) toast.message(t("fpl.no_empty_slot_for_position"));
          else setPickerAny(true);
        }}
        onNext={next}
        nextDisabled={summary.filled < 11 || summary.overBudget || summary.overClubLimit.length > 0}
        onReset={actions.clear}
        resetDisabled={summary.filled === 0}
        listColumns={[
          {
            key: "form",
            label: t("fpl.form"),
            render: (p) => (p.form === null ? t("fantasy.stat.none") : nf.format(p.form)),
          },
          { key: "price", label: t("fpl.current_price"), render: (p) => nf.format(p.price) },
          {
            key: "sel",
            label: t("fantasy.picker.sort.ownership"),
            render: (p) => `${nf.format(p.ownership)}%`,
          },
        ]}
      >
        <section className={cn("pt-4", ui.space.gutter)} aria-label={copy("formation")}>
          <p className={cn("pb-2", ui.text.label, ui.tone.muted)}>{copy("formation")}</p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_FORMATIONS.map((formation) => (
              <UiChip
                key={formation}
                selected={state.formation === formation}
                onClick={() => actions.setFormation(formation)}
              >
                <bdi className={ui.text.tabular}>{formation}</bdi>
              </UiChip>
            ))}
          </div>
          <p className={cn("pt-3", ui.text.meta, ui.tone.muted)}>{copy("captainHint")}</p>
        </section>
      </SquadBuilderScreen>

      {pickerSlot !== null && activeIndex !== null ? (
        <AddPlayerScreen
          players={players}
          clubs={clubs}
          bank={pickerBank}
          position={positions[activeIndex]}
          lockPosition
          clubLimitReached={(player) => clubCountWithout(player, activeIndex) >= MAX_PER_CLUB}
          disabledIds={takenIds.filter((id) => id !== state.picks[activeIndex])}
          currentPlayerId={state.picks[activeIndex]}
          onPick={(player) => {
            if (place(activeIndex, player, pickerBank)) setPickerSlot(null);
          }}
          onRemove={
            state.picks[activeIndex]
              ? () => {
                  actions.remove(activeIndex);
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
          bank={summary.bank}
          allowedPositions={openPositions}
          clubLimitReached={(player) => {
            const target = positions.findIndex(
              (position, index) => position === player.position && !state.picks[index],
            );
            return target >= 0 && clubCountWithout(player, target) >= MAX_PER_CLUB;
          }}
          disabledIds={takenIds}
          onPick={(player) => {
            const target = positions.findIndex(
              (position, index) => position === player.position && !state.picks[index],
            );
            if (target < 0) {
              toast.error(t("fpl.no_empty_slot_for_position"));
              return;
            }
            if (place(target, player, summary.bank)) setPickerAny(false);
          }}
          onClose={() => setPickerAny(false)}
        />
      ) : null}

      <PlayerActionSheet
        open={sheetSlot !== null}
        player={sheetPlayer}
        club={clubById(sheetPlayer?.clubId)}
        isStarter
        onClose={() => setSheetSlot(null)}
        onCaptain={() => {
          if (sheetPlayer) actions.setCaptain(sheetPlayer.id);
          setSheetSlot(null);
        }}
        onVice={() => {
          if (sheetPlayer) actions.setVice(sheetPlayer.id);
          setSheetSlot(null);
        }}
        onSubstitute={() => {
          if (sheetSlot !== null) setPickerSlot(sheetSlot);
          setSheetSlot(null);
        }}
        onRemove={() => {
          if (sheetIndex !== null) actions.remove(sheetIndex);
          setSheetSlot(null);
        }}
      />
    </>
  );
}

function NameStep({ onBack }: { onBack: () => void }) {
  const { t, tr, lang } = useI18n();
  const copy = useDemoCopy();
  const { state, actions } = useDemo();
  const navigate = useNavigate();
  const summary = summarize(state);
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const nameCheck = validateTeamName(state.teamName);
  const nameInvalid = !nameCheck.ok && nameCheck.error !== "empty";
  const captain = playerById(state.captainId);
  const vice = playerById(state.viceId);
  const ready = nameCheck.ok && !!captain && !!vice && summary.filled === 11 && !summary.overBudget;

  return (
    <>
      <UiHeader kicker={t("fantasy.title")} title={copy("pickEleven")} onBack={onBack} />
      <FplStatBar
        items={[
          { label: copy("players"), value: copy("elevenOf", { n: summary.filled }), text: true },
          { label: t("fpl.left_in_bank"), value: nf.format(summary.bank) },
        ]}
      />
      <form
        className={cn("mt-4", ui.space.gutter)}
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          actions.setTeamName(normalizeTeamName(state.teamName));
          actions.confirm();
          toast.success(copy("teamReady", { n: DEMO_GAMEWEEK }));
          void navigate({ to: "/fantasy/matchday" });
        }}
      >
        <UiCard padding="lg">
          <UiInput
            label={t("fpl.team_name")}
            hint={t("fpl.team_name_help")}
            value={state.teamName}
            maxLength={TEAM_NAME_MAX_LENGTH}
            onChange={(event) => actions.setTeamName(event.target.value)}
            placeholder="Atlas FC"
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
              value={captain ? tr(captain.name) : t("fantasy.stat.none")}
            />
            <UiKeyValueRow
              label={t("fpl.vice_captain")}
              value={vice ? tr(vice.name) : t("fantasy.stat.none")}
              className="border-b-0"
            />
          </div>
          {!captain || !vice ? (
            <UiAlert tone="negative" className="mt-3">
              {copy("captainMissing")}
            </UiAlert>
          ) : null}
          <UiButton type="submit" variant="gradient" className="mt-4" disabled={!ready}>
            {t("fpl.enter_squad")}
          </UiButton>
        </UiCard>
      </form>
    </>
  );
}
