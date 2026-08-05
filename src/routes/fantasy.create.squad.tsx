import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { ChevronRight, CircleHelp, List, Map, Users } from "lucide-react";
import { useRef, useState } from "react";

import { DeadlineCountdown } from "@/components/common/DeadlineCountdown";
import { AtlasCreateShell, AtlasStickyAction } from "@/components/fantasy/AtlasCreateShell";
import { useAtlasCreate } from "@/components/fantasy/AtlasCreateProvider";
import { AtlasDraftSquad, type AtlasSquadView } from "@/components/fantasy/AtlasDraftSquad";
import { PlayerPickerDrawer } from "@/components/fantasy/PlayerPickerDrawer";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import {
  getPlayerSelectionIssue,
  placePlayer,
  removePlayer,
  type DraftValidationCode,
  type PlayerSelectionIssue,
} from "@/services/fantasy-create-service";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { FantasyPlayer, Position } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/create/squad")({
  component: AtlasSquadPage,
});

const validationKeys: Record<DraftValidationCode, TranslationKey> = {
  team_name: "fantasy.create.error.team_name",
  consent: "fantasy.atlas.create.identity.consent_error",
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

function AtlasSquadPage() {
  const { t, lang, dir } = useI18n();
  const nav = useNavigate();
  const { draft, players, clubs, rules, gameweek, summary, validation, identityValid, commit } =
    useAtlasCreate();
  const [view, setView] = useState<AtlasSquadView>("pitch");
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const pickerOpenerSlot = useRef<number | null>(null);
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    maximumFractionDigits: 1,
  });

  if (!identityValid) return <Navigate to="/fantasy/create" replace />;
  if (!rules || !summary || !validation || !gameweek) return null;

  const activeSlot = draft.slots.find((slot) => slot.slot === pickerSlot) ?? null;
  const activePlayer = players.find((player) => player.id === activeSlot?.playerId) ?? null;
  const pickerMaxPrice = activeSlot
    ? summary.bankRemaining + (activePlayer?.price ?? 0)
    : rules.budget;
  const selectionIssue = (player: FantasyPlayer) =>
    pickerSlot === null ? null : getPlayerSelectionIssue(draft, pickerSlot, player, players, rules);
  const reasonLabel = (issue: PlayerSelectionIssue | null): string | null => {
    if (!issue) return null;
    return t(`fantasy.atlas.create.picker.block.${issue}` as TranslationKey);
  };
  const displayedErrors = validation.errors.filter(
    (error) => error !== "team_name" && error !== "consent",
  );
  const canContinue = validation.ok;

  const openPicker = (slot: number) => {
    pickerOpenerSlot.current = slot;
    setPickerSlot(slot);
  };

  const closePicker = () => {
    setPickerSlot(null);
    const openerSlot = pickerOpenerSlot.current;
    if (openerSlot === null) return;
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-atlas-slot="${openerSlot}"]`)?.focus();
    });
  };

  const onPick = (player: FantasyPlayer) => {
    if (pickerSlot === null || selectionIssue(player)) return;
    commit((current) => placePlayer(current, pickerSlot, player.id));
    setAnnouncement(t("fantasy.atlas.create.squad.added").replace("{player}", player.name[lang]));
    closePicker();
  };

  const onRemove = (slot: number) => {
    const playerId = draft.slots.find((item) => item.slot === slot)?.playerId;
    const player = players.find((item) => item.id === playerId);
    commit((current) => removePlayer(current, slot));
    setAnnouncement(
      t("fantasy.atlas.create.squad.removed").replace(
        "{player}",
        player?.name[lang] ?? t("fantasy.atlas.create.squad.player"),
      ),
    );
  };

  const positionProgress = (["GK", "DEF", "MID", "FWD"] as Position[]).map((position) => ({
    position,
    ...summary.perPosition[position],
  }));

  return (
    <AtlasCreateShell
      step={2}
      backTo="/fantasy/create"
      title={t("fantasy.atlas.create.squad.title")}
      description={t("fantasy.atlas.create.squad.description")}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)] lg:gap-6">
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-black/5 bg-white/85 p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView("pitch")}
                aria-pressed={view === "pitch"}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                  view === "pitch" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700",
                )}
              >
                <Map className="h-4 w-4" aria-hidden />
                {t("fantasy.view.squad")}
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                  view === "list" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700",
                )}
              >
                <List className="h-4 w-4" aria-hidden />
                {t("fantasy.view.list")}
              </button>
            </div>
            <DeadlineCountdown iso={gameweek.deadline} />
          </div>

          <div className="mt-3">
            <AtlasDraftSquad
              draft={draft}
              players={players}
              clubs={clubs}
              view={view}
              onSlot={openPicker}
              onRemove={onRemove}
            />
          </div>
        </section>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-3xl border border-black/5 bg-white/85 p-4 shadow-sm">
            <h2 className="text-sm font-black text-foreground">
              {t("fantasy.atlas.create.squad.progress")}
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Status
                label={t("fantasy.create.players_label")}
                value={`${summary.filled} / ${summary.total}`}
                ok={summary.filled === summary.total}
              />
              <Status
                label={t("fantasy.bank")}
                value={nf.format(Math.max(0, summary.bankRemaining))}
                ok={!summary.overBudget}
              />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {positionProgress.map(({ position, filled, required }) => (
                <div key={position} className="rounded-xl bg-slate-50 px-1.5 py-2 text-center">
                  <div className="text-[9px] font-black text-muted-foreground">
                    {t(`player.pos.${position}` as TranslationKey)}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 text-xs font-black tabular-nums",
                      filled === required ? "text-emerald-700" : "text-slate-900",
                    )}
                  >
                    {filled}/{required}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <details className="group rounded-3xl border border-black/5 bg-white/85 p-4 shadow-sm">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
              <CircleHelp className="h-4 w-4 text-blue-700" aria-hidden />
              {t("fantasy.atlas.create.squad.rules_title")}
            </summary>
            <ul className="mt-2 grid gap-2 text-xs leading-relaxed text-muted-foreground">
              <li>
                {t("fantasy.atlas.create.squad.rule.size").replace(
                  "{count}",
                  String(rules.totalSize),
                )}
              </li>
              <li>
                {t("fantasy.atlas.create.squad.rule.budget").replace(
                  "{budget}",
                  nf.format(rules.budget),
                )}
              </li>
              <li>
                {t("fantasy.atlas.create.squad.rule.club").replace(
                  "{count}",
                  String(rules.maxPerClub),
                )}
              </li>
              <li>{t("fantasy.atlas.create.squad.rule.positions")}</li>
            </ul>
          </details>

          {displayedErrors.length > 0 && (
            <section
              aria-labelledby="atlas-squad-checks"
              className="rounded-3xl border border-amber-500/25 bg-amber-50 p-4 text-amber-950"
            >
              <h2 id="atlas-squad-checks" className="text-sm font-black">
                {t("fantasy.atlas.create.squad.remaining")}
              </h2>
              <ul className="mt-2 grid gap-1.5 text-xs font-bold" role="status" aria-live="polite">
                {displayedErrors.map((error) => (
                  <li key={error}>· {t(validationKeys[error])}</li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <PlayerPickerDrawer
        open={pickerSlot !== null}
        onClose={closePicker}
        onPick={onPick}
        players={players}
        clubs={clubs}
        position={activeSlot?.position}
        maxPrice={pickerMaxPrice}
        disabledReasonFor={(player) => reasonLabel(selectionIssue(player))}
        inspectBeforePick
        title={
          activeSlot
            ? `${t("fantasy.create.pick_for")} ${t(`player.pos.${activeSlot.position}` as TranslationKey)}`
            : t("fantasy.picker.title")
        }
      />

      <AtlasStickyAction
        summary={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-4 w-4 text-blue-700" aria-hidden />
            <span>
              <strong className="text-foreground">
                {summary.filled}/{summary.total}
              </strong>{" "}
              · {nf.format(Math.max(0, summary.bankRemaining))} {t("fantasy.bank")}
            </span>
          </div>
        }
        action={
          <button
            type="button"
            onClick={() => canContinue && nav({ to: "/fantasy/create/review" })}
            disabled={!canContinue}
            aria-describedby={!canContinue ? "atlas-squad-continue-help" : undefined}
            className={cn(
              "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black",
              canContinue ? "cta-brand" : "cursor-not-allowed bg-slate-200 text-slate-500",
            )}
          >
            {t("fantasy.atlas.create.review_team")}
            <ChevronRight className={cn("h-4 w-4", dir === "rtl" && "rotate-180")} aria-hidden />
            {!canContinue && (
              <span id="atlas-squad-continue-help" className="sr-only">
                {t("fantasy.atlas.create.squad.continue_disabled")}
              </span>
            )}
          </button>
        }
      />
    </AtlasCreateShell>
  );
}

function Status({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div
        className={cn(
          "text-lg font-black tabular-nums",
          ok ? "text-emerald-700" : "text-slate-950",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
