import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useI18n } from "@/i18n/provider";
import { fantasyService } from "@/services/fantasy-runtime";
import type { Club } from "@/types/domain";
import type { FixtureDifficulty } from "@/types/fantasy";

/**
 * Next-fixture labels per club for the given gameweek, formatted like the
 * reference player plates: "WAC (D)" (home) / "RCA (E)" (away).
 */
export function useNextFixtures(clubs: Club[], gameweek: number | null, enabled = true) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["fantasy-fixture-difficulty"],
    queryFn: () => fantasyService.getFixtureDifficulty(),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const labels = useMemo(() => {
    const map = new Map<string, string>();
    if (!query.data || gameweek === null) return map;
    const codeOf = (id: string) => clubs.find((c) => c.id === id)?.crestPlaceholder ?? "";
    for (const row of query.data as FixtureDifficulty[]) {
      if (row.gameweek !== gameweek) continue;
      const label = `${codeOf(row.opponentClubId)} (${row.isHome ? t("fpl.home_short") : t("fpl.away_short")})`;
      const existing = map.get(row.clubId);
      map.set(row.clubId, existing ? `${existing} · ${label}` : label);
    }
    return map;
  }, [query.data, clubs, gameweek, t]);
  return {
    labels,
    rows: (query.data ?? []) as FixtureDifficulty[],
    isPending: query.isPending,
    isError: query.isError,
  };
}
