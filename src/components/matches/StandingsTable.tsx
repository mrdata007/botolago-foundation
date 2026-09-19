import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ClubCrest } from "@/components/common/ClubCrest";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Club, TableRow } from "@/types/domain";

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
          "inline-flex items-center gap-0.5 font-black tabular-nums transition-colors",
          active ? "text-[color:var(--brand-primary)]" : "text-[color:var(--text-muted)]",
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
    <div className="overflow-hidden rounded-[var(--radius-card-lg)] border border-[var(--border-subtle)] bg-[color:var(--background-elevated)] shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] text-sm">
          <thead className="bg-[color:var(--surface-hover)] text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
            <tr>
              <th scope="col" aria-label={t("matches.table.rank")} className="px-3 py-2 text-start">
                {headerButton("position", "#", t("matches.table.rank"))}
              </th>
              <th scope="col" className="px-3 py-2 text-start">
                {t("matches.table.team")}
              </th>
              <th scope="col" className="px-2 py-2 text-center">
                {headerButton("played", t("matches.table.played_short"), t("matches.table.played"))}
              </th>
              <th scope="col" className="hidden px-2 py-2 text-center sm:table-cell">
                {headerButton("won", t("matches.table.won_short"), t("matches.table.won"))}
              </th>
              <th scope="col" className="hidden px-2 py-2 text-center sm:table-cell">
                {headerButton("drawn", t("matches.table.drawn_short"), t("matches.table.drawn"))}
              </th>
              <th scope="col" className="hidden px-2 py-2 text-center sm:table-cell">
                {headerButton("lost", t("matches.table.lost_short"), t("matches.table.lost"))}
              </th>
              <th scope="col" className="px-2 py-2 text-center">
                {headerButton(
                  "goalDifference",
                  t("matches.table.goal_difference_short"),
                  t("matches.table.goal_difference"),
                )}
              </th>
              <th scope="col" className="px-2 py-2 text-center">
                <span aria-hidden>{t("matches.table.form")}</span>
                <span className="sr-only">{t("matches.table.form")}</span>
              </th>
              <th scope="col" className="px-3 py-2 text-end">
                {headerButton("points", t("matches.table.points_short"), t("matches.table.points"))}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const club = clubById(row.clubId);
              if (!club) return null;
              return (
                <tr key={row.clubId} className="border-t border-[var(--border-subtle)]">
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-[color:var(--text-muted)]">
                    {row.position}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ClubCrest club={club} size="sm" />
                      <span className="truncate font-semibold text-foreground">
                        {tr(club.shortName)}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums">{row.played}</td>
                  <td className="hidden px-2 py-2 text-center tabular-nums sm:table-cell">
                    {row.won}
                  </td>
                  <td className="hidden px-2 py-2 text-center tabular-nums sm:table-cell">
                    {row.drawn}
                  </td>
                  <td className="hidden px-2 py-2 text-center tabular-nums sm:table-cell">
                    {row.lost}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums">
                    {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                  </td>
                  <td className="px-2 py-2">
                    <FormBadges form={row.form} />
                  </td>
                  <td className="px-3 py-2 text-end font-black tabular-nums text-foreground">
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

/** Last-results chips, most recent last. Uses the Fantasy palette family
 * (win/draw/loss) so match-form reads consistently with the rest of the
 * BotolaGO product. */
function FormBadges({ form }: { form: readonly ("W" | "D" | "L")[] }) {
  const { t } = useI18n();
  if (form.length === 0) {
    return <span className="text-xs text-[color:var(--text-muted)]">—</span>;
  }
  const recent = form.slice(-5);
  return (
    <div className="flex items-center justify-center gap-1" aria-hidden={false}>
      {recent.map((result, index) => {
        const label =
          result === "W"
            ? t("matches.table.form_win")
            : result === "D"
              ? t("matches.table.form_draw")
              : t("matches.table.form_loss");
        return (
          <span
            key={index}
            title={label}
            aria-label={label}
            className="grid h-4 w-4 shrink-0 place-items-center rounded-[3px] text-[8px] font-black text-[color:var(--fpl-ink-deep)]"
            style={{
              background:
                result === "W"
                  ? "var(--fpl-green)"
                  : result === "D"
                    ? "var(--fpl-grey)"
                    : "var(--fpl-pink)",
              color: result === "L" ? "white" : "var(--fpl-ink-deep)",
            }}
          >
            {result}
          </span>
        );
      })}
    </div>
  );
}
