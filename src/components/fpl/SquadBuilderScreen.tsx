import { Plus, RotateCcw, UserPlus } from "lucide-react";
import type { ReactNode } from "react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { ui, UiBanner, UiButton, UiHeader, UiSegmented } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position, SquadPlayer } from "@/types/fantasy";
import { FplEmptySlot, FplPlayerCard } from "./FplPlayerCard";
import { FplPitch } from "./FplPitch";
import { FplStatBar } from "./FplStatBar";
import { SquadListTable, type SquadListColumn } from "./SquadListTable";

export interface BuilderSlot {
  slot: number;
  position: Position;
  player: FantasyPlayer | null;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  /** Incoming player (transfer in) — highlighted sub plate like the reference. */
  highlighted?: boolean;
  /** Sub plate text (price by default). */
  sub?: string;
}

const ROWS: Position[] = ["GK", "DEF", "MID", "FWD"];

/**
 * The gameweek deadline, pinned to the competition's own calendar.
 *
 * `timeZone: MATCH_TIME_ZONE` is not decoration: without it the formatter
 * follows the viewer's browser and this line disagrees with every other
 * deadline on the screen for anyone outside Morocco (BG-0100).
 */
function DeadlineLine({ gameweek, deadlineIso }: { gameweek: number; deadlineIso: string }) {
  const { t, lang } = useI18n();
  const formatted = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MATCH_TIME_ZONE,
  }).format(new Date(deadlineIso));
  return (
    <p className={cn("mt-1 text-center", ui.text.secondary)}>
      {t("fpl.gameweek")} {gameweek} · {t("fpl.deadline")}
      {/* French sets a narrow no-break space before a colon. */}
      {lang === "fr" ? "\u202F:" : ":"}{" "}
      <strong className="whitespace-nowrap [font-weight:var(--ui-weight-heavy)]">
        {formatted}
      </strong>
    </p>
  );
}

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
  const positionLabel = (value: Position) =>
    value === "GK"
      ? t("player.pos.GK")
      : value === "DEF"
        ? t("player.pos.DEF")
        : value === "MID"
          ? t("player.pos.MID")
          : t("player.pos.FWD");

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
      <UiHeader
        title={title}
        tone="gradient"
        backTo={backTo}
        onBack={onBack}
        trailing={
          onReset && !resetDisabled ? (
            <UiButton variant="ink" size="sm" onClick={onReset}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t("fpl.reset")}
            </UiButton>
          ) : null
        }
      >
        <DeadlineLine gameweek={gameweek} deadlineIso={deadlineIso} />
        <UiSegmented
          className="mt-3"
          tone="onGradient"
          label={t("fpl.squad")}
          value={view}
          onChange={onViewChange}
          options={[
            { value: "squad", label: t("fpl.squad") },
            { value: "list", label: t("fpl.list") },
          ]}
        />
      </UiHeader>
      {banner ? <UiBanner>{banner}</UiBanner> : null}
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

      <div className={cn("sticky bottom-0 z-30 mt-3", ui.surface.bar, ui.safe.bottom)}>
        {incoming ? (
          <div
            role="status"
            className={cn("flex items-center gap-2", ui.rule.block, ui.rule.blockStart)}
          >
            <span
              className={cn(
                "inline-flex items-center gap-2 px-3",
                ui.space.row,
                ui.surface.inkPlain,
                ui.text.meta,
                "[font-weight:var(--ui-weight-heavy)]",
              )}
            >
              {t("fpl.incoming_player")} <UserPlus className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2 py-1">
              <JerseyVisual
                kit={getKitForClub(incomingClub, incoming.kitPattern)}
                size={28}
                imageUrl={incoming.jerseyImageUrl}
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate",
                    ui.text.meta,
                    "[font-weight:var(--ui-weight-heavy)]",
                    ui.tone.default,
                  )}
                >
                  {tr(incoming.name)}
                </span>
                <span className={cn("block truncate", ui.text.micro, ui.tone.muted)}>
                  {incomingClub ? tr(incomingClub.shortName) : ""} ·{" "}
                  {positionLabel(incoming.position)} · {nf.format(incoming.price)}
                </span>
              </span>
            </span>
            {onCancelIncoming ? (
              <UiButton variant="ghost" size="sm" className="me-1" onClick={onCancelIncoming}>
                {t("fpl.cancel")}
              </UiButton>
            ) : null}
          </div>
        ) : null}
        {incoming ? (
          <p className={cn("px-3 pt-2 text-center", ui.text.meta, ui.tone.ink)}>
            {t("fpl.select_replacement")}
          </p>
        ) : null}
        {/* px-2: at 390px the kit button's 16px gutters push "Ajouter un joueur"
            onto a second line next to a one-word sibling. */}
        <div className="grid grid-cols-2 gap-2 px-3 pt-2">
          <UiButton
            className="px-2"
            variant="gradient"
            onClick={onAddPlayer}
            disabled={replaceMode}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden /> {t("fpl.add_player")}
          </UiButton>
          <UiButton className="px-2" variant="ink" onClick={onNext} disabled={nextDisabled}>
            {nextLabel ?? t("fpl.next")}
          </UiButton>
        </div>
      </div>
    </>
  );
}
