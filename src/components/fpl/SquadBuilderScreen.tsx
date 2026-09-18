import { Plus, RotateCcw, UserPlus } from "lucide-react";
import type { ReactNode } from "react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
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

const ROWS: Position[] = ["GK", "DEF", "MID", "FWD"];

/**
 * FPL-002/004/005/006 "Transfers" composition, shared by first-time squad
 * selection and later transfers. As in the reference, the whole 15-man squad
 * is laid out on the pitch in four rows (2 GK / 5 DEF / 5 MID / 3 FWD) with
 * no bench strip, cards carry the price on the sub plate, tapping a card opens
 * the player's actions, and once an incoming player has been chosen from
 * "Add Player" every card that cannot be replaced is dimmed while the
 * "Incoming Player" strip sits above the bottom bar (FPL-004).
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
  onAddPlayer,
  onNext,
  nextDisabled,
  nextLabel,
  onReset,
  resetDisabled,
  banner,
  listColumns,
  incoming,
  onCancelIncoming,
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
  onAddPlayer: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: ReactNode;
  onReset?: () => void;
  /** Hidden (not just disabled) when true: the reference shows Reset only once changes exist. */
  resetDisabled?: boolean;
  banner?: ReactNode;
  listColumns: SquadListColumn[];
  /** Player chosen from "Add Player" who still needs a slot (replace mode). */
  incoming?: FantasyPlayer | null;
  onCancelIncoming?: () => void;
  children?: ReactNode;
}) {
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const clubOf = (id: string) => clubs.find((c) => c.id === id);
  const replaceMode = !!incoming;

  const card = (s: BuilderSlot) => {
    const dimmed = replaceMode && s.position !== incoming!.position;
    return s.player ? (
      <FplPlayerCard
        key={s.slot}
        player={s.player}
        club={clubOf(s.player.clubId)}
        sub={s.sub ?? nf.format(s.player.price)}
        captain={s.isCaptain}
        vice={s.isViceCaptain}
        highlighted={s.highlighted}
        dimmed={dimmed}
        onClick={dimmed ? undefined : () => onSlotTap(s)}
      />
    ) : (
      <FplEmptySlot
        key={s.slot}
        position={s.position}
        className={dimmed ? "opacity-45" : undefined}
        onClick={dimmed ? undefined : () => onSlotTap(s)}
      />
    );
  };

  const sorted = slots.slice().sort((a, b) => a.slot - b.slot);
  const row = (pos: Position) => sorted.filter((s) => s.position === pos).map(card);

  const squadForList: SquadPlayer[] = sorted
    .filter((s) => s.player)
    .map((s) => ({
      playerId: s.player!.id,
      slot: s.slot,
      isCaptain: s.isCaptain,
      isViceCaptain: s.isViceCaptain,
    }));

  const incomingClub = incoming ? clubOf(incoming.clubId) : undefined;

  return (
    <>
      <FplHeader
        title={title}
        backTo={backTo}
        onBack={onBack}
        right={
          onReset && !resetDisabled ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-9 items-center gap-1 rounded-[6px] bg-[color:var(--fpl-ink)] px-3 text-[13px] font-extrabold text-[color:var(--fpl-green)]"
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
        <FplPitch rows={ROWS.map(row)} />
      ) : (
        <SquadListTable
          squad={squadForList}
          players={players}
          clubs={clubs}
          columns={listColumns}
          onRowClick={(id) => {
            const slot = sorted.find((s) => s.player?.id === id);
            if (slot) onSlotTap(slot);
          }}
        />
      )}

      {children}

      <div className="sticky bottom-0 z-30 mt-3 bg-[color:var(--fpl-bg)]/95 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur">
        {incoming ? (
          <div
            role="status"
            className="flex items-center gap-2 border-y border-[color:var(--fpl-grey)] bg-white"
          >
            <span className="inline-flex h-12 items-center gap-2 bg-[color:var(--brand-primary,var(--fpl-ink))] px-3 text-[13px] font-extrabold text-white">
              {t("fpl.incoming_player")} <UserPlus className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2 py-1">
              <JerseyVisual
                kit={getKitForClub(incomingClub, incoming.kitPattern)}
                size={28}
                imageUrl={incoming.jerseyImageUrl}
              />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-extrabold text-foreground">
                  {tr(incoming.name)}
                </span>
                <span className="block truncate text-[11px] text-[color:var(--fpl-grey-text)]">
                  {incomingClub ? tr(incomingClub.shortName) : ""} ·{" "}
                  {t(`player.pos.${incoming.position}` as never)} · {nf.format(incoming.price)}
                </span>
              </span>
            </span>
            {onCancelIncoming ? (
              <button
                type="button"
                onClick={onCancelIncoming}
                className="me-2 rounded-[4px] px-2 py-1 text-[12px] font-bold text-[color:var(--fpl-ink)] underline"
              >
                {t("fpl.cancel")}
              </button>
            ) : null}
          </div>
        ) : null}
        {incoming ? (
          <p className="px-3 pt-2 text-center text-[12px] font-semibold text-[color:var(--fpl-ink-deep)]">
            {t("fpl.select_replacement")}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2 px-3 pt-2">
          <FplButton variant="gradient" onClick={onAddPlayer} disabled={replaceMode}>
            <Plus className="h-4 w-4" aria-hidden /> {t("fpl.add_player")}
          </FplButton>
          <FplButton variant="ink" onClick={onNext} disabled={nextDisabled}>
            {nextLabel ?? t("fpl.next")}
          </FplButton>
        </div>
      </div>
    </>
  );
}
