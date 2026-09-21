import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, Info, Shield, ShieldHalf, Trash2, Undo2, X } from "lucide-react";
import type { ReactNode } from "react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { ui, UiSheet } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position } from "@/types/fantasy";

/**
 * Bottom action sheet opened from a player on the Pick Team pitch.
 *
 * It is a kit `UiSheet`, not the shadcn one: that sheet ships its own close
 * control labelled with a hardcoded English "Close", which sat next to the
 * translated one on every Fantasy sheet in the product. The kit's overlay
 * labels its close control `t("fpl.close")` and nothing else.
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

  const rowClass = cn(
    "flex w-full items-center gap-3 px-4 text-start",
    ui.space.row,
    ui.rule.block,
    ui.text.body,
    "[font-weight:var(--ui-weight-heavy)]",
    ui.tone.default,
    ui.focus,
  );
  const action = (icon: ReactNode, label: ReactNode, onSelect: () => void, key: string) => (
    <button key={key} type="button" className={rowClass} onClick={onSelect}>
      {icon}
      {label}
    </button>
  );

  const header = (
    <div className={cn("flex items-center gap-3 px-4 py-3", ui.surface.inkPlain)}>
      <JerseyVisual kit={kit} size={36} imageUrl={player.jerseyImageUrl} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate", ui.text.subtitle)}>{tr(player.name)}</p>
        <p className={cn("truncate opacity-80", ui.text.meta)}>
          {club ? tr(club.shortName) : ""} · {positionLabel(player.position)}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("fpl.close")}
        className={cn(
          "grid shrink-0 place-items-center",
          ui.space.tap,
          ui.radius.full,
          ui.focus,
          "bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_15%,transparent)]",
        )}
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
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
      {isStarter && onCaptain
        ? action(
            <Shield className={cn("h-5 w-5", ui.tone.ink)} aria-hidden />,
            t("fpl.make_captain"),
            onCaptain,
            "captain",
          )
        : null}
      {isStarter && onVice
        ? action(
            <ShieldHalf className={cn("h-5 w-5", ui.tone.ink)} aria-hidden />,
            t("fpl.make_vice"),
            onVice,
            "vice",
          )
        : null}
      {onSubstitute
        ? action(
            <ArrowLeftRight className={cn("h-5 w-5", ui.tone.ink)} aria-hidden />,
            t("fpl.substitute"),
            onSubstitute,
            "substitute",
          )
        : null}
      {onTransferOut
        ? action(
            <ArrowLeftRight className={cn("h-5 w-5", ui.tone.negative)} aria-hidden />,
            t("fpl.transfer_out_player"),
            onTransferOut,
            "transfer-out",
          )
        : null}
      {onUndo
        ? action(
            <Undo2 className={cn("h-5 w-5", ui.tone.ink)} aria-hidden />,
            t("fpl.undo_transfer"),
            onUndo,
            "undo",
          )
        : null}
      {onRemove
        ? action(
            <Trash2 className={cn("h-5 w-5", ui.tone.negative)} aria-hidden />,
            t("fpl.remove"),
            onRemove,
            "remove",
          )
        : null}
      <Link
        to="/fantasy/players/$playerId"
        params={{ playerId: player.id }}
        className={rowClass}
        onClick={onClose}
      >
        <Info className={cn("h-5 w-5", ui.tone.ink)} aria-hidden />
        {t("fpl.player_info")}
      </Link>
    </UiSheet>
  );
}
