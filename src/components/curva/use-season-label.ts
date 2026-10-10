import { useQuery } from "@tanstack/react-query";

import { useI18n } from "@/i18n/provider";
import { defaultSeason, footballService } from "@/services/football";

/**
 * The current season's label (« 2026/27 »), for the card a guest or an account with no team is
 * shown: the season carried on the tab. The football seasons query Home already reads; an
 * empty string until it answers, which the card draws as an empty carrier.
 */
export function useSeasonLabel(): string {
  const { lang } = useI18n();
  const seasons = useQuery({
    queryKey: ["football", "seasons", lang],
    queryFn: () => footballService.getSeasons(lang),
    staleTime: 5 * 60_000,
  });
  return (seasons.data ? defaultSeason(seasons.data)?.label : undefined) ?? "";
}
