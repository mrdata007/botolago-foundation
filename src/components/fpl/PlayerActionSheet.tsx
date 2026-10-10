import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, Info, Shield, ShieldHalf, Trash2, Undo2, X } from "lucide-react";
import { lazy, Suspense, type ReactNode } from "react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { ui, UiIconButton, UiSheet } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle } from "@/lib/club-palette";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import { useManagerCardLive } from "@/services/manager-card-status";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position } from "@/types/fantasy";

// The card's hint is its own chunk, requested only while the section is live: with the switch off
// this sheet imports nothing of the Manager Card.
const CardHint = lazy(() =>
  import("@/components/manager-card/inline/curva-inline").then((module) => ({
    default: module.CardHint,
  })),
);

/**
 * Bottom action sheet opened from a player on the pitch.
 *
 * It is a kit `UiSheet`, not the shadcn one: that sheet ships its own close
 * control labelled with a hardcoded English "Close", which sat next to the
 * translated one on every Fantasy sheet in the product. The kit's overlay
 * labels its close control `t("fpl.close")` and nothing else.
 *
 * Option A: the sheet opens on the player's club — the header is the club's
 * own colour block (`clubStyle` + `ui.club.fill`, with the diagonal
 * `club-stripes`), the shirt on a surface disc lifted off it, the name in the
 * display face, and a glass close disc whose icon takes the measured on-club
 * colour (dark on FUS orange, white on Wydad red). A player whose club cannot
 * be resolved gets the ink block, the palette's own fallback. The actions are
 * rows with a soft icon disc, each clearing the 48px row floor.
 */
export function PlayerActionSheet({
  open,
  player,
  club,
  isStarter,
  onClose,
  onCaptain,
  onVice,
  onSubstitute,
  onTransferOut,
  onRemove,
  onUndo,
}: {
  open: boolean;
  player: FantasyPlayer | null;
  club?: Club;
  isStarter: boolean;
  onClose: () => void;
  onCaptain?: () => void;
  onVice?: () => void;
  onSubstitute?: () => void;
  /** Transfers: mark this player as outgoing and pick a replacement. */
  onTransferOut?: () => void;
  /** Squad selection: clear this slot. */
  onRemove?: () => void;
  /** Transfers: cancel the pending transfer that brought this player in. */
  onUndo?: () => void;
}) {
  const { t, tr } = useI18n();
  const cardLive = useManagerCardLive();
  if (!player) return null;

  const kit = getKitForClub(club, player.kitPattern);
  const positionLabel = (value: Position) =>
    value === "GK"
      ? t("player.pos.GK")
      : value === "DEF"
        ? t("player.pos.DEF")
        : value === "MID"
          ? t("player.pos.MID")
          : t("player.pos.FWD");

  const rowClass = ROW_CLASS;
  const disc = discClass;
  const action = (
    icon: ReactNode,
    label: ReactNode,
    onSelect: () => void,
    key: string,
    tone: "ink" | "negative" = "ink",
  ) => (
    <button key={key} type="button" className={rowClass} onClick={onSelect}>
      <span className={disc(tone)}>{icon}</span>
      {label}
    </button>
  );

  const clubColours = clubStyle(club);
  const header = (
    <div
      {...clubColours}
      className={cn("flex items-center gap-3 px-4 pb-4 pt-5", ui.club.fill, ui.club.stripes)}
    >
      <span
        className={cn(
          "grid h-14 w-14 shrink-0 place-items-center",
          ui.radius.full,
          ui.club.inverse,
          ui.shadow.lifted,
        )}
      >
        <JerseyVisual kit={kit} size={34} variant="flat" imageUrl={player.jerseyImageUrl} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate", ui.display.team)}>{tr(player.name)}</p>
        <p className={cn("truncate", ui.text.meta, "[font-weight:var(--ui-weight-strong)]")}>
          {[club ? tr(club.shortName) : null, positionLabel(player.position)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <UiIconButton variant="glass" aria-label={t("fpl.close")} onClick={onClose}>
        <X aria-hidden />
      </UiIconButton>
    </div>
  );

  return (
    <UiSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={tr(player.name)}
      description={club ? tr(club.shortName) : undefined}
      header={header}
    >
      {cardLive && isStarter && onCaptain ? (
        // Directly above the control being used (plan M3e): the captain choice counts for CAP.
        // Once per phone, only for a card with no number yet, dismissible.
        <Suspense fallback={null}>
          <CardHint kind="cap" className="mx-4 mb-1 mt-3" />
        </Suspense>
      ) : null}
      <CaptainActions isStarter={isStarter} onCaptain={onCaptain} onVice={onVice} />
      {onSubstitute
        ? action(
            <ArrowLeftRight className="h-5 w-5" aria-hidden />,
            t("fpl.substitute"),
            onSubstitute,
            "substitute",
          )
        : null}
      {onTransferOut
        ? action(
            <ArrowLeftRight className="h-5 w-5" aria-hidden />,
            t("fpl.transfer_out_player"),
            onTransferOut,
            "transfer-out",
            "negative",
          )
        : null}
      {onUndo
        ? action(<Undo2 className="h-5 w-5" aria-hidden />, t("fpl.undo_transfer"), onUndo, "undo")
        : null}
      {onRemove
        ? action(
            <Trash2 className="h-5 w-5" aria-hidden />,
            t("fpl.remove"),
            onRemove,
            "remove",
            "negative",
          )
        : null}
      <Link
        to="/fantasy/players/$playerId"
        params={{ playerId: player.id }}
        className={cn(rowClass, "border-b-0")}
        onClick={onClose}
      >
        <span className={disc("ink")}>
          <Info className="h-5 w-5" aria-hidden />
        </span>
        {t("fpl.player_info")}
      </Link>
    </UiSheet>
  );
}

const ROW_CLASS = cn(
  "flex w-full items-center gap-3 px-4 py-1 text-start",
  ui.space.row,
  ui.rule.block,
  ui.text.body,
  "[font-weight:var(--ui-weight-heavy)]",
  ui.tone.default,
  "transition-colors hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)]",
  ui.focus,
);

function discClass(tone: "ink" | "negative" | "muted") {
  return cn(
    "grid h-9 w-9 shrink-0 place-items-center",
    ui.radius.full,
    ui.surface.sunken,
    tone === "negative" ? ui.tone.negative : tone === "muted" ? ui.tone.muted : ui.tone.ink,
  );
}

/**
 * "Nommer capitaine" and "Nommer vice-capitaine", for the screens that offer
 * them (`onCaptain` / `onVice`). A starter gets the two actions. A substitute
 * gets the same two rows, unavailable, with the reason — "Titulaires
 * uniquement" — instead of nothing: on the squad builder and "Mon équipe" a
 * missing captain action on a bench player read as a bug.
 */
export function CaptainActions({
  isStarter,
  onCaptain,
  onVice,
}: {
  isStarter: boolean;
  onCaptain?: () => void;
  onVice?: () => void;
}) {
  const { t } = useI18n();
  const rows: Array<{ key: string; icon: ReactNode; label: string; onSelect?: () => void }> = [
    {
      key: "captain",
      icon: <Shield className="h-5 w-5" aria-hidden />,
      label: t("fpl.make_captain"),
      onSelect: onCaptain,
    },
    {
      key: "vice",
      icon: <ShieldHalf className="h-5 w-5" aria-hidden />,
      label: t("fpl.make_vice"),
      onSelect: onVice,
    },
  ];
  return (
    <>
      {rows.map((row) =>
        !row.onSelect ? null : isStarter ? (
          <button key={row.key} type="button" className={ROW_CLASS} onClick={row.onSelect}>
            <span className={discClass("ink")}>{row.icon}</span>
            {row.label}
          </button>
        ) : (
          // `aria-disabled` rather than `disabled`: the row stays in the tab
          // order and a screen reader announces it as unavailable together
          // with its reason. No handler, so pressing it does nothing. Muted
          // text, not faded opacity, so the reason stays readable.
          <button
            key={row.key}
            type="button"
            aria-disabled="true"
            data-unavailable={row.key}
            className={cn(
              "flex w-full cursor-not-allowed items-center gap-3 px-4 py-1 text-start",
              ui.space.row,
              ui.rule.block,
              ui.text.body,
              "[font-weight:var(--ui-weight-heavy)]",
              ui.tone.muted,
              ui.focus,
            )}
          >
            <span className={discClass("muted")}>{row.icon}</span>
            <span className="min-w-0">
              <span className="block">{row.label}</span>
              <span
                className={cn(
                  "block",
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-strong)]",
                  ui.tone.muted,
                )}
              >
                {t("fantasy.create.starters_only")}
              </span>
            </span>
          </button>
        ),
      )}
    </>
  );
}
