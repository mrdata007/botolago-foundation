import { useQuery } from "@tanstack/react-query";

import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";

/**
 * The manager's private leagues: the query, key and service the Fantasy hub and the leagues page
 * use, so Gradins reads their cached answer. Only an owner asks.
 */
export function usePrivateLeagues(enabled: boolean) {
  const { key } = useFantasyDataSource();
  return useQuery({
    queryKey: key("leagues", "private"),
    queryFn: () => fantasyService.getLeagues("private"),
    enabled,
  });
}
