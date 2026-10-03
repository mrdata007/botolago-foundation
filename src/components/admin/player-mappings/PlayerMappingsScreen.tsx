import { useMemo } from "react";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type { PlayerMappingRepository } from "@/backend/football/identity/mapping-repository";
import { PLAYER_MAPPING_PROPOSALS_ENABLED } from "@/lib/feature-flags";
import { BULK_MANIFEST } from "./bulk-manifest";
import type { Lang } from "./copy";
import { FLASHSCORE_BULK_MANIFEST } from "./flashscore-manifest";
import { PlayerMappingsView } from "./PlayerMappingsView";
import { flashscoreManifestSchema } from "@/backend/football/identity/bulk-mapping/flashscore-manifest";
import { guardFlashscoreExecute } from "@/backend/football/identity/bulk-mapping/flashscore-profile";
import { createMappingActions, useQueueData } from "./use-player-mappings";

/**
 * The live screen: reads the queue through the repository it is given and wires
 * the reviewer's requests to it. The repository is the only door to the
 * database (RPC functions that re-check staff, MFA, recent sign-in and the
 * `football.manage_mappings` permission); this component has no table access
 * and no authority of its own. `canManage` only decides what to draw.
 */
export function PlayerMappingsScreen({
  repository,
  actorId,
  canManage,
  lang,
  proposalsEnabled = PLAYER_MAPPING_PROPOSALS_ENABLED,
  bulkManifest = BULK_MANIFEST,
  flashscoreManifest = FLASHSCORE_BULK_MANIFEST,
}: {
  repository: PlayerMappingRepository;
  actorId: string;
  canManage: boolean;
  lang: Lang;
  proposalsEnabled?: boolean;
  /** The frozen batch manifest. Defaults to the committed production one; the sample page passes its own. */
  bulkManifest?: unknown;
  /** The frozen Flashscore evidence batch manifest. Pass null to hide its entry (the sample page does). */
  flashscoreManifest?: unknown;
}) {
  const context = useMemo<RepositoryContext>(
    () => ({ actorId, requestId: globalThis.crypto.randomUUID() }),
    [actorId],
  );
  const { state, reload } = useQueueData(repository, context);
  // A Flashscore batch proposal executed from the ordinary queue gets the same supporting-mapping
  // re-check as one executed from the batch screen: the database does not make that check.
  const flashscoreRows = useMemo(() => {
    const parsed = flashscoreManifestSchema.safeParse(flashscoreManifest);
    return parsed.success ? parsed.data.rows : [];
  }, [flashscoreManifest]);
  const actions = useMemo(() => {
    const context = () => ({ actorId, requestId: globalThis.crypto.randomUUID() });
    return createMappingActions(repository, context, {
      guardExecute: (proposal) =>
        guardFlashscoreExecute({ repository, context }, flashscoreRows, proposal),
    });
  }, [repository, actorId, flashscoreRows]);
  return (
    <PlayerMappingsView
      lang={lang}
      state={state}
      viewer={{ canManage }}
      proposalsEnabled={proposalsEnabled}
      repository={repository}
      context={context}
      actions={actions}
      onReload={reload}
      bulkManifest={bulkManifest}
      flashscoreManifest={flashscoreManifest}
    />
  );
}
