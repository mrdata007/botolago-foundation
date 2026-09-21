import type { Club, Player } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { ClubCrest } from "./ClubCrest";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { ui } from "@/components/ui-kit";

/**
 * Player row.
 *
 * Stat-oriented and clean. Supports an optional `rank` prefix so lists
 * like "Trending players" read as a leaderboard rather than a flat list.
 *
 * Converted to the shared UI kit: the kit card surface, radii, type scale
 * and tabular figures replace the Design System V2 surface and the Tailwind
 * type ramp. The row keeps the kit's minimum row height so it stays a
 * comfortable tap target. Public props are unchanged.
 */
export function PlayerRow({
  player,
  club,
  rank,
}: {
  player: Player;
  club?: Club;
  /** 1-indexed rank rendered as a tabular prefix. */
  rank?: number;
}) {
  const { tr, t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    maximumFractionDigits: 1,
  });
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 px-3 py-2.5",
        ui.surface.card,
        ui.space.row,
        "transition-[transform,background-color] duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
        "hover:bg-[color:var(--ui-surface-sunken)] active:translate-y-px",
      )}
    >
      {typeof rank === "number" && (
        <span
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center",
            ui.radius.control,
            ui.text.micro,
            ui.text.tabular,
            "[font-weight:var(--ui-weight-hero)]",
            rank <= 3
              ? cn("bg-[color:color-mix(in_oklab,var(--ui-ink)_16%,transparent)]", ui.tone.ink)
              : cn(ui.surface.sunken, ui.tone.muted),
          )}
          aria-hidden
        >
          {rank}
        </span>
      )}
      {club && <ClubCrest club={club} size="sm" />}
      <div className="min-w-0 flex-1">
        <div className={cn("truncate", ui.text.bodyStrong, ui.tone.default)}>{tr(player.name)}</div>
        <div className={cn("truncate", ui.text.micro, ui.tone.muted)}>
          {t(`player.pos.${player.position}` as TranslationKey)} • {t("fantasy.form")}{" "}
          {player.form === null ? t("fantasy.stat.none") : nf.format(player.form)}
        </div>
      </div>
      <div className="shrink-0 text-end">
        <div
          className={cn(
            ui.text.body,
            ui.text.tabular,
            "[font-weight:var(--ui-weight-hero)]",
            ui.tone.default,
          )}
        >
          {nf.format(player.price)}
        </div>
        <div className={cn(ui.text.micro, ui.tone.muted)}>{t("fantasy.price")}</div>
      </div>
    </div>
  );
}
