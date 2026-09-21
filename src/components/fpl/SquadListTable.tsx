import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { ui, UiPill } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position, SquadPlayer } from "@/types/fantasy";

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
 * glyph, kit, name + club and numeric columns on the inline-end edge. The
 * bench is listed last under "Substitutes".
 *
 * The figures use the stat ramp, so the columns line up digit for digit in
 * French and Arabic alike.
 */
export function SquadListTable({
  squad,
  players,
  clubs,
  columns,
  onRowClick,
  onInfo,
  renderDetail,
  className,
}: {
  squad: SquadPlayer[];
  players: FantasyPlayer[];
  clubs: Club[];
  columns: SquadListColumn[];
  onRowClick?: (playerId: string) => void;
  onInfo?: (playerId: string) => void;
  /**
   * BG-0075 — optional lines rendered under a player's row, spanning the full
   * width. The points screen uses it for the scoring events behind the total.
   * Return null for a player with nothing to add and no extra row is emitted.
   */
  renderDetail?: (player: FantasyPlayer, squadPlayer: SquadPlayer) => ReactNode;
  className?: string;
}) {
  const { t, tr } = useI18n();
  const playerOf = (id: string) => players.find((p) => p.id === id);
  const clubOf = (id: string) => clubs.find((c) => c.id === id);
  const starters = squad.filter((s) => s.slot < 12);
  const bench = squad.filter((s) => s.slot >= 12).sort((a, b) => a.slot - b.slot);
  const groupLabel = (position: Position) =>
    position === "GK"
      ? t("fpl.group.GK")
      : position === "DEF"
        ? t("fpl.group.DEF")
        : position === "MID"
          ? t("fpl.group.MID")
          : t("fpl.group.FWD");

  const groups: Array<{ label: string; rows: SquadPlayer[] }> = ORDER.map((position) => ({
    label: groupLabel(position),
    rows: starters
      .filter((s) => playerOf(s.playerId)?.position === position)
      .sort((a, b) => a.slot - b.slot),
  })).filter((group) => group.rows.length > 0);
  if (bench.length > 0) groups.push({ label: t("fpl.substitutes"), rows: bench });

  /**
   * Numeric tracks have a floor, not a fixed width: a fixed 56px track sliced
   * "Sélectionné" (66px) off at the viewport edge, and a column head that
   * cannot be read is not a column head. `auto` lets a long single-word head
   * widen its track — the name column is the `1fr` that gives the space back.
   */
  const numericTrack = columns.length > 3 ? "minmax(46px,auto)" : "minmax(56px,auto)";
  const gridTemplate = `minmax(0,1fr) ${columns.map(() => numericTrack).join(" ")}`;
  const marker = cn(
    "grid h-4 w-4 shrink-0 place-items-center",
    ui.radius.full,
    ui.surface.inkPlain,
    ui.text.micro,
    "[font-weight:var(--ui-weight-hero)]",
  );

  return (
    <div className={cn(ui.surface.bar, className)}>
      <div
        className={cn("grid items-center gap-1 px-3 py-2", ui.rule.block)}
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <span className={cn(ui.text.label, ui.tone.muted)}>{t("fpl.player")}</span>
        {/*
          The numeric heads step down to `ui.text.micro` rather than
          `ui.text.label`. Uppercase plus `tracking-wide` makes "SÉLECTION"
          about 78px wide, and the column it names is 56px at 390px — the head
          was being clipped by the viewport edge. Micro is a ramp step, not a
          new number; see the kit request in the BG-0093 report.
        */}
        {columns.map((column) => (
          <span
            key={column.key}
            className={cn(
              "text-end",
              ui.text.micro,
              "[font-weight:var(--ui-weight-heavy)]",
              ui.tone.muted,
            )}
          >
            {column.label}
          </span>
        ))}
      </div>
      {groups.map((group) => (
        <section key={group.label}>
          <div className="px-3 pt-3">
            <UiPill>{group.label}</UiPill>
          </div>
          <ul className="mt-1">
            {group.rows.map((squadPlayer) => {
              const player = playerOf(squadPlayer.playerId);
              if (!player) return null;
              const club = clubOf(player.clubId);
              const kit = getKitForClub(club, player.kitPattern);
              const detail = renderDetail?.(player, squadPlayer) ?? null;
              return (
                <li key={squadPlayer.playerId} className={cn("px-3", ui.rule.block)}>
                  <div
                    className="grid items-center gap-1"
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    <div className="flex min-w-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onInfo?.(player.id)}
                        aria-label={`${t("fpl.player_info")} ${tr(player.name)}`}
                        className={cn(
                          "grid shrink-0 place-items-center",
                          ui.space.tap,
                          ui.radius.full,
                          ui.focus,
                          ui.tone.muted,
                        )}
                      >
                        <Info className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRowClick?.(player.id)}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-2 py-2 text-start",
                          ui.space.row,
                          ui.focus,
                        )}
                      >
                        <JerseyVisual kit={kit} size={28} imageUrl={player.jerseyImageUrl} />
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-1">
                            <span
                              className={cn(
                                "min-w-0 truncate",
                                ui.text.secondary,
                                "[font-weight:var(--ui-weight-heavy)]",
                                ui.tone.default,
                              )}
                            >
                              {tr(player.name)}
                            </span>
                            {squadPlayer.isCaptain ? (
                              <span className={marker}>{t("fpl.captain_short")}</span>
                            ) : squadPlayer.isViceCaptain ? (
                              <span className={marker}>{t("fpl.vice_short")}</span>
                            ) : null}
                          </span>
                          <span className={cn("block truncate", ui.text.micro, ui.tone.muted)}>
                            {club ? tr(club.shortName) : ""}
                          </span>
                        </span>
                      </button>
                    </div>
                    {columns.map((column) => (
                      <span
                        key={column.key}
                        className={cn("text-end", ui.stat.sm, ui.tone.default, column.className)}
                      >
                        {column.render(player, squadPlayer)}
                      </span>
                    ))}
                  </div>
                  {detail}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
