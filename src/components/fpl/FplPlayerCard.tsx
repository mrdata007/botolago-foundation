import { AlertTriangle, Plus, X } from "lucide-react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position } from "@/types/fantasy";

/**
 * Player card reconstructed from the FPL pitch reference: kit on top, an
 * ink name plate, and a light sub plate (fixture / price / points). Captain
 * and vice badges sit at the top-right of the shirt; availability warnings at
 * the top-left; the sub plate turns amber for doubtful players and cyan for a
 * highlighted (incoming / selected) player.
 */
export function FplPlayerCard({
  player,
  club,
  sub,
  captain,
  vice,
  highlighted,
  dimmed,
  onClick,
  onRemove,
  removeLabel,
  className,
  size = "md",
}: {
  player: FantasyPlayer;
  club?: Club;
  /** Bottom plate text: fixture ("WAC (D)"), price ("5.7"), or points ("8"). */
  sub?: string;
  captain?: boolean;
  vice?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
  size?: "md" | "sm";
}) {
  const { tr, t } = useI18n();
  const shortName = tr(player.name).split(" ").slice(-1)[0] ?? tr(player.name);
  const kit = getKitForClub(club, player.kitPattern);
  const doubtful = player.status === "doubtful";
  const flagged = player.status !== "available";
  const jersey = size === "md" ? 46 : 40;

  return (
    <div
      className={cn(
        "relative flex w-full flex-col items-center",
        dimmed && "opacity-45",
        className,
      )}
    >
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? t("fpl.remove")}
          className="absolute -start-0.5 top-0 z-10 grid h-5 w-5 place-items-center rounded-full bg-[color:var(--fpl-pink)] text-white shadow"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      ) : flagged ? (
        <span
          className="absolute -start-0.5 top-0 z-10 grid h-5 w-5 place-items-center rounded-full bg-[color:var(--fpl-amber)] text-[color:var(--fpl-ink-deep)] shadow"
          title={t(`player.status.${player.status}` as never)}
          aria-hidden
        >
          <AlertTriangle className="h-3 w-3" />
        </span>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group flex w-full flex-col items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
          onClick ? "cursor-pointer" : "cursor-default",
        )}
        aria-label={`${tr(player.name)}${club ? `, ${tr(club.shortName)}` : ""}${captain ? `, ${t("fantasy.captain_full")}` : vice ? `, ${t("fantasy.vice_full")}` : ""}`}
      >
        <span className="relative">
          <JerseyVisual
            kit={kit}
            size={jersey}
            imageUrl={player.jerseyImageUrl}
            ariaLabel={club ? tr(club.shortName) : undefined}
          />
          {captain ? (
            <span
              aria-hidden
              className="absolute -end-1 top-0 grid h-5 w-5 place-items-center rounded-full bg-black text-[11px] font-black text-white ring-2 ring-white"
            >
              C
            </span>
          ) : vice ? (
            <span
              aria-hidden
              className="absolute -end-1 top-0 grid h-5 w-5 place-items-center rounded-full bg-black text-[11px] font-black text-white ring-2 ring-white"
            >
              V
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 w-full truncate rounded-t-[3px] bg-[color:var(--fpl-ink)] px-1 text-center text-[11px] font-bold leading-[18px] text-white">
          {shortName}
        </span>
        <span
          className={cn(
            "w-full truncate rounded-b-[3px] px-1 text-center text-[11px] font-semibold leading-[18px]",
            highlighted
              ? "bg-[color:var(--fpl-cyan)] text-[color:var(--fpl-ink-deep)]"
              : doubtful
                ? "bg-[color:var(--fpl-amber)] text-[color:var(--fpl-ink-deep)]"
                : "bg-white text-[color:var(--fpl-ink-deep)]",
          )}
        >
          {sub ?? " "}
        </span>
      </button>
    </div>
  );
}

/** Empty squad slot: translucent shirt silhouette with a "+" and the position label. */
export function FplEmptySlot({
  position,
  onClick,
  className,
}: {
  position: Position;
  onClick?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full flex-col items-center", className)}
      aria-label={`${t("fpl.add_player")} — ${t(`player.pos.${position}` as never)}`}
    >
      <span className="relative grid h-[54px] w-[46px] place-items-center">
        <svg viewBox="0 0 48 56" className="absolute inset-0 h-full w-full" aria-hidden>
          <path
            d="M14 4 L20 1 Q24 5 28 1 L34 4 L46 12 L40 22 L36 19 L36 54 L12 54 L12 19 L8 22 L2 12 Z"
            fill="rgba(255,255,255,0.35)"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth="1.5"
          />
        </svg>
        <span className="relative grid h-6 w-6 place-items-center rounded-full bg-[color:var(--fpl-ink)] text-white">
          <Plus className="h-4 w-4" aria-hidden />
        </span>
      </span>
      <span className="mt-0.5 w-full rounded-t-[3px] bg-[color:var(--fpl-ink)] px-1 text-center text-[11px] font-bold leading-[18px] text-white">
        {t(`player.pos.${position}` as never)}
      </span>
      <span className="w-full rounded-b-[3px] bg-white px-1 text-center text-[11px] font-semibold leading-[18px] text-[color:var(--fpl-ink-deep)]">
        {t("fpl.select")}
      </span>
    </button>
  );
}
