import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, Info, Shield, ShieldHalf, X } from "lucide-react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import type { Club } from "@/types/domain";
import type { FantasyPlayer } from "@/types/fantasy";

/**
 * Bottom action sheet opened from a player on the Pick Team pitch. The
 * reference set does not include this overlay explicitly, so it follows the
 * same ink/white language as the other reconstructed surfaces: player
 * identity on top, then "Make Captain", "Make Vice-Captain", "Substitute",
 * "Player information".
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
}: {
  open: boolean;
  player: FantasyPlayer | null;
  club?: Club;
  isStarter: boolean;
  onClose: () => void;
  onCaptain?: () => void;
  onVice?: () => void;
  onSubstitute?: () => void;
}) {
  const { t, tr } = useI18n();
  if (!player) return null;
  const kit = getKitForClub(club, player.kitPattern);
  const row =
    "flex min-h-14 w-full items-center gap-3 border-b border-[color:var(--fpl-grey)] px-4 text-[15px] font-bold text-foreground";
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-w-[480px] rounded-t-[16px] p-0">
        <div className="flex items-center gap-3 bg-[color:var(--fpl-ink)] px-4 py-3 text-white">
          <JerseyVisual kit={kit} size={36} imageUrl={player.jerseyImageUrl} />
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-[16px] font-extrabold text-white">
              {tr(player.name)}
            </SheetTitle>
            <SheetDescription className="truncate text-[12px] text-white/80">
              {club ? tr(club.shortName) : ""} · {t(`player.pos.${player.position}` as never)}
            </SheetDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("fpl.close")}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/15"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="bg-white pb-[max(env(safe-area-inset-bottom),0.5rem)]">
          {isStarter && onCaptain ? (
            <button type="button" className={row} onClick={onCaptain}>
              <Shield className="h-5 w-5 text-[color:var(--fpl-ink)]" aria-hidden />{" "}
              {t("fpl.make_captain")}
            </button>
          ) : null}
          {isStarter && onVice ? (
            <button type="button" className={row} onClick={onVice}>
              <ShieldHalf className="h-5 w-5 text-[color:var(--fpl-ink)]" aria-hidden />{" "}
              {t("fpl.make_vice")}
            </button>
          ) : null}
          {onSubstitute ? (
            <button type="button" className={row} onClick={onSubstitute}>
              <ArrowLeftRight className="h-5 w-5 text-[color:var(--fpl-ink)]" aria-hidden />{" "}
              {t("fpl.substitute")}
            </button>
          ) : null}
          <Link
            to="/fantasy/players/$playerId"
            params={{ playerId: player.id }}
            className={row}
            onClick={onClose}
          >
            <Info className="h-5 w-5 text-[color:var(--fpl-ink)]" aria-hidden />{" "}
            {t("fpl.player_info")}
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
