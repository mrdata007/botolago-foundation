import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  BULK_CONFIRMATION_PHRASES,
  type BulkPhase,
  type BulkRowState,
} from "@/backend/football/identity/bulk-mapping/contract";
import { FLASHSCORE_CONTRACT_VERSION } from "@/backend/football/identity/bulk-mapping/flashscore-contract";
import {
  verifyFlashscoreManifest,
  type FlashscoreManifest,
} from "@/backend/football/identity/bulk-mapping/flashscore-manifest";
import { flashscoreProfile } from "@/backend/football/identity/bulk-mapping/flashscore-profile";
import {
  verifyManifest,
  type BulkManifest,
} from "@/backend/football/identity/bulk-mapping/manifest";
import type { BulkRowBase, PhaseSnapshot } from "@/backend/football/identity/bulk-mapping/profile";
import {
  countStates,
  deriveAllRowStates,
  type RowStateInfo,
} from "@/backend/football/identity/bulk-mapping/row-state";
import {
  createBulkRunner,
  type PhaseResult,
  type RowOutcome,
} from "@/backend/football/identity/bulk-mapping/runner";
import { sofascoreProfile } from "@/backend/football/identity/bulk-mapping/sofascore-profile";
import type { PlayerMappingRepository } from "@/backend/football/identity/mapping-repository";
import { mapMappingError } from "@/backend/football/identity/mapping-errors";
import { mapWithConcurrency } from "@/backend/football/identity/review-queue";
import type { QueueData } from "./use-player-mappings";

export type BulkKind = "sofascore" | "flashscore";

/** A verified manifest of either batch; `contractVersion` tells them apart. */
export type AnyBulkManifest = BulkManifest | FlashscoreManifest;

export const isFlashscoreManifest = (manifest: AnyBulkManifest): manifest is FlashscoreManifest =>
  manifest.contractVersion === FLASHSCORE_CONTRACT_VERSION;

type Verdict =
  | { readonly ok: true; readonly manifest: AnyBulkManifest }
  | { readonly ok: false; readonly problems: readonly string[] };

const verifyFor = (kind: BulkKind, raw: unknown): Promise<Verdict> =>
  kind === "flashscore" ? verifyFlashscoreManifest(raw) : verifyManifest(raw);

export type ManifestState =
  | { readonly status: "checking" }
  | { readonly status: "ok"; readonly manifest: AnyBulkManifest }
  | { readonly status: "bad"; readonly problems: readonly string[] };

/** Rows a local outcome may speak for when the database shows nothing worse. */
const WORSE: ReadonlySet<BulkRowState> = new Set([
  "ERROR",
  "STALE_EVIDENCE",
  "IDENTITY_CONFLICT",
  "TARGET_ALREADY_MAPPED",
  "PROVIDER_ID_ALREADY_MAPPED",
  "APPROVAL_EXPIRED",
  "HELD",
]);
const MOVABLE: ReadonlySet<BulkRowState> = new Set(["NOT_PROPOSED", "PROPOSED", "APPROVED"]);

export interface DisplayNames {
  /** Display only. Never an input to anything that decides. */
  readonly appPlayer: ReadonlyMap<string, string | null>;
}

/**
 * Everything the batch screen needs. The row state is derived from the database on
 * every load (so a closed browser resumes where it stopped); the only thing kept
 * here is what this session just did, for the codes it saw.
 */
export function useBulkBatch(input: {
  /** Which frozen batch this is. Selects the verifier and the profile. Default: sofascore. */
  readonly kind?: BulkKind;
  readonly rawManifest: unknown;
  readonly repository: PlayerMappingRepository | null;
  readonly context: RepositoryContext;
  readonly data: QueueData | null;
  readonly onReload: () => void;
  readonly initialManifest?: ManifestState;
  readonly initialNames?: DisplayNames;
}) {
  const { rawManifest, repository, context, data, onReload } = input;
  const kind: BulkKind = input.kind ?? "sofascore";
  const [manifestState, setManifestState] = useState<ManifestState>(
    input.initialManifest ?? { status: "checking" },
  );
  useEffect(() => {
    if (input.initialManifest) return;
    let cancelled = false;
    verifyFor(kind, rawManifest).then((verdict) => {
      if (!cancelled)
        setManifestState(
          verdict.ok
            ? { status: "ok", manifest: verdict.manifest }
            : { status: "bad", problems: verdict.problems },
        );
    });
    return () => {
      cancelled = true;
    };
  }, [kind, rawManifest, input.initialManifest]);

  const manifest: AnyBulkManifest | null =
    manifestState.status === "ok" ? manifestState.manifest : null;
  const [selected, setSelected] = useState<ReadonlySet<string>>(() =>
    input.initialManifest?.status === "ok"
      ? new Set<string>(input.initialManifest.manifest.rows.map((r) => r.candidateId))
      : new Set(),
  );
  useEffect(() => {
    // Default selection: every row of the verified manifest.
    if (manifest) setSelected(new Set<string>(manifest.rows.map((r) => r.candidateId)));
  }, [manifest]);

  const [session, setSession] = useState<ReadonlyMap<string, RowOutcome>>(new Map());
  const [running, setRunning] = useState<BulkPhase | null>(null);
  const [last, setLast] = useState<PhaseResult | null>(null);

  const contextRef = useRef(context);
  contextRef.current = context;
  const runner = useMemo(() => {
    if (!repository || !manifest) return null;
    const deps = {
      repository,
      context: () => ({
        actorId: contextRef.current.actorId,
        requestId: globalThis.crypto.randomUUID(),
      }),
    };
    return isFlashscoreManifest(manifest)
      ? createBulkRunner(deps, manifest, flashscoreProfile)
      : createBulkRunner(deps, manifest, sofascoreProfile);
  }, [repository, manifest]);

  // The actual mapping rows a Flashscore batch rests on, read from the database whenever the queue
  // reloads (display only: the phases read them again, and the database enforces the dependency).
  const [supportingReads, setSupportingReads] = useState<
    PhaseSnapshot["providerMappings"] | undefined
  >(undefined);
  useEffect(() => {
    if (!repository || !manifest || !isFlashscoreManifest(manifest) || !data) {
      setSupportingReads(undefined);
      return;
    }
    let cancelled = false;
    flashscoreProfile
      .loadSupporting?.(
        {
          repository,
          context: () => ({
            actorId: contextRef.current.actorId,
            requestId: globalThis.crypto.randomUUID(),
          }),
        },
        manifest.rows,
      )
      .then(
        (reads) => {
          if (!cancelled) setSupportingReads(reads);
        },
        () => {
          if (!cancelled) setSupportingReads(undefined);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [repository, manifest, data]);

  const rowStates = useMemo<ReadonlyMap<string, RowStateInfo>>(() => {
    if (!manifest || !data) return new Map();
    const now = new Date();
    const derived = isFlashscoreManifest(manifest)
      ? deriveAllRowStates(
          manifest,
          data.candidates,
          data.proposals,
          now,
          flashscoreProfile,
          supportingReads,
        )
      : deriveAllRowStates(manifest, data.candidates, data.proposals, now, sofascoreProfile);
    const merged = new Map(derived);
    for (const [id, outcome] of session) {
      const db = derived.get(id);
      if (db && MOVABLE.has(db.state) && WORSE.has(outcome.state))
        merged.set(id, {
          state: outcome.state,
          code: outcome.code,
          proposalId: outcome.proposalId,
        });
    }
    return merged;
  }, [manifest, data, session, supportingReads]);

  const counts = useMemo(() => countStates(rowStates), [rowStates]);
  const inState = useCallback(
    (state: BulkRowState) =>
      (manifest?.rows ?? ([] as readonly BulkRowBase[])).filter(
        (r) => selected.has(r.candidateId) && rowStates.get(r.candidateId)?.state === state,
      ).length,
    [manifest, selected, rowStates],
  );

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const setAll = useCallback(
    (on: boolean) =>
      setSelected(
        on && manifest ? new Set<string>(manifest.rows.map((r) => r.candidateId)) : new Set(),
      ),
    [manifest],
  );

  const run = useCallback(
    async (phase: BulkPhase) => {
      if (!runner || running) return;
      setRunning(phase);
      try {
        const result = await runner.run(phase, selected);
        setLast(result);
        setSession((current) => {
          const next = new Map(current);
          for (const outcome of result.outcomes)
            if (outcome.acted || WORSE.has(outcome.state)) next.set(outcome.candidateId, outcome);
          return next;
        });
      } catch (error) {
        setLast({
          phase,
          outcomes: [],
          aborted: { code: mapMappingError(error).code },
        });
      } finally {
        setRunning(null);
        onReload();
      }
    },
    [runner, running, selected, onReload],
  );

  // Display-only: the app player's name, asked for once per row, four at a time.
  const [names, setNames] = useState<DisplayNames>(input.initialNames ?? { appPlayer: new Map() });
  useEffect(() => {
    if (!repository || !manifest || input.initialNames) return;
    let cancelled = false;
    void mapWithConcurrency<BulkRowBase, void>(manifest.rows, 4, async (row) => {
      let name: string | null = null;
      // A row with no team has no club to list under: its name stays "—".
      if (row.appTeamId !== null) {
        try {
          const options = await repository.listMappingCandidatesForAppPlayer(
            row.candidateId,
            row.appTeamId,
            200,
            { actorId: contextRef.current.actorId, requestId: globalThis.crypto.randomUUID() },
          );
          name = options.find((o) => o.appPlayerId === row.appPlayerId)?.displayName ?? null;
        } catch {
          name = null;
        }
      }
      if (!cancelled)
        setNames((current) => ({
          appPlayer: new Map(current.appPlayer).set(row.appPlayerId, name),
        }));
    });
    return () => {
      cancelled = true;
    };
  }, [repository, manifest, input.initialNames]);

  return {
    manifestState,
    manifest,
    selected,
    toggle,
    setAll,
    rowStates,
    counts,
    inState,
    running,
    last,
    run,
    names,
    phrases: BULK_CONFIRMATION_PHRASES,
  };
}
