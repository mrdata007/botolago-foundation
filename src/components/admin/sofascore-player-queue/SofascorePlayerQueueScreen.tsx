import { useCallback, useEffect, useMemo, useState } from "react";
import {
  mapSofascoreQueueError,
  type ParsedQueue,
  type SofascorePlayerQueueRepository,
} from "@/backend/football/identity/sofascore-player-queue";
import type { Lang } from "./copy";
import { SofascorePlayerQueueView, type QueueLoadState } from "./SofascorePlayerQueueView";

/**
 * The live screen: reads the open list through the repository it is given and
 * hands the view one way to confirm a player. The repository is the only door
 * to the database (RPC functions that re-check staff, MFA and the permission);
 * `canManage` only decides what is drawn.
 */
export function SofascorePlayerQueueScreen({
  repository,
  canManage,
  lang,
}: {
  repository: SofascorePlayerQueueRepository;
  canManage: boolean;
  lang: Lang;
}) {
  const [state, setState] = useState<QueueLoadState>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void (async () => {
      try {
        const data: ParsedQueue = await repository.listQueue(controller.signal);
        if (!controller.signal.aborted) setState({ status: "ready", data, version });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({ status: "error", code: mapSofascoreQueueError(error).code });
      }
    })();
    return () => controller.abort();
  }, [repository, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const resolve = useMemo(
    () => (sofascorePlayerId: string, playerId: string) =>
      repository.resolve(sofascorePlayerId, playerId),
    [repository],
  );

  return (
    <SofascorePlayerQueueView
      lang={lang}
      state={state}
      canManage={canManage}
      onReload={reload}
      resolve={resolve}
    />
  );
}
