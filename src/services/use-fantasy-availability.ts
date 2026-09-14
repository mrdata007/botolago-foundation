import { useQuery } from "@tanstack/react-query";
import { fantasyService } from "@/services/fantasy-runtime";

/** Shared by the home widgets and every Fantasy route; retries only actual failures. */
export function useFantasyAvailability() {
  return useQuery({
    queryKey: ["fantasy", "availability"],
    queryFn: () => fantasyService.getAvailability(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}
