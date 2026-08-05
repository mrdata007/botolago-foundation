import { useQuery } from "@tanstack/react-query";

import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";

export function useAtlasMatchdayAccess(enabled = true) {
  const { source, key } = useFantasyDataSource();
  const summary = useQuery({
    queryKey: key("summary"),
    queryFn: () => fantasyService.getSummary(),
    enabled: enabled && source !== "guest",
    staleTime: 30_000,
  });

  return {
    isResolving: enabled && source !== "guest" && summary.isPending,
    showAtlasMatchday: enabled && (source === "guest" || summary.data === null),
  };
}
