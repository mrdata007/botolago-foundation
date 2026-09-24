import { Link } from "@tanstack/react-router";
import { ClubCrest } from "@/components/common/ClubCrest";
import { clubLabel } from "@/components/fantasy/club-identity";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle } from "@/lib/club-palette";
import { leagueZone, type LeagueTableRow, type LeagueZone } from "@/lib/league-table";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import { formatGoalDifference } from "./head-to-head";
import { zoneLabel } from "./standings-copy";

/**
 * What the table shows: the season (`overall`), home or away matches only,
 * or the season with the last five results in place of the figures (`form`).
 */
export type StandingsView = "overall" | "home" | "away" | "form";

/** The zone colours: a 4px bar at the row's start edge, keyed in the legend. */
const ZONE_BAR: Record<LeagueZone, string> = {
  champions_league: "bg-[color:var(--ui-ink-fg)]",
  confederation_cup: "bg-[color:var(--ui-positive)]",
  relegation: "bg-[color:var(--ui-negative)]",
};

const ZONES: readonly LeagueZone[] = ["champions_league", "confederation_cup", "relegation"];

/**
 * The league table (A-Standings, "Classique"): one card, a sunken head in
 * label type, every club on a row with its crest, and every figure on the
 * tabular stat ramp — played, won, drawn, lost, goal difference, points.
 * The African places and the drop are a 4px bar on the row's start edge
 * (named for assistive tech inside the rank cell), keyed by `StandingsLegend`;
 * a home or away table qualifies for nothing, so it has no bars.
 *
 * Built for 390px without a sideways scroll: the club column takes what the
 * figures leave and a long name wraps between words, onto two lines at most
 * in practice. Under 360px the won/drawn/lost columns step out — played,
 * goal difference and points stay.
 *
 * Each club's name opens its club page. `highlightClubId` tints the reader's
 * own club in its colours; `currentClubId` tints the club whose page the
 * table sits on and marks its row as the current one.
 */
export function StandingsTable({
  rows,
  clubById,
  view,
  caption,
  highlightClubId,
  currentClubId,
}: {
  rows: readonly LeagueTableRow[];
  clubById: (id: string) => Club | undefined;
  view: StandingsView;
  caption: string;
  highlightClubId?: string;
  currentClubId?: string;
}) {
  const { t, tr } = useI18n();
  const zoned = view === "overall" || view === "form";
  const figures = view !== "form";
  // The head row's type is `ui.text.label` on the `thead`: 12px, 800, uppercase.
  const head = "py-2";
  const narrow = "max-[359px]:hidden";

  const short = (abbr: string, full: string) => (
    <>
      <span aria-hidden>{abbr}</span>
      <span className="sr-only">{full}</span>
    </>
  );

  return (
    <div className={cn("overflow-hidden", ui.surface.card)}>
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="w-9" />
          <col />
          {figures ? (
            <>
              <col className="w-6" />
              <col className={cn("w-[1.375rem]", narrow)} />
              <col className={cn("w-[1.375rem]", narrow)} />
              <col className={cn("w-[1.375rem]", narrow)} />
              <col className="w-9" />
            </>
          ) : (
            <col className="w-[6.5rem]" />
          )}
          <col className="w-11" />
        </colgroup>
        {/* `ui.text.label` letter-spaces Latin only (BG-0069). */}
        <thead className={cn(ui.surface.sunken, ui.text.label, ui.tone.muted)}>
          <tr>
            <th scope="col" className={cn(head, "ps-3 text-center")}>
              {short("#", t("matches.table.rank"))}
            </th>
            <th scope="col" className={cn(head, "ps-1 text-start")}>
              {t("matches.table.team")}
            </th>
            {figures ? (
              <>
                <th scope="col" className={cn(head, "text-center")}>
                  {short(t("matches.table.played_short"), t("matches.table.played"))}
                </th>
                <th scope="col" className={cn(head, "text-center", narrow)}>
                  {short(t("matches.table.won_short"), t("matches.table.won"))}
                </th>
                <th scope="col" className={cn(head, "text-center", narrow)}>
                  {short(t("matches.table.drawn_short"), t("matches.table.drawn"))}
                </th>
                <th scope="col" className={cn(head, "text-center", narrow)}>
                  {short(t("matches.table.lost_short"), t("matches.table.lost"))}
                </th>
                <th scope="col" className={cn(head, "text-center")}>
                  {short(
                    t("matches.table.goal_difference_short"),
                    t("matches.table.goal_difference"),
                  )}
                </th>
              </>
            ) : (
              <th scope="col" className={cn(head, "text-center")}>
                {t("matches.table.form")}
              </th>
            )}
            <th scope="col" className={cn(head, "pe-3 text-end")}>
              {short(t("matches.table.points_short"), t("matches.table.points"))}
            </th>
          </tr>
        </thead>
        <tbody className={ui.text.secondary}>
          {rows.map((row) => {
            const club = clubById(row.clubId);
            if (!club) return null;
            const zone = zoned ? leagueZone(row.position, rows.length) : null;
            const mine = row.clubId === highlightClubId;
            const current = row.clubId === currentClubId;
            const tint = mine || current ? clubStyle(club) : undefined;
            return (
              <tr
                key={row.clubId}
                data-club={tint?.["data-club"]}
                style={tint?.style}
                aria-current={current ? "true" : undefined}
                className={cn(ui.rule.blockStart, tint && ui.club.tint)}
              >
                <td
                  className={cn("relative py-2.5 pe-1 ps-3 text-center", ui.stat.sm, ui.tone.muted)}
                >
                  {zone ? (
                    <span
                      aria-hidden
                      className={cn("absolute inset-y-0 start-0 w-1", ZONE_BAR[zone])}
                    />
                  ) : null}
                  {row.position}
                  {zone ? <span className="sr-only">, {zoneLabel(zone, t)}</span> : null}
                </td>
                <td className="py-0 pe-2 ps-1">
                  {/* The name is the link to the club page, at the 44px tap
                      floor. The link carries the cell's padding, so the row
                      is exactly as tall as without it. */}
                  <Link
                    to="/clubs/$clubId"
                    params={{ clubId: club.id }}
                    className={cn(
                      "-ms-1 flex min-h-[var(--ui-tap-min)] min-w-0 items-center gap-2 py-2.5 ps-1",
                      ui.radius.control,
                      "transition-colors hover:bg-[color:var(--ui-surface-sunken)]",
                      ui.focus,
                    )}
                  >
                    <ClubCrest club={club} size="sm" />
                    <span
                      className={cn(
                        "min-w-0 [font-weight:var(--ui-weight-strong)] leading-[var(--ui-leading-flat)]",
                        ui.tone.default,
                      )}
                    >
                      {clubLabel(club, tr)}
                      {mine ? <span className="sr-only"> ({t("standings.your_club")})</span> : null}
                    </span>
                  </Link>
                </td>
                {figures ? (
                  <>
                    <td className={cn("text-center", ui.stat.sm)}>{row.played}</td>
                    <td className={cn("text-center", ui.stat.sm, narrow)}>{row.won}</td>
                    <td className={cn("text-center", ui.stat.sm, narrow)}>{row.drawn}</td>
                    <td className={cn("text-center", ui.stat.sm, narrow)}>{row.lost}</td>
                    <td className={cn("text-center", ui.stat.sm)}>
                      <bdi>{formatGoalDifference(row.goalDifference)}</bdi>
                    </td>
                  </>
                ) : (
                  <td className="text-center">
                    <FormChips form={row.form} />
                  </td>
                )}
                <td className={cn("pe-3 text-end", ui.stat.md, ui.tone.default)}>{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The key to the zone bars, under an overall table. */
export function StandingsLegend({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <ul
      aria-label={t("standings.legend")}
      className={cn("flex flex-col gap-2 px-1", ui.text.meta, ui.tone.muted, className)}
    >
      {ZONES.map((zone) => (
        <li key={zone} className="flex items-center gap-2.5">
          <span aria-hidden className={cn("h-4 w-1 shrink-0", ui.radius.full, ZONE_BAR[zone])} />
          {zoneLabel(zone, t)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Last results, most recent last: V / N / D in French, ف / ت / خ in Arabic —
 * the translated letter, where the table used to print the data's raw
 * W / D / L in both languages. A win and a loss are the status fills with
 * THEIR foregrounds (`--ui-on-positive` / `--ui-on-negative`, which flip
 * between the themes: white on the negative fill measured 2.31:1 in dark); a
 * draw is the sunken chip. Each chip is named for assistive tech ("Victoire").
 *
 * Shared with the match page's "Face à face" table.
 */
export function FormChips({
  form,
  className,
}: {
  form: readonly ("W" | "D" | "L")[];
  className?: string;
}) {
  const { t } = useI18n();
  if (form.length === 0) {
    return <span className={cn(ui.text.meta, ui.tone.muted)}>—</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {form.slice(-5).map((result, index) => {
        const label =
          result === "W"
            ? t("matches.table.form_win")
            : result === "D"
              ? t("matches.table.form_draw")
              : t("matches.table.form_loss");
        const letter =
          result === "W"
            ? t("matches.table.form_win_short")
            : result === "D"
              ? t("matches.table.form_draw_short")
              : t("matches.table.form_loss_short");
        return (
          <span
            key={index}
            role="img"
            title={label}
            aria-label={label}
            className={cn(
              "grid h-4.5 w-4.5 shrink-0 place-items-center",
              ui.radius.tight,
              ui.text.micro,
              "[font-weight:var(--ui-weight-heavy)]",
              result === "W" && "bg-[color:var(--ui-positive)] text-[color:var(--ui-on-positive)]",
              result === "D" && cn(ui.surface.sunken, ui.tone.muted),
              result === "L" && "bg-[color:var(--ui-negative)] text-[color:var(--ui-on-negative)]",
            )}
          >
            <span aria-hidden>{letter}</span>
          </span>
        );
      })}
    </span>
  );
}
