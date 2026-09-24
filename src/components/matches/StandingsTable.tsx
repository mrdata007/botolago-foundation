import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ClubCrest } from "@/components/common/ClubCrest";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Club, TableRow } from "@/types/domain";
import { ui } from "@/components/ui-kit";
import { formatGoalDifference } from "./head-to-head";

export type SortKey =
  | "position"
  | "played"
  | "won"
  | "drawn"
  | "lost"
  | "goalDifference"
  | "points";

/** Pure, side-effect-free sort used by the table — kept exported and testable
 * so the ordering rules can be verified without rendering. */
export function sortStandings(
  rows: readonly TableRow[],
  sortKey: SortKey,
  direction: "asc" | "desc",
): TableRow[] {
  const copy = [...rows];
  const dir = direction === "asc" ? 1 : -1;
  copy.sort((a, b) => {
    const diff = (a[sortKey] - b[sortKey]) * dir;
    return diff !== 0 ? diff : a.position - b.position;
  });
  return copy;
}

/**
 * Full sortable standings table, backed exclusively by the season's real
 * `StandingRowDto` rows (played/won/drawn/lost/goal difference/points/form).
 * Sorting is a pure client-side re-order of already-fetched data — no
 * numbers are invented or recomputed.
 *
 * On the kit (Option A): a 14px card, the sunken head in label type, every
 * figure on the tabular stat ramp, and the form as `FormChips`.
 */
export function StandingsTable({
  rows,
  clubById,
}: {
  rows: readonly TableRow[];
  clubById: (id: string) => Club | undefined;
}) {
  const { t, tr } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => sortStandings(rows, sortKey, direction), [rows, sortKey, direction]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    // Points/played/etc. read naturally best-first; rank/position ascending.
    setDirection(key === "position" ? "asc" : "desc");
  };

  /** `fullLabel` is always an already-resolved translation string, passed in
   * by the caller from a literal key lookup — kept that way so every
   * translation lookup here stays statically visible to the i18n audit. */
  const headerButton = (key: SortKey, short: string, fullLabel: string) => {
    const active = sortKey === key;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        aria-label={t("matches.table.sort_by").replace("{column}", fullLabel)}
        className={cn(
          // These were 6–24px wide by 15px tall: the column headers are the
          // only way to sort the table and they were far under the 44px tap
          // floor the rest of the product holds to. The table already lives
          // in an `overflow-x-auto` scroller, so widening the hit areas costs
          // nothing at 390px. Their cells take only 2px a side on top of the
          // 44px: at 8px a side the five figure columns alone came to 300px
          // and pushed the 640px desktop column into a scroll that hid the
          // points (17px of it in Arabic).
          "inline-flex items-center justify-center gap-0.5 transition-colors",
          ui.space.tap,
          ui.radius.full,
          ui.focus,
          "hover:bg-[color:var(--ui-surface)]",
          active ? ui.tone.ink : ui.tone.muted,
        )}
      >
        <span aria-hidden>{short}</span>
        <span className="sr-only">{fullLabel}</span>
        {active &&
          (direction === "asc" ? (
            <ArrowUp className="h-3 w-3" aria-hidden />
          ) : (
            <ArrowDown className="h-3 w-3" aria-hidden />
          ))}
      </button>
    );
  };

  return (
    <div className={cn("overflow-hidden", ui.surface.card)}>
      <div className="overflow-x-auto">
        <table className={cn("w-full min-w-[26rem]", ui.text.secondary)}>
          {/* `ui.text.label` letter-spaces Latin only (BG-0069). */}
          <thead className={cn(ui.surface.sunken, ui.text.label, ui.tone.muted)}>
            <tr>
              <th scope="col" aria-label={t("matches.table.rank")} className="px-3 py-1 text-start">
                {headerButton("position", "#", t("matches.table.rank"))}
              </th>
              <th scope="col" className="px-3 py-1 text-start">
                {t("matches.table.team")}
              </th>
              <th scope="col" className="px-0.5 py-1 text-center">
                {headerButton("played", t("matches.table.played_short"), t("matches.table.played"))}
              </th>
              <th scope="col" className="hidden px-0.5 py-1 text-center sm:table-cell">
                {headerButton("won", t("matches.table.won_short"), t("matches.table.won"))}
              </th>
              <th scope="col" className="hidden px-0.5 py-1 text-center sm:table-cell">
                {headerButton("drawn", t("matches.table.drawn_short"), t("matches.table.drawn"))}
              </th>
              <th scope="col" className="hidden px-0.5 py-1 text-center sm:table-cell">
                {headerButton("lost", t("matches.table.lost_short"), t("matches.table.lost"))}
              </th>
              <th scope="col" className="px-0.5 py-1 text-center">
                {headerButton(
                  "goalDifference",
                  t("matches.table.goal_difference_short"),
                  t("matches.table.goal_difference"),
                )}
              </th>
              <th scope="col" className="px-2 py-1 text-center">
                {t("matches.table.form")}
              </th>
              <th scope="col" className="px-3 py-1 text-end">
                {headerButton("points", t("matches.table.points_short"), t("matches.table.points"))}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const club = clubById(row.clubId);
              if (!club) return null;
              return (
                <tr key={row.clubId} className={ui.rule.blockStart}>
                  <td className={cn("px-3 py-2", ui.stat.sm, ui.tone.muted)}>{row.position}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ClubCrest club={club} size="sm" />
                      <span
                        className={cn(
                          "truncate [font-weight:var(--ui-weight-strong)]",
                          ui.tone.default,
                        )}
                      >
                        {tr(club.shortName)}
                      </span>
                    </div>
                  </td>
                  <td className={cn("px-2 py-2 text-center", ui.stat.sm)}>{row.played}</td>
                  <td className={cn("hidden px-2 py-2 text-center sm:table-cell", ui.stat.sm)}>
                    {row.won}
                  </td>
                  <td className={cn("hidden px-2 py-2 text-center sm:table-cell", ui.stat.sm)}>
                    {row.drawn}
                  </td>
                  <td className={cn("hidden px-2 py-2 text-center sm:table-cell", ui.stat.sm)}>
                    {row.lost}
                  </td>
                  <td className={cn("px-2 py-2 text-center", ui.stat.sm)}>
                    <bdi>{formatGoalDifference(row.goalDifference)}</bdi>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <FormChips form={row.form} />
                  </td>
                  <td className={cn("px-3 py-2 text-end", ui.stat.md, ui.tone.default)}>
                    {row.points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
