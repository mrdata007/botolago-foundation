import type { FantasyPlayer } from "@/types/fantasy";
import type { Club } from "@/types/domain";
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

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1 text-center transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] motion-safe:hover:-translate-y-0.5",
        onClick && "cursor-pointer",
        className,
      )}
      aria-label={tr(player.name)}
    >
      <div className="relative">
        <JerseyVisual
          kit={kit}
          size={jerseySize}
          imageUrl={player.jerseyImageUrl}
          ariaLabel={club ? tr(club.shortName) : undefined}
        />
        {/* Captain / Vice — top-end shoulder */}
        {captain && (
          <span
            className="absolute -top-1 -end-1 grid h-4 w-4 place-items-center rounded-full bg-[color:var(--brand-accent)] text-[9px] font-black text-white ring-2 ring-white shadow"
            aria-label={t("fantasy.captain_full")}
            title={t("fantasy.captain_full")}
          >
            {t("fantasy.captain")}
          </span>
        )}
        {!captain && vice && (
          <span
            className="absolute -top-1 -end-1 grid h-4 w-4 place-items-center rounded-full bg-white text-[9px] font-black text-[color:var(--brand-primary)] ring-2 ring-[color:var(--brand-primary)] shadow"
            aria-label={t("fantasy.vice_full")}
            title={t("fantasy.vice_full")}
          >
            {t("fantasy.vice")}
          </span>
        )}
        {/* Status — bottom-start shoulder, attached to jersey */}
        {status !== "available" && (
          <span
            className={cn(
              "absolute -bottom-0.5 -start-1 grid h-4 w-4 place-items-center rounded-full text-[9px] font-black text-white ring-2 ring-white shadow",
              status === "injured" && "bg-red-500",
              status === "doubtful" && "bg-amber-500",
              status === "suspended" && "bg-neutral-800",
            )}
            aria-label={t(`player.status.${status}` as TranslationKey)}
            title={t(`player.status.${status}` as TranslationKey)}
          >
            {status === "injured" ? "×" : status === "doubtful" ? "?" : "!"}
          </span>
        )}
      </div>
      <PlayerNameplate
        name={shortName}
        metric={metric ?? (player.expectedPoints != null ? String(player.expectedPoints) : undefined)}
        fixture={fixtureText}
      />
      {metricLabel && <span className="sr-only">{metricLabel}</span>}
    </button>
  );
}
