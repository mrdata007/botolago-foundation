import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position, SquadPlayer } from "@/types/fantasy";
import { FplPill } from "./primitives";

const ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

export interface SquadListColumn {
  key: string;
  label: ReactNode;
  render: (player: FantasyPlayer, squadPlayer: SquadPlayer) => ReactNode;
  className?: string;
}

/**
 * "List" view reconstructed from the reference: an ink position pill per
 * group ("Goalkeepers", "Defenders"…) and one row per player with the info
 * glyph, kit, name + club and right-aligned numeric columns. The bench is
 * listed last under "Substitutes".
 */
export function SquadListTable({
  squad,
  players,
  clubs,
  columns,
  onRowClick,
  onInfo,
  className,
}: {
  squad: SquadPlayer[];
  players: FantasyPlayer[];
  clubs: Club[];
  columns: SquadListColumn[];
  onRowClick?: (playerId: string) => void;
  onInfo?: (playerId: string) => void;
  className?: string;
}) {
  const { t, tr } = useI18n();
  const playerOf = (id: string) => players.find((p) => p.id === id);
  const clubOf = (id: string) => clubs.find((c) => c.id === id);
  const starters = squad.filter((s) => s.slot < 12);
  const bench = squad.filter((s) => s.slot >= 12).sort((a, b) => a.slot - b.slot);

  const groups: Array<{ label: string; rows: SquadPlayer[] }> = ORDER.map((position) => ({
    label: t(`fpl.group.${position}` as never),
    rows: starters
      .filter((s) => playerOf(s.playerId)?.position === position)
      .sort((a, b) => a.slot - b.slot),
  })).filter((group) => group.rows.length > 0);
  if (bench.length > 0) groups.push({ label: t("fpl.substitutes"), rows: bench });

  const gridTemplate = `minmax(0,1fr) ${columns.map(() => "56px").join(" ")}`;

  return (
    <div className={cn("bg-white", className)}>
      <div
        className="grid items-center gap-1 border-b border-[color:var(--fpl-grey)] px-3 py-2"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <span className="text-[12px] font-bold text-[color:var(--fpl-grey-text)]">
          {t("fpl.player")}
        </span>
        {columns.map((column) => (
          <span
            key={column.key}
            className="text-end text-[11px] font-bold leading-tight text-[color:var(--fpl-grey-text)]"
          >
            {column.label}
          </span>
        ))}
      </div>
      {groups.map((group) => (
        <section key={group.label}>
          <div className="px-3 pt-3">
            <FplPill>{group.label}</FplPill>
          </div>
          <ul className="mt-1">
            {group.rows.map((squadPlayer) => {
              const player = playerOf(squadPlayer.playerId);
              if (!player) return null;
              const club = clubOf(player.clubId);
              const kit = getKitForClub(club, player.kitPattern);
              return (
                <li
                  key={squadPlayer.playerId}
                  className="grid items-center gap-1 border-b border-[color:var(--fpl-grey)] px-3"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onInfo?.(player.id)}
                      aria-label={`${t("fpl.player_info")} ${tr(player.name)}`}
                      className="grid h-6 w-6 shrink-0 place-items-center text-[color:var(--fpl-grey-text)]"
                    >
                      <Info className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRowClick?.(player.id)}
                      className="flex min-h-14 min-w-0 flex-1 items-center gap-2 py-2 text-start"
                    >
                      <JerseyVisual kit={kit} size={28} imageUrl={player.jerseyImageUrl} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 truncate text-[14px] font-extrabold text-foreground">
                          {tr(player.name)}
                          {squadPlayer.isCaptain ? (
                            <span className="grid h-4 w-4 place-items-center rounded-full bg-black text-[9px] text-white">
                              C
                            </span>
                          ) : squadPlayer.isViceCaptain ? (
                            <span className="grid h-4 w-4 place-items-center rounded-full bg-black text-[9px] text-white">
                              V
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-[11px] text-[color:var(--fpl-grey-text)]">
                          {club ? tr(club.shortName) : ""}
                        </span>
                      </span>
                    </button>
                  </div>
                  {columns.map((column) => (
                    <span
                      key={column.key}
                      className={cn(
                        "fpl-tabular text-end text-[13px] text-foreground",
                        column.className,
                      )}
                    >
                      {column.render(player, squadPlayer)}
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
