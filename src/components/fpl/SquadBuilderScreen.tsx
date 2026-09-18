import { Plus, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position, SquadPlayer } from "@/types/fantasy";
import { FplEmptySlot, FplPlayerCard } from "./FplPlayerCard";
import { FplPitch } from "./FplPitch";
import { FplStatBar } from "./FplStatBar";
import { SquadListTable, type SquadListColumn } from "./SquadListTable";
import { FplBanner, FplButton, FplDeadlineLine, FplHeader, FplSegmented } from "./primitives";

export interface BuilderSlot {
  slot: number;
  position: Position;
  player: FantasyPlayer | null;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  /** Incoming player (transfer in) — cyan sub plate like the reference. */
  highlighted?: boolean;
  /** Sub plate text (price by default). */
  sub?: string;
}

/**
 * FPL-002/004/005/006 "Transfers" composition, shared by first-time squad
 * selection and later transfers: Back header + deadline line + Squad/List
 * control, the four-cell stat bar, the pitch with removable / empty slots,
 * the labelled bench and the "Add Player | Next" bottom bar.
 */
export function SquadBuilderScreen({
  title,
  backTo,
  onBack,
  gameweek,
  deadlineIso,
  stats,
  slots,
  clubs,
  players,
  view,
  onViewChange,
  onSlotTap,
  onRemove,
  onAddPlayer,
  onNext,
  nextDisabled,
  nextLabel,
  onReset,
  resetDisabled,
  banner,
  listColumns,
  children,
}: {
  title: ReactNode;
  backTo?: string;
  onBack?: () => void;
  gameweek: number;
  deadlineIso: string;
  stats: Array<{ label: ReactNode; value: ReactNode; tone?: "ink" | "grey" }>;
  slots: BuilderSlot[];
  clubs: Club[];
  players: FantasyPlayer[];
  view: "squad" | "list";
  onViewChange: (view: "squad" | "list") => void;
  onSlotTap: (slot: BuilderSlot) => void;
  onRemove: (slot: BuilderSlot) => void;
  onAddPlayer: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: ReactNode;
  onReset?: () => void;
  resetDisabled?: boolean;
  banner?: ReactNode;
  listColumns: SquadListColumn[];
  children?: ReactNode;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const clubOf = (id: string) => clubs.find((c) => c.id === id);

  const card = (s: BuilderSlot) =>
    s.player ? (
      <FplPlayerCard
        key={s.slot}
        player={s.player}
        club={clubOf(s.player.clubId)}
        sub={s.sub ?? nf.format(s.player.price)}
        captain={s.isCaptain}
        vice={s.isViceCaptain}
        highlighted={s.highlighted}
        onClick={() => onSlotTap(s)}
        onRemove={() => onRemove(s)}
      />
    ) : (
      <FplEmptySlot key={s.slot} position={s.position} onClick={() => onSlotTap(s)} />
    );

  const xi = slots.filter((s) => s.slot < 12).sort((a, b) => a.slot - b.slot);
  const bench = slots.filter((s) => s.slot >= 12).sort((a, b) => a.slot - b.slot);
  const row = (pos: Position) => xi.filter((s) => s.position === pos).map(card);
  const benchLabels = bench.map((s, index) =>
    index === 0 ? t("fpl.gkp") : `${index}. ${t(`player.pos.${s.position}` as TranslationKey)}`,
  );

  const squadForList: SquadPlayer[] = slots
    .filter((s) => s.player)
    .map((s) => ({
      playerId: s.player!.id,
      slot: s.slot,
      isCaptain: s.isCaptain,
      isViceCaptain: s.isViceCaptain,
    }));
  const listPlayers = players;

  return (
    <>
      <FplHeader
        title={title}
        backTo={backTo}
        onBack={onBack}
        right={
          onReset ? (
            <button
              type="button"
              onClick={onReset}
              disabled={resetDisabled}
              className="inline-flex min-h-9 items-center gap-1 rounded-[6px] bg-[color:var(--fpl-ink)] px-3 text-[13px] font-extrabold text-white disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t("fpl.reset")}
            </button>
          ) : null
        }
      >
        <FplDeadlineLine gameweek={gameweek} deadlineIso={deadlineIso} />
        <FplSegmented
          className="mt-3"
          value={view}
          onChange={onViewChange}
          options={[
            { value: "squad", label: t("fpl.squad") },
            { value: "list", label: t("fpl.list") },
          ]}
        />
      </FplHeader>
      {banner ? <FplBanner>{banner}</FplBanner> : null}
      <FplStatBar items={stats} />

      {view === "squad" ? (
        <FplPitch
          rows={[row("GK"), row("DEF"), row("MID"), row("FWD")]}
          bench={bench.map(card)}
          benchLabels={benchLabels}
        />
      ) : (
        <SquadListTable
          squad={squadForList}
          players={listPlayers}
          clubs={clubs}
          columns={listColumns}
          onRowClick={(id) => {
            const slot = slots.find((s) => s.player?.id === id);
            if (slot) onSlotTap(slot);
          }}
        />
      )}

      {children}

      <div className="sticky bottom-0 z-30 mt-3 grid grid-cols-2 gap-2 bg-[color:var(--fpl-bg)]/95 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 backdrop-blur">
        <FplButton variant="gradient" onClick={onAddPlayer}>
          <Plus className="h-4 w-4" aria-hidden /> {t("fpl.add_player")}
        </FplButton>
        <FplButton variant="ink" onClick={onNext} disabled={nextDisabled}>
          {nextLabel ?? t("fpl.next")}
        </FplButton>
      </div>
    </>
  );
}
