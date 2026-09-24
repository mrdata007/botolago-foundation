import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, Info, Shield, ShieldHalf, Trash2, Undo2, X } from "lucide-react";
import type { ReactNode } from "react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { ui, UiIconButton, UiSheet } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle } from "@/lib/club-palette";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position } from "@/types/fantasy";

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
    "flex w-full items-center gap-3 px-4 py-1 text-start",
    ui.space.row,
    ui.rule.block,
    ui.text.body,
    "[font-weight:var(--ui-weight-heavy)]",
    ui.tone.default,
    "transition-colors hover:bg-[color:var(--ui-surface-sunken)]",
    ui.focus,
  );
  const disc = (tone: "ink" | "negative") =>
    cn(
      "grid h-9 w-9 shrink-0 place-items-center",
      ui.radius.full,
      ui.surface.sunken,
      tone === "negative" ? ui.tone.negative : ui.tone.ink,
    );
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
      {isStarter && onCaptain
        ? action(
            <Shield className="h-5 w-5" aria-hidden />,
            t("fpl.make_captain"),
            onCaptain,
            "captain",
          )
        : null}
      {isStarter && onVice
        ? action(<ShieldHalf className="h-5 w-5" aria-hidden />, t("fpl.make_vice"), onVice, "vice")
        : null}
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
