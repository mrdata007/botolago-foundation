import { useQuery } from "@tanstack/react-query";

import { fantasyService } from "./fantasy-runtime";
import { PUBLICATION_NOTICE_REFRESH_MS } from "./fantasy-publication-notice";

/**
 * The notice of the journée whose points are waiting to be published (migration
 * 20261030100000), for a given journée or, with `null`, the oldest one waiting.
 * While one shows it looks again every minute, so it leaves by itself once the
 * points are out; with nothing waiting it looks again rarely, so a journée whose
 * last match has just ended gets its line without a reload.
 */
export function usePublicationNotice(sequence: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["fantasy-publication-notice", sequence],
    queryFn: () => fantasyService.getPublicationNotice(sequence),
    enabled,
    staleTime: PUBLICATION_NOTICE_REFRESH_MS / 2,
    retry: false,
    refetchInterval: (query) =>
      query.state.data ? PUBLICATION_NOTICE_REFRESH_MS : PUBLICATION_NOTICE_REFRESH_MS * 5,
  });
}
