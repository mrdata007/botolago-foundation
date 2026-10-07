import { AlertTriangle, Plus, X } from "lucide-react";
import type { ReactNode } from "react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { ui, UiPlayerPlate } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { useJustChanged, useJustTurnedOn } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position } from "@/types/fantasy";
import { plateName } from "./plate-name";

/**
 * The captain / vice marker, seated on the shirt's inline-end shoulder as the
 * A-Team board draws it (not on the plate's far corner, 20px away from the
 * shirt it belongs to).
 *
 * The two read apart by more than their letter — which matters, because a
 * manager has to see at a glance who holds which armband before the deadline
 * (a first squad no longer gets one automatically): the captain is a navy disc with a light
 * letter in a light ring, the vice its inverse — a surface disc with the brand
 * letter in a navy ring. Every colour is a token that flips with the theme.
 */
function RoleMarker({
  letter,
  title,
  tone,
  fresh = false,
}: {
  letter: string;
  title: string;
  tone: "c" | "v";
  /** Just given: the marker pops in. */
  fresh?: boolean;
}) {
  return (
    <span
      aria-hidden
      title={title}
      className={cn(
        // 12px past the shoulder while the plate has room. On a narrow plate
        // (a row of five on a small phone) it slides in, so its edge never
        // passes the plate's: `50%` is half the shirt, `50cqw` half the plate
        // (`UiPlayerPlate` is the container). Plates sit inside the
        // touchlines, so the marker does too; its ring hangs 2px, like the
        // warning disc's.
        "absolute end-[max(-0.75rem,calc(50%-50cqw))] -top-1.5 z-10 grid h-5 w-5 place-items-center",
        ui.radius.full,
        ui.text.micro,
        "[font-weight:var(--ui-weight-heavy)]",
        "ring-2",
        fresh && "pop",
        tone === "c"
          ? cn(ui.surface.inkPlain, "ring-[color:var(--ui-on-ink-plain)]")
          : cn("bg-[color:var(--ui-surface)]", ui.tone.ink, "ring-[color:var(--ui-ink-fg)]"),
      )}
    >
      {letter}
    </span>
  );
}

/**
 * The pitch's player unit: the club's flat shirt on top, then the kit's
 * plate — the name on the surface over a navy figure band carrying the
 * fixture, the price or the gameweek points.
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
  noMatch,
  onClick,
  onRemove,
  removeLabel,
  className,
  size = "md",
}: {
  player: FantasyPlayer;
  club?: Club;
  /**
   * Bottom plate: fixture ("FUS (D)", with the opponent's crest beside the
   * letters when the club has one), price ("5.7") or points ("8").
   *
   * BG-0111 widened this from `string`. The crest is the identity signal, but
   * at the 14px this band allows it reads as a colour signature rather than a
   * legible badge, so the letters ship alongside it rather than instead of it.
   * `UiPlayerPlate.sub` has always been `ReactNode`; this was the narrower of
   * the two. Every other caller still passes a plain string.
   */
  sub?: ReactNode;
  captain?: boolean;
  vice?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  /** The player's club has no match this gameweek: a "!" badge on the shirt. */
  noMatch?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
  size?: "md" | "sm";
}) {
  const { tr, t } = useI18n();
  // The armband just passed to this player (not on first show): a gold ring
  // opens around the shirt and the "C" pops.
  const newCaptain = useJustTurnedOn(Boolean(captain));
  // A different player in the same slot (a transfer): the new one drops in.
  const arrived = useJustChanged(player.id, 600);
  const fullName = tr(player.name);
  // The surname — and in Arabic "عطية الله", not a bare "الله" (plate-name.ts).
  const shortName = plateName(fullName);
  const kit = getKitForClub(club, player.kitPattern);
  const doubtful = player.status === "doubtful";
  const flagged = player.status !== "available";
  // The board's shirts: 42px on the pitch, 34px on the bench strip.
  const jersey = size === "md" ? 42 : 34;

  const noMatchText = t("fantasy.hub.no_match");
  const role = captain
    ? `, ${t("fantasy.captain_full")}`
    : vice
      ? `, ${t("fantasy.vice_full")}`
      : "";

  return (
    <UiPlayerPlate
      name={
        // A 76px plate fits about eleven characters, and a row of five on a
        // 390px phone narrows to 61px to stay inside the touchlines; Moroccan
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
      ariaLabel={`${fullName}${club ? `, ${tr(club.shortName)}` : ""}${role}${noMatch ? `, ${noMatchText}` : ""}`}
      className={cn(dimmed && "opacity-45", arrived && "swap-in", className)}
      visual={
        // The marker rides inside the visual so it is placed against the
        // shirt, not against the 76px plate. The shirt keeps the club's name
        // as its image label, as before.
        <span className="relative mb-1 block">
          <JerseyVisual
            kit={kit}
            size={jersey}
            variant="flat"
            imageUrl={player.jerseyImageUrl}
            ariaLabel={club ? tr(club.shortName) : undefined}
          />
          {newCaptain ? (
            <span
              aria-hidden
              className="captain-ring pointer-events-none absolute inset-0 rounded-full"
            />
          ) : null}
          {captain ? (
            <RoleMarker
              letter={t("fantasy.captain")}
              title={t("fantasy.captain_full")}
              tone="c"
              fresh={newCaptain}
            />
          ) : vice ? (
            <RoleMarker letter={t("fantasy.vice")} title={t("fantasy.vice_full")} tone="v" />
          ) : null}
        </span>
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
            //
            // NOT `ui.hitArea`, although that is the kit's token for exactly
            // "a 44px target on a control painted smaller". It centres the
            // target on the glyph, and this glyph is already pinned to the
            // plate's start/top corner by `UiPlayerPlate`, so a centred 44px
            // box would hang ~12px off the top and inline-start edges of the
            // pitch slot rather than reaching inwards over the shirt.
            className={cn("grid place-items-start", ui.space.tap, ui.radius.full, ui.focus)}
          >
            <span
              className={cn(
                "grid h-5 w-5 place-items-center",
                ui.radius.full,
                // The foreground a negative FILL carries is `--ui-on-negative`,
                // never one picked here: `--ui-negative` inverts across the
                // themes — a mid-tone in light, a light tint in dark — so the
                // plain on-ink white this used measured against the dark fill
                // is the 2.31:1 case the token was added for. `ui.tone.onNegative`
                // flips with it.
                "bg-[color:var(--ui-negative)]",
                ui.tone.onNegative,
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
              // Same rule as the remove badge above. `--ui-on-caution` does
              // resolve to `--ui-ink-deep` in both themes today, so this is
              // not a contrast fix — it is a correctness one: the amber is
              // the kit's to re-tune, and a foreground spelled here does not
              // move with it.
              "bg-[color:var(--ui-caution)]",
              ui.tone.onCaution,
              "shadow-[var(--ui-shadow-card)]",
            )}
            title={t(`player.status.${player.status}` as never)}
            aria-hidden
          >
            <AlertTriangle className="h-3 w-3" />
          </span>
        ) : noMatch ? (
          // "!" for a club with no match: the same caution badge as an
          // availability flag, with the word for it as the title.
          <span
            className={cn(
              "grid h-5 w-5 place-items-center",
              ui.radius.full,
              "bg-[color:var(--ui-caution)]",
              ui.tone.onCaution,
              ui.text.micro,
              "[font-weight:var(--ui-weight-heavy)]",
              "shadow-[var(--ui-shadow-card)]",
            )}
            title={noMatchText}
            aria-hidden
          >
            !
          </span>
        ) : undefined
      }
    />
  );
}

/**
 * Empty squad slot: the flat shirt's silhouette as a ghost — the turf's own
 * line colour, translucent — with a navy "+" disc on it, then the position
 * and "Choisir" on the plate. Same footprint as a filled slot, so the rows do
 * not jump as the squad fills.
 */
export function FplEmptySlot({
  position,
  onClick,
  onBench = false,
  className,
}: {
  position: Position;
  onClick?: () => void;
  /**
   * On the white bench strip the turf's white line would vanish, so the
   * ghost shirt takes the control edge (`--ui-rule-strong`) instead.
   */
  onBench?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const ghostLine = onBench ? "var(--ui-rule-strong)" : "var(--ui-pitch-line)";
  return (
    <UiPlayerPlate
      name={t(`player.pos.${position}` as never)}
      sub={t("fpl.select")}
      onClick={onClick}
      ariaLabel={`${t("fpl.add_player")} — ${t(`player.pos.${position}` as never)}`}
      className={className}
      visual={
        <span className="relative mb-1 grid h-[34px] w-[34px] place-items-center">
          <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full" aria-hidden>
            <path
              d="M8 3 4 5.5 2.5 10l3 1.2V21h13v-9.8l3-1.2L20 5.5 16 3c-.8 1.4-2.3 2.3-4 2.3S8.8 4.4 8 3z"
              fill={`color-mix(in oklab, ${ghostLine} ${onBench ? 18 : 45}%, transparent)`}
              stroke={ghostLine}
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </svg>
          <span
            className={cn(
              "relative mt-1 grid h-5 w-5 place-items-center",
              ui.radius.full,
              ui.surface.inkPlain,
            )}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </span>
        </span>
      }
    />
  );
}
