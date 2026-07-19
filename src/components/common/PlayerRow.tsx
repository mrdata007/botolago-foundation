import type { Club, Player } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { ClubCrest } from "./ClubCrest";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

/**
 * Design System V2 — Player row.
 *
 * Stat-oriented and clean. Supports an optional `rank` prefix so lists
 * like "Trending players" read as a leaderboard rather than a flat list.
 * Uses surface-2 so pressing feels tactile.
 */
export function PlayerRow({
  player,
  club,
  rank,
}: {
  player: Player;
  club?: Club;
  /** 1-indexed rank rendered as a monospace prefix. */
  rank?: number;
}) {
  const { tr, t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    maximumFractionDigits: 1,
  });
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-card)] px-3 py-2.5",
        "border border-[var(--border-subtle)] bg-[color:var(--surface)]",
        "transition-[transform,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
        "hover:bg-[color:var(--surface-hover)] hover:shadow-card active:translate-y-px",
      )}
    >
      {typeof rank === "number" && (
        <span
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-black tabular-nums",
            rank <= 3
              ? "bg-[color:color-mix(in_oklab,var(--brand-accent)_16%,transparent)] text-[color:var(--brand-accent)]"
              : "bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)]",
          )}
          aria-hidden
        >
          {rank}
        </span>
      )}
      {club && <ClubCrest club={club} size="sm" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-foreground">{tr(player.name)}</div>
        <div className="truncate text-[11px] text-[color:var(--text-muted)]">
          {t(`player.pos.${player.position}` as TranslationKey)} • {t("fantasy.form")}{" "}
          {nf.format(player.form)}
        </div>
      </div>
      <div className="text-end">
        <div className="text-sm font-black tabular-nums text-foreground">
          {nf.format(player.price)}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">
          {t("fantasy.price")}
        </div>
      </div>
    </div>
  );
}
