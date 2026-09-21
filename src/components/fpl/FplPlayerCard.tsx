import { AlertTriangle, Plus, X } from "lucide-react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { ui, UiPlayerPlate } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position } from "@/types/fantasy";

/** The captain / vice marker. Sits on the shirt's top inline-end corner. */
function RoleMarker({ letter, title, tone }: { letter: string; title: string; tone: "c" | "v" }) {
  return (
    <span
      aria-hidden
      title={title}
      className={cn(
        "grid h-5 w-5 place-items-center",
        ui.radius.full,
        ui.text.micro,
        "[font-weight:var(--ui-weight-hero)]",
        // A ring in the plain on-ink foreground keeps the marker legible on
        // turf in both themes without a literal white.
        "ring-2 ring-[color:var(--ui-on-ink-plain)]",
        // Captain is cyan-on-ink, vice is plain-on-ink: the two read apart at
        // a glance and not only by their letter — which matters because the
        // armband is auto-assigned to the first two squad entries and a
        // manager has to notice that before the deadline.
        tone === "c" ? ui.surface.ink : ui.surface.inkPlain,
      )}
    >
      {letter}
    </span>
  );
}

/**
 * The pitch's player unit: kit on top, an ink name plate, and a sub plate
 * carrying the fixture, the price or the gameweek points.
 *
 * It is a thin wrapper over `UiPlayerPlate` — the kit owns the plate's
 * geometry, surfaces and tap behaviour; this file owns what Fantasy puts in
 * it (the club kit, the availability flag, the armband). Before BG-0094 it
 * drew its own plates out of `bg-white`, `text-white` and `bg-black`, none of
 * which follow the theme.
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
  const fullName = tr(player.name);
  const shortName = fullName.split(" ").slice(-1)[0] ?? fullName;
  const kit = getKitForClub(club, player.kitPattern);
  const doubtful = player.status === "doubtful";
  const flagged = player.status !== "available";
  const jersey = size === "md" ? 46 : 40;

  const role = captain
    ? `, ${t("fantasy.captain_full")}`
    : vice
      ? `, ${t("fantasy.vice_full")}`
      : "";

  return (
    <UiPlayerPlate
      name={
        // A 76px plate at 390px fits about eleven characters; Moroccan
        // surnames routinely run longer ("Attiat-Allah", "Salah-Eddine").
        // `ltr:tracking-tight` buys those the few pixels they need and is
        // Latin-only, because letter-spacing — in either direction — pulls
        // joined Arabic letterforms apart (BG-0069). The `title` keeps the
        // whole name reachable when one still has to be cut.
        <span className="ltr:tracking-tight" title={fullName}>
          {shortName}
        </span>
      }
      sub={sub ?? " "}
      state={highlighted ? "selected" : doubtful ? "doubtful" : "default"}
      onClick={onClick}
      ariaLabel={`${fullName}${club ? `, ${tr(club.shortName)}` : ""}${role}`}
      className={cn(dimmed && "opacity-45", className)}
      visual={
        <JerseyVisual
          kit={kit}
          size={jersey}
          imageUrl={player.jerseyImageUrl}
          ariaLabel={club ? tr(club.shortName) : undefined}
        />
      }
      badge={
        captain ? (
          <RoleMarker letter={t("fantasy.captain")} title={t("fantasy.captain_full")} tone="c" />
        ) : vice ? (
          <RoleMarker letter={t("fantasy.vice")} title={t("fantasy.vice_full")} tone="v" />
        ) : undefined
      }
      flag={
        onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={removeLabel ?? t("fpl.remove")}
            // The visible glyph stays small so it does not cover the shirt,
            // but the control itself clears the 44px floor: the hit area
            // grows inwards from the corner the glyph is drawn in.
            className={cn("grid place-items-start", ui.space.tap, ui.radius.full, ui.focus)}
          >
            <span
              className={cn(
                "grid h-5 w-5 place-items-center",
                ui.radius.full,
                "bg-[color:var(--ui-negative)] text-[color:var(--ui-on-ink-plain)]",
                "shadow-[var(--ui-shadow-card)]",
              )}
            >
              <X className="h-3 w-3" aria-hidden />
            </span>
          </button>
        ) : flagged ? (
          <span
            className={cn(
              "grid h-5 w-5 place-items-center",
              ui.radius.full,
              "bg-[color:var(--ui-caution)] text-[color:var(--ui-ink-deep)]",
              "shadow-[var(--ui-shadow-card)]",
            )}
            title={t(`player.status.${player.status}` as never)}
            aria-hidden
          >
            <AlertTriangle className="h-3 w-3" />
          </span>
        ) : undefined
      }
    />
  );
}

/** Empty squad slot: a translucent shirt silhouette with a "+" and the position label. */
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
    <UiPlayerPlate
      name={t(`player.pos.${position}` as never)}
      sub={t("fpl.select")}
      onClick={onClick}
      ariaLabel={`${t("fpl.add_player")} — ${t(`player.pos.${position}` as never)}`}
      className={className}
      visual={
        <span className="relative grid h-[54px] w-[46px] place-items-center">
          <svg viewBox="0 0 48 56" className="absolute inset-0 h-full w-full" aria-hidden>
            <path
              d="M14 4 L20 1 Q24 5 28 1 L34 4 L46 12 L40 22 L36 19 L36 54 L12 54 L12 19 L8 22 L2 12 Z"
              fill="color-mix(in oklab, var(--ui-pitch-line) 38%, transparent)"
              stroke="var(--ui-pitch-line)"
              strokeWidth="1.5"
            />
          </svg>
          <span
            className={cn(
              "relative grid h-6 w-6 place-items-center",
              ui.radius.full,
              ui.surface.inkPlain,
            )}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </span>
        </span>
      }
    />
  );
}
