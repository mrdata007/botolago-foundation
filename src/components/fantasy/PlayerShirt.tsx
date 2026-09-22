import type { FantasyPlayer } from "@/types/fantasy";
import type { Club } from "@/types/domain";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";
import { getKitForClub } from "@/lib/kits";
import { JerseyVisual } from "./JerseyVisual";
import { PlayerNameplate } from "./PlayerNameplate";

interface Props {
  player: FantasyPlayer;
  club?: Club;
  metric?: string;
  metricLabel?: string;
  captain?: boolean;
  vice?: boolean;
  onClick?: () => void;
  className?: string;
  showFixture?: boolean;
  nextOpponentClub?: Club;
  compact?: boolean;
}

/**
 * A shirt with its nameplate, plus the armband and availability markers.
 *
 * The three status dots were `bg-red-500` / `bg-amber-500` / `bg-neutral-800`
 * — a palette of their own, invisible to the theme. They now use the same
 * negative / caution / ink tokens the rest of Fantasy states with, each
 * paired with the foreground the design system guarantees on it.
 *
 * That last clause was still being done by hand, and by hand it can only be
 * right in one theme. The injured dot read `--ui-on-ink-plain` (near-white) on
 * a `--ui-negative` fill; `--ui-negative` inverts across the themes — a
 * mid-tone in light, a light tint in dark — so one foreground cannot serve
 * both, and white-on-negative is the exact pairing DESIGN_SYSTEM_V2 §2.3
 * records at 2.31:1 in dark. The doubtful dot picked `--ui-ink-deep` on
 * `--ui-caution` the same way. Both now take `ui.tone.onNegative` /
 * `ui.tone.onCaution` — the foregrounds the kit guarantees ON those fills,
 * which flip with them. Never pick one of these yourself.
 */
export function PlayerShirt({
  player,
  club,
  metric,
  metricLabel,
  captain,
  vice,
  onClick,
  className,
  showFixture,
  nextOpponentClub,
  compact,
}: Props) {
  const { tr, t } = useI18n();
  const shortName = tr(player.name).split(" ").slice(-1)[0];
  const status = player.status;
  const kit = getKitForClub(club, player.kitPattern);
  const jerseySize = compact ? 40 : 46;

  const fixtureText =
    showFixture && nextOpponentClub
      ? `${nextOpponentClub.crestPlaceholder} ${player.nextIsHome ? "(D)" : "(E)"}`
      : undefined;

  const statusLabel = status !== "available" ? t(`player.status.${status}` as TranslationKey) : "";
  const roleLabel = captain
    ? `, ${t("fantasy.captain_full")}`
    : vice
      ? `, ${t("fantasy.vice_full")}`
      : "";
  const fullAria = `${tr(player.name)}${club ? `, ${tr(club.shortName)}` : ""}${roleLabel}${statusLabel ? `, ${statusLabel}` : ""}`;

  const markerBase = cn(
    "absolute grid h-5 w-5 place-items-center",
    ui.radius.full,
    ui.text.micro,
    "[font-weight:var(--ui-weight-hero)] ring-2 ring-[color:var(--ui-on-ink-plain)]",
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full flex-col items-center gap-1 px-1 py-1 text-center transition-transform motion-safe:hover:-translate-y-0.5",
        ui.radius.control,
        ui.focus,
        onClick && "cursor-pointer",
        className,
      )}
      aria-label={fullAria}
    >
      <div className="relative pt-1">
        <JerseyVisual
          kit={kit}
          size={jerseySize}
          imageUrl={player.jerseyImageUrl}
          ariaLabel={club ? tr(club.shortName) : undefined}
          selected={captain}
        />
        {captain && (
          <span
            className={cn(markerBase, "-top-1 -end-1", ui.surface.ink)}
            aria-hidden
            title={t("fantasy.captain_full")}
          >
            {t("fantasy.captain")}
          </span>
        )}
        {!captain && vice && (
          <span
            className={cn(markerBase, "-top-1 -end-1", ui.surface.inkPlain)}
            aria-hidden
            title={t("fantasy.vice_full")}
          >
            {t("fantasy.vice")}
          </span>
        )}
        {status !== "available" && (
          <span
            className={cn(
              markerBase,
              "-bottom-0.5 -start-1",
              status === "injured" && cn("bg-[color:var(--ui-negative)]", ui.tone.onNegative),
              status === "doubtful" && cn("bg-[color:var(--ui-caution)]", ui.tone.onCaution),
              status === "suspended" && ui.surface.inkPlain,
            )}
            aria-hidden
            title={statusLabel}
          >
            {status === "injured" ? "×" : status === "doubtful" ? "?" : "!"}
          </span>
        )}
      </div>
      <PlayerNameplate
        name={shortName}
        metric={
          metric ?? (player.expectedPoints != null ? String(player.expectedPoints) : undefined)
        }
        fixture={fixtureText}
        emphasize={captain}
      />
      {metricLabel && <span className="sr-only">{metricLabel}</span>}
    </button>
  );
}
