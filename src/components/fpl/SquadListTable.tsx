import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { crestStyle } from "@/components/common/club-crest-style";
import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position, SquadPlayer } from "@/types/fantasy";
import { findClub } from "./club-lookup";

const ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

export interface SquadListColumn {
  key: string;
  label: ReactNode;
  render: (player: FantasyPlayer, squadPlayer: SquadPlayer) => ReactNode;
  className?: string;
}

/**
 * The "Liste" view: the squad as rows in one card, grouped by line — a muted
 * group label ("GARDIENS", "DÉFENSEURS"… then "REMPLAÇANTS"), and per player
 * the info control, the club's shirt in a soft disc, name and club, and the
 * numeric columns at the inline end.
 *
 * Option A, from the A-Players rows: each row carries its club's 4px edge on
 * the inline start (`ui.edge.start` under the club's `clubStyle`, so it is the
 * right edge in Arabic and ≥ 3:1 on the card in both themes), and the armband
 * is the same navy / outlined disc pair the pitch uses.
 *
 * The figures use the stat ramp, so the columns line up digit for digit in
 * French and Arabic alike. Each row stays two controls — the info button and
 * the row button — side by side, never nested.
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
  const numericTrack = columns.length > 3 ? "minmax(44px,auto)" : "minmax(52px,auto)";
  const gridTemplate = `minmax(0,1fr) ${columns.map(() => numericTrack).join(" ")}`;
  const infoClass = cn(
    "grid shrink-0 place-items-center",
    ui.space.tap,
    ui.radius.full,
    ui.focus,
    ui.tone.muted,
  );
  const marker = (tone: "c" | "v") =>
    cn(
      "grid h-5 w-5 shrink-0 place-items-center",
      ui.radius.full,
      ui.text.micro,
      "[font-weight:var(--ui-weight-heavy)]",
      tone === "c"
        ? ui.surface.inkPlain
        : cn(
            "bg-[color:var(--ui-surface)]",
            ui.tone.ink,
            "ring-2 ring-inset ring-[color:var(--ui-ink)]",
          ),
    );

  return (
    <div className={cn("overflow-hidden", ui.surface.card, className)}>
      <div
        className={cn("grid items-center gap-1 pe-3 ps-4 pt-3", "pb-2", ui.rule.block)}
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <span className={cn(ui.text.label, ui.tone.muted)}>{t("fpl.player")}</span>
        {/*
          The numeric heads step down to `ui.text.micro` rather than
          `ui.text.label`. Uppercase plus `tracking-wide` makes "SÉLECTION"
          about 78px wide, and the column it names is ~52px at 390px — the
          head was being clipped by the viewport edge. Micro is a ramp step,
          not a new number; see the kit request in the BG-0093 report.
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
          <h3 className={cn("pe-3 ps-4 pb-1 pt-3", ui.text.label, ui.tone.muted)}>{group.label}</h3>
          <ul>
            {group.rows.map((squadPlayer) => {
              const player = playerOf(squadPlayer.playerId);
              if (!player) return null;
              const club = findClub(clubs, player.clubId);
              const kit = getKitForClub(club, player.kitPattern);
              const detail = renderDetail?.(player, squadPlayer) ?? null;
              const edge = club ? crestStyle(club) : null;
              return (
                <li
                  key={squadPlayer.playerId}
                  data-club={edge?.["data-club"]}
                  style={edge?.style}
                  className={cn("flex", ui.rule.block, "last:border-b-0")}
                >
                  {/* The club edge is its own 4px flex child rather than
                      `ui.edge.start`: the row also carries the hairline, and
                      `ui.rule.block` sets the border colour on every side. */}
                  <span aria-hidden className={cn("w-1 shrink-0", ui.club.edgeFill)} />
                  <div className="min-w-0 flex-1 pe-3 ps-1">
                    <div
                      className="grid items-center gap-1"
                      style={{ gridTemplateColumns: gridTemplate }}
                    >
                      <div className="flex min-w-0 items-center">
                        {onInfo ? (
                          <button
                            type="button"
                            onClick={() => onInfo(player.id)}
                            aria-label={`${t("fpl.player_info")} ${tr(player.name)}`}
                            className={infoClass}
                          >
                            <Info className="h-4 w-4" aria-hidden />
                          </button>
                        ) : (
                          // No screen passed `onInfo`, so this was a button
                          // that did nothing. Its name promises the player's
                          // information, which is the player page.
                          <Link
                            to="/fantasy/players/$playerId"
                            params={{ playerId: player.id }}
                            aria-label={`${t("fpl.player_info")} ${tr(player.name)}`}
                            className={infoClass}
                          >
                            <Info className="h-4 w-4" aria-hidden />
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => onRowClick?.(player.id)}
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-2 py-2 text-start",
                            ui.space.row,
                            ui.radius.card,
                            ui.focus,
                          )}
                        >
                          <JerseyVisual
                            kit={kit}
                            size={24}
                            variant="flat"
                            imageUrl={player.jerseyImageUrl}
                          />
                          <span className="min-w-0">
                            <span className="flex min-w-0 items-center gap-1.5">
                              {/* Two lines before an ellipsis: beside three
                                  figure columns a surname is ~60px at 390. */}
                              <span
                                className={cn(
                                  "min-w-0 break-words line-clamp-2",
                                  ui.text.meta,
                                  "[font-weight:var(--ui-weight-heavy)]",
                                  ui.tone.default,
                                )}
                              >
                                {tr(player.name)}
                              </span>
                              {squadPlayer.isCaptain ? (
                                <span className={marker("c")}>{t("fpl.captain_short")}</span>
                              ) : squadPlayer.isViceCaptain ? (
                                <span className={marker("v")}>{t("fpl.vice_short")}</span>
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
                    {detail ? <div className="ps-3">{detail}</div> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
