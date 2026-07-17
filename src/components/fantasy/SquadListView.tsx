import type { FantasyPlayer, SquadPlayer, Position } from "@/types/fantasy";
import type { Club } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { getKitForClub } from "@/lib/kits";
import { JerseyVisual } from "./JerseyVisual";
import type { TranslationKey } from "@/i18n/dictionaries";

interface Props {
  squad: SquadPlayer[];
  players: FantasyPlayer[];
  clubs: Club[];
  /** Optional per-player metric override (e.g. current gameweek points). */
  metricFor?: (playerId: string) => string | number | undefined;
  metricLabel?: string;
  onPlayerClick?: (playerId: string) => void;
  className?: string;
}

const ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

/**
 * Grouped-by-position list of all 15 squad players. Reflects the same
 * captain/vice/status/fixture/points information as the pitch view.
 */
export function SquadListView({ squad, players, clubs, metricFor, metricLabel, onPlayerClick, className }: Props) {
  const { t, tr } = useI18n();
  const playerOf = (id: string) => players.find((p) => p.id === id);
  const clubOf = (cid: string) => clubs.find((c) => c.id === cid);

  const groups = ORDER.map((pos) => ({
    pos,
    rows: squad
      .map((s) => ({ s, p: playerOf(s.playerId) }))
      .filter((x): x is { s: SquadPlayer; p: FantasyPlayer } => !!x.p && x.p.position === pos)
      .sort((a, b) => a.s.slot - b.s.slot),
  }));

  return (
    <div className={cn("grid gap-3", className)}>
      {groups.map(({ pos, rows }) => (
        <section key={pos}>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <span className="rounded bg-[color:var(--brand-primary)] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
              {t(`player.pos.${pos}` as TranslationKey)}
            </span>
            <span className="text-[11px] text-muted-foreground">{rows.length}</span>
          </div>
          <ul className="grid gap-1.5">
            {rows.map(({ s, p }) => {
              const club = clubOf(p.clubId);
              const kit = getKitForClub(club, p.kitPattern);
              const isBench = s.slot >= 12;
              const metric = metricFor?.(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={onPlayerClick ? () => onPlayerClick(p.id) : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border border-black/5 bg-white/80 px-2.5 py-2 text-start shadow-sm transition-colors",
                      onPlayerClick && "hover:bg-white",
                      isBench && "bg-white/60",
                    )}
                  >
                    <div className="shrink-0">
                      <JerseyVisual kit={kit} size={32} imageUrl={p.jerseyImageUrl} ariaLabel={club ? tr(club.shortName) : undefined} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-foreground">{tr(p.name)}</span>
                        {s.isCaptain && (
                          <span className="rounded bg-[color:var(--brand-accent)] px-1 py-0.5 text-[9px] font-black text-white" aria-label={t("fantasy.captain_full")}>
                            {t("fantasy.captain")}
                          </span>
                        )}
                        {s.isViceCaptain && !s.isCaptain && (
                          <span className="rounded border border-[color:var(--brand-primary)] px-1 py-0.5 text-[9px] font-black text-[color:var(--brand-primary)]" aria-label={t("fantasy.vice_full")}>
                            {t("fantasy.vice")}
                          </span>
                        )}
                        {isBench && (
                          <span className="rounded bg-neutral-200 px-1 py-0.5 text-[9px] font-black uppercase text-neutral-700">
                            {t("fantasy.bench_short")}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{club ? tr(club.shortName) : "—"}</span>
                        {p.status !== "available" && (
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase",
                              p.status === "injured" && "bg-red-500/15 text-red-700",
                              p.status === "doubtful" && "bg-amber-500/15 text-amber-800",
                              p.status === "suspended" && "bg-neutral-800/15 text-neutral-800",
                            )}
                          >
                            {t(`player.status.${p.status}` as TranslationKey)}
                          </span>
                        )}
                        {p.nextOpponentClubId && (
                          <span className="tabular-nums">
                            {clubOf(p.nextOpponentClubId)?.crestPlaceholder} {p.nextIsHome ? "(D)" : "(E)"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-end">
                      <div className="text-base font-black tabular-nums text-foreground">
                        {metric ?? p.expectedPoints ?? "—"}
                      </div>
                      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
                        {metricLabel ?? t("fantasy.xpts")}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
