import { useCallback, useEffect, useMemo, useState } from "react";
import {
  mapSofascoreQueueError,
  type CreatePlayerInput,
  type ParsedQueue,
  type SofascorePlayerQueueRepository,
} from "@/backend/football/identity/sofascore-player-queue";
import type { Lang } from "./copy";
import { SofascorePlayerQueueView, type QueueLoadState } from "./SofascorePlayerQueueView";

/**
 * The live screen: reads the open list through the repository it is given and
 * hands the view its actions (confirm a player, find and link any catalog
 * player, link a second SofaScore id, create the player). The repository is the only door
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
  const actions = useMemo(
    () => ({
      resolve: (sofascorePlayerId: string, playerId: string) =>
        repository.resolve(sofascorePlayerId, playerId),
      linkAlias: (sofascorePlayerId: string, playerId: string) =>
        repository.linkAlias(sofascorePlayerId, playerId),
      createPlayer: (sofascorePlayerId: string, input: CreatePlayerInput) =>
        repository.createPlayer(sofascorePlayerId, input),
      listOptions: (sofascorePlayerId: string, query?: string) =>
        repository.listOptions(sofascorePlayerId, query),
    }),
    [repository],
  );

  return (
    <SofascorePlayerQueueView
      lang={lang}
      state={state}
      canManage={canManage}
      onReload={reload}
      {...actions}
    />
  );
}
