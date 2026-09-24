import { Plus, RotateCcw, UserPlus } from "lucide-react";
import type { ReactNode } from "react";

import { crestStyle } from "@/components/common/club-crest-style";
import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { ui, UiBanner, UiButton, UiHeader, UiIconButton, UiSegmented } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position, SquadPlayer } from "@/types/fantasy";
import { findClub } from "./club-lookup";
import { formatDeadline } from "./deadline";
import { FplEmptySlot, FplPlayerCard } from "./FplPlayerCard";
import { FplPitch } from "./FplPitch";
import { FplStatBar, type FplStatItem } from "./FplStatBar";
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
 * "Journée 14 · Date limite : 24 sept., 19:30", set as the navy strip's last
 * line. The formatter is pinned to the competition's calendar (BG-0100).
 */
function DeadlineLine({ gameweek, deadlineIso }: { gameweek: number; deadlineIso: string }) {
  const { t, lang } = useI18n();
  return (
    <p className={cn("min-w-0", ui.text.meta, ui.tone.onInkMuted)}>
      {t("fpl.gameweek")} {gameweek} · {t("fpl.deadline")}
      {/* French sets a narrow no-break space before a colon. */}
      {lang === "fr" ? " :" : ":"}{" "}
      <strong className={cn("whitespace-nowrap", ui.tone.onInkPlain)}>
        {formatDeadline(deadlineIso, lang)}
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
 *
 * Option A (A-Players, A-Team): the sub-page header with a kicker, the navy
 * summary strip, the "Terrain | Liste" pill, the pitch card, and a bottom
 * dock — "Ajouter un joueur" (the gradient primary) and "Suivant" (ink) — that
 * sticks above the bottom navigation on a phone (`--bottomnav-h`) and to the
 * bottom of the column from `md`, where the nav is hidden.
 */
export function SquadBuilderScreen({
  title,
  kicker,
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
  /** The small line above the title ("FANTASY"). */
  kicker?: ReactNode;
  backTo?: string;
  onBack?: () => void;
  gameweek: number;
  deadlineIso: string;
  stats: FplStatItem[];
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
  const clubOf = (id: string) => findClub(clubs, id);
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
  const incomingEdge = incomingClub ? crestStyle(incomingClub) : null;

  return (
    <>
      <UiHeader
        title={title}
        kicker={kicker}
        backTo={backTo}
        onBack={onBack}
        trailing={
          onReset && !resetDisabled ? (
            // A round control rather than a labelled pill, so the screen's
            // title keeps the width between the two flanks; the name stays
            // on the control for assistive tech and as its tooltip.
            <UiIconButton aria-label={t("fpl.reset")} title={t("fpl.reset")} onClick={onReset}>
              <RotateCcw aria-hidden />
            </UiIconButton>
          ) : null
        }
      />
      <FplStatBar
        items={stats}
        footer={<DeadlineLine gameweek={gameweek} deadlineIso={deadlineIso} />}
      />
      {banner ? <UiBanner>{banner}</UiBanner> : null}

      <div className={cn("pt-3", ui.space.gutter)}>
        <UiSegmented
          variant="pill"
          label={t("fantasy.view.toggle_label")}
          value={view}
          onChange={onViewChange}
          options={[
            { value: "squad", label: t("fantasy.view.pitch") },
            { value: "list", label: t("fpl.list") },
          ]}
        />
      </div>

      {view === "squad" ? (
        <FplPitch className="mx-[var(--ui-gutter)] mt-3" rows={ROWS.map(row)} />
      ) : (
        <SquadListTable
          className="mx-[var(--ui-gutter)] mt-3"
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

      <div
        className={cn(
          "sticky bottom-[var(--bottomnav-h)] z-30 mt-4 md:bottom-0",
          ui.surface.bar,
          ui.rule.blockStart,
          ui.shadow.raised,
          "pb-2.5 pt-2.5 md:pb-3",
        )}
      >
        {incoming ? (
          <div role="status" className={cn("pb-2.5", ui.space.gutter)}>
            <div
              data-club={incomingEdge?.["data-club"]}
              style={incomingEdge?.style}
              className={cn(
                "flex min-w-0 items-center gap-2.5 py-1.5 pe-1 ps-2.5",
                ui.surface.card,
                ui.edge.start,
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center",
                  ui.radius.full,
                  ui.surface.sunken,
                )}
              >
                <JerseyVisual
                  kit={getKitForClub(incomingClub, incoming.kitPattern)}
                  size={22}
                  variant="flat"
                  imageUrl={incoming.jerseyImageUrl}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn("flex min-w-0 items-center gap-1.5", ui.text.label, ui.tone.ink)}
                >
                  <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{t("fpl.incoming_player")}</span>
                </span>
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
                  {positionLabel(incoming.position)} ·{" "}
                  <span className={ui.text.tabular}>{nf.format(incoming.price)}</span>
                </span>
              </span>
              {onCancelIncoming ? (
                <UiButton variant="soft" size="sm" onClick={onCancelIncoming}>
                  {t("fpl.cancel")}
                </UiButton>
              ) : null}
            </div>
            <p className={cn("pt-2 text-center", ui.text.meta, ui.tone.ink)}>
              {t("fpl.select_replacement")}
            </p>
          </div>
        ) : null}
        {/* The primary action takes 3/5 of the row: "Ajouter un joueur" needs
            ~173px with its icon, and half of a 390px row is 163px. */}
        <div className={cn("grid grid-cols-[3fr_2fr] gap-2", ui.space.gutter)}>
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
