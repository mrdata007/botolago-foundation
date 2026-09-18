import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Info } from "lucide-react";
import { useMemo, useState } from "react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { FantasyPhaseBody } from "@/components/fpl/FantasyScreenGate";
import { FplHeader } from "@/components/fpl/primitives";
import { useFantasyScreen } from "@/components/fpl/useFantasyScreen";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";
import type { FixtureDifficulty } from "@/types/fantasy";

export const Route = createFileRoute("/fantasy/fixtures")({
  component: FdrPage,
});

/**
 * FPL-011..014 "Fixture Difficulty Rating": Team column plus one sortable
 * column per gameweek (date under the label), colour-coded opponent cells
 * with (H)/(A), horizontal scrolling for later gameweeks and the floating
 * "FDR Key" legend.
 */
function FdrPage() {
  return (
    <FantasyFrame background="white">
      <FdrBody />
    </FantasyFrame>
  );
}

const CELL: Record<number, string> = {
  1: "bg-[color:var(--fpl-fdr-1)] text-[color:var(--fpl-ink-deep)]",
  2: "bg-[color:var(--fpl-fdr-2)] text-[color:var(--fpl-ink-deep)]",
  3: "bg-[color:var(--fpl-fdr-3)] text-[color:var(--fpl-ink-deep)]",
  4: "bg-[color:var(--fpl-fdr-4)] text-white",
  5: "bg-[color:var(--fpl-fdr-5)] text-white",
};

function FdrBody() {
  const { t, tr, lang } = useI18n();
  const screen = useFantasyScreen({ needsAuth: false, needsTeam: false });
  const clubs = screen.clubs;
  const fdrQ = useQuery({
    queryKey: ["fantasy-fixture-difficulty"],
    queryFn: () => fantasyService.getFixtureDifficulty(),
    enabled: screen.phase === "ready",
    staleTime: 5 * 60_000,
  });
  const [sort, setSort] = useState<{ key: "team" | number; dir: "asc" | "desc" }>({
    key: "team",
    dir: "asc",
  });
  const [keyOpen, setKeyOpen] = useState(false);

  const rows = useMemo(() => fdrQ.data ?? [], [fdrQ.data]);
  const gameweeks = useMemo(
    () => [...new Set(rows.map((r) => r.gameweek))].sort((a, b) => a - b),
    [rows],
  );
  const byClub = useMemo(() => {
    const map = new Map<string, Map<number, FixtureDifficulty[]>>();
    for (const row of rows) {
      const clubMap = map.get(row.clubId) ?? new Map<number, FixtureDifficulty[]>();
      clubMap.set(row.gameweek, [...(clubMap.get(row.gameweek) ?? []), row]);
      map.set(row.clubId, clubMap);
    }
    return map;
  }, [rows]);
  const kickoffOf = (gw: number) =>
    rows.find((r) => r.gameweek === gw && (r as { kickoffAt?: string }).kickoffAt)?.kickoffAt;

  const sortedClubs = useMemo(() => {
    const list = clubs.filter((c) => byClub.has(c.id));
    const dirMul = sort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sort.key === "team") return tr(a.shortName).localeCompare(tr(b.shortName)) * dirMul;
      const da = byClub.get(a.id)?.get(sort.key)?.[0]?.difficulty ?? 6;
      const db = byClub.get(b.id)?.get(sort.key)?.[0]?.difficulty ?? 6;
      return (da - db) * dirMul || tr(a.shortName).localeCompare(tr(b.shortName));
    });
    return list;
  }, [clubs, byClub, sort, tr]);

  const toggleSort = (key: "team" | number) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  const codeOf = (id: string) => clubs.find((c) => c.id === id)?.crestPlaceholder ?? "";
  const dateOf = (gw: number) => {
    const iso = kickoffOf(gw);
    return iso
      ? new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
          day: "numeric",
          month: "short",
          timeZone: "Africa/Casablanca",
        }).format(new Date(iso))
      : "";
  };

  const sortGlyph = (key: "team" | number) =>
    sort.key === key ? (
      sort.dir === "asc" ? (
        <ArrowUpNarrowWide className="mx-auto h-3.5 w-3.5" aria-hidden />
      ) : (
        <ArrowDownWideNarrow className="mx-auto h-3.5 w-3.5" aria-hidden />
      )
    ) : (
      <ArrowUpNarrowWide className="mx-auto h-3.5 w-3.5 opacity-40" aria-hidden />
    );

  return (
    <>
      <FplHeader title={t("fpl.fdr")} backTo="/fantasy" />
      {screen.phase !== "ready" ? (
        <FantasyPhaseBody phase={screen.phase} next="/fantasy/fixtures" retry={screen.retry} />
      ) : fdrQ.isPending ? (
        <div
          role="status"
          className="m-4 h-72 animate-pulse rounded bg-[color:var(--fpl-grey)] motion-reduce:animate-none"
        />
      ) : (
        <div className="relative overflow-x-auto pb-24">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky start-0 z-10 bg-white px-3 py-2 text-start align-bottom">
                  <span className="block text-[14px] font-bold text-foreground">
                    {t("fpl.team")}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleSort("team")}
                    className={cn(
                      "mt-1 block w-full rounded-[3px] py-0.5",
                      sort.key === "team"
                        ? "bg-[color:var(--fpl-ink)] text-white"
                        : "text-[color:var(--fpl-grey-text)]",
                    )}
                    aria-label={t("fpl.team")}
                  >
                    {sortGlyph("team")}
                  </button>
                </th>
                {gameweeks.map((gw) => (
                  <th key={gw} className="min-w-[84px] px-1 py-2 text-center align-bottom">
                    <span className="block text-[13px] font-bold text-foreground">GW{gw}</span>
                    <span className="block text-[11px] text-[color:var(--fpl-grey-text)]">
                      {dateOf(gw)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSort(gw)}
                      className={cn(
                        "mt-1 block w-full rounded-[3px] py-0.5",
                        sort.key === gw
                          ? "bg-[color:var(--fpl-ink)] text-white"
                          : "text-[color:var(--fpl-grey-text)]",
                      )}
                      aria-label={`GW${gw}`}
                    >
                      {sortGlyph(gw)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedClubs.map((club) => (
                <tr key={club.id}>
                  <td className="sticky start-0 z-10 border-t border-[color:var(--fpl-grey)] bg-white px-3 py-2">
                    <span className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
                      <ClubCrest club={club} size="sm" className="h-6 w-6 rounded-md text-[8px]" />
                      <span className="truncate">{tr(club.shortName)}</span>
                    </span>
                  </td>
                  {gameweeks.map((gw) => {
                    const fixtures = byClub.get(club.id)?.get(gw) ?? [];
                    return (
                      <td key={gw} className="border-t border-[color:var(--fpl-grey)] px-1 py-1">
                        <div className="flex flex-col gap-1">
                          {fixtures.length === 0 ? (
                            <span className="grid h-12 place-items-center rounded-[3px] bg-[color:var(--fpl-grey)] text-[12px] text-[color:var(--fpl-grey-text)]">
                              —
                            </span>
                          ) : (
                            fixtures.map((f) => (
                              <span
                                key={f.opponentClubId + f.gameweek}
                                className={cn(
                                  "grid h-12 place-items-center rounded-[3px] text-[13px] font-bold",
                                  CELL[f.difficulty],
                                )}
                              >
                                {codeOf(f.opponentClubId)} (
                                {f.isHome ? t("fpl.home_short") : t("fpl.away_short")})
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-[color:var(--fpl-grey-text)]">
              {t("fpl.no_data_yet")}
            </p>
          ) : null}
        </div>
      )}

      {/* FDR key */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 mx-auto flex max-w-[480px] justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-white px-3 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.18)] ring-1 ring-[color:var(--fpl-grey)]">
          <span className="text-[12px] font-bold text-foreground">{t("fpl.fdr_key")}:</span>
          <span className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-[3px] text-[11px] font-bold",
                  CELL[n],
                )}
              >
                {n}
              </span>
            ))}
          </span>
          <button
            type="button"
            onClick={() => setKeyOpen((v) => !v)}
            aria-expanded={keyOpen}
            aria-label={t("fpl.fdr_key")}
            className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--fpl-ink)] text-white"
          >
            <Info className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      {keyOpen ? (
        <div className="fixed inset-x-0 bottom-20 z-30 mx-auto max-w-[480px] px-6">
          <div className="rounded-[6px] bg-white p-3 text-[13px] text-foreground shadow-lg ring-1 ring-[color:var(--fpl-grey)]">
            <div className="flex items-center justify-between font-bold">
              <span>{t("fpl.easy")} (1)</span>
              <span>{t("fpl.hard")} (5)</span>
            </div>
            <p className="mt-1 text-[12px] text-[color:var(--fpl-grey-text)]">
              {t("fantasy.fixtures.subtitle")}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
