import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  MyPredictionDto,
  MyPredictionsDto,
  OpenPredictionsRoundDto,
  PredictionFixtureDto,
  PredictionInput,
  PredictionsRoundDto,
  SaveResultDto,
} from "@/backend/predictions/contracts";
import { MAX_STEPPER_GOALS } from "@/backend/predictions/contracts";
import { mapPredictionsError, type PredictionsError } from "@/backend/predictions/errors";
import {
  emptyGuestStore,
  GUEST_STORE_EVENT_KEY,
  type GuestStoreState,
} from "@/backend/predictions/guest-store";
import { PredictionSaveQueue, type SaveQueueState } from "@/backend/predictions/save-queue";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { predictionsService } from "@/services/predictions";
import { guestRoundEvents } from "./guest-analytics";
import { getGuestStore, noteServerTime, serverNow } from "./predictions-runtime";

export { getGuestStore, noteServerTime, serverNow };

/**
 * Everything the Pronostics page and the match-page card need about one
 * journée: its matches, what the player predicted (on the account, or on the
 * phone for a visitor), and a way to change a prediction.
 *
 * Lock states follow the SERVER's clock: every answer carries `serverTime`,
 * the gap to the phone's clock is kept, and a match locks on screen when
 * server time reaches its kick-off, whatever the phone says. The database
 * checks again on every save anyway.
 */

export const predictionsKeys = {
  all: ["predictions"] as const,
  round: (roundNumber: number | null, lang: string) =>
    ["predictions", "round", roundNumber ?? "current", lang] as const,
  mine: (uid: string, roundNumber: number) => ["predictions", "mine", uid, roundNumber] as const,
  fixture: (uid: string, fixtureId: string) =>
    ["predictions", "mine-fixture", uid, fixtureId] as const,
};

const LIVE_STATUSES = new Set([
  "live_first_half",
  "half_time",
  "live_second_half",
  "extra_time",
  "penalties",
]);

/**
 * Re-renders every `ms` so a match locks on screen at its kick-off. Null until
 * mounted: the server's render and the browser's first render must be the
 * same tree, so the first one trusts the database's `open` alone.
 */
export function useServerClock(ms = 15_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(serverNow());
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function isFixtureOpen(fixture: PredictionFixtureDto, now: number | null): boolean {
  return fixture.open && (now === null || now < Date.parse(fixture.kickoffAt));
}

export interface Pick {
  readonly home: number;
  readonly away: number;
}

/** The first tap sets both sides to 0 and then applies itself (plan §8). */
export function nextPick(current: Pick | null, side: "home" | "away", delta: 1 | -1): Pick | null {
  const base = current ?? { home: 0, away: 0 };
  if (!current && delta === -1) return base;
  const value = Math.min(Math.max(base[side] + delta, 0), MAX_STEPPER_GOALS);
  if (current && value === current[side]) return null;
  return { ...base, [side]: value };
}

function draftKey(uid: string): string {
  return `botolago.predictions.pending.${uid}`;
}

function draftsFor(uid: string) {
  return {
    load(): readonly PredictionInput[] {
      if (typeof window === "undefined") return [];
      try {
        const raw = window.localStorage.getItem(draftKey(uid));
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed)
          ? parsed.filter(
              (item): item is PredictionInput =>
                typeof item?.fixtureId === "string" &&
                Number.isInteger(item?.home) &&
                Number.isInteger(item?.away),
            )
          : [];
      } catch {
        return [];
      }
    },
    save(items: readonly PredictionInput[]): void {
      if (typeof window === "undefined") return;
      try {
        if (items.length === 0) window.localStorage.removeItem(draftKey(uid));
        else window.localStorage.setItem(draftKey(uid), JSON.stringify(items));
      } catch {
        /* storage blocked: the queue still holds them for the visit */
      }
    },
  };
}

/**
 * The guest store's state, re-read whenever it changes. Empty until mounted:
 * the server has no phone storage, and the first render must match its.
 */
export function useGuestPredictions() {
  const store = getGuestStore();
  const [state, setState] = useState<GuestStoreState>(() => emptyGuestStore());
  // Whether the phone keeps picks: only the phone knows (the server has no
  // storage at all), so it is assumed until mounted.
  const [persistent, setPersistent] = useState(true);
  useEffect(() => {
    setPersistent(store.persistent);
    setState(store.read());
    const onChange = (event: Event) => {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (!key || key === GUEST_STORE_EVENT_KEY) setState(store.read());
    };
    window.addEventListener("botolago:storage", onChange);
    return () => window.removeEventListener("botolago:storage", onChange);
  }, [store]);
  return { store, state, persistent };
}

export function roundQueryOptions(roundNumber: number | null, lang: "fr" | "ar") {
  return {
    queryKey: predictionsKeys.round(roundNumber, lang),
    queryFn: async ({ signal }: { signal?: AbortSignal }) => {
      const round = await predictionsService.getRound(roundNumber, lang, signal);
      noteServerTime(round.serverTime);
      return round;
    },
    staleTime: 60_000,
  };
}

export interface PredictionsRoundModel {
  readonly query: ReturnType<typeof useQuery<PredictionsRoundDto, PredictionsError>>;
  readonly round: OpenPredictionsRoundDto | null;
  readonly signedIn: boolean;
  readonly uid: string | null;
  readonly mine: ReadonlyMap<string, MyPredictionDto>;
  readonly mineQuery: ReturnType<typeof useQuery<MyPredictionsDto, PredictionsError>>;
  readonly now: number | null;
  readonly saveState: SaveQueueState | "guest";
  readonly guestPersistent: boolean;
  /** What the page shows for a match: a change on its way wins. */
  pickFor(fixtureId: string): Pick | null;
  setPick(fixture: PredictionFixtureDto, pick: Pick): void;
  retrySave(): void;
}

export interface RoundSeed {
  /** What the server rendered with (loader data), so both first renders agree. */
  readonly data: PredictionsRoundDto;
  readonly updatedAt: number;
}

/**
 * The server renders as a visitor. While the game is open to testers only,
 * its "not allowed" need not be this reader's answer: the page keeps it for
 * the first render (the server's and the browser's must agree) but as already
 * stale, so the browser asks again at once with the reader's session.
 */
export function seedUpdatedAt(seed: RoundSeed): number {
  return !seed.data.allowed && seed.data.mode === "testers" ? 0 : seed.updatedAt;
}

export function usePredictionsRound(
  roundNumber: number | null,
  seed?: RoundSeed,
): PredictionsRoundModel {
  const { lang, t } = useI18n();
  const { user, status } = useAuth();
  const queryClient = useQueryClient();
  const signedIn = status === "authenticated" && Boolean(user);
  const uid = signedIn ? (user?.id ?? null) : null;
  const now = useServerClock();

  const serverSeed = lang === "fr" ? seed : undefined;
  const query = useQuery<PredictionsRoundDto, PredictionsError>({
    ...roundQueryOptions(roundNumber, lang),
    initialData: serverSeed?.data,
    initialDataUpdatedAt: serverSeed ? seedUpdatedAt(serverSeed) : undefined,
    // Every 2 minutes while a match of the journée is being played and the
    // page is on screen; otherwise never on its own.
    refetchInterval: (current) => {
      const data = current.state.data;
      return data?.allowed && data.fixtures.some((fixture) => LIVE_STATUSES.has(fixture.status))
        ? 120_000
        : false;
    },
    refetchIntervalInBackground: false,
  });
  const round = query.data?.allowed ? query.data : null;
  const resolvedNumber = round?.round?.number ?? null;
  // A journée rendered on the server arrives without a client fetch: its
  // serverTime still corrects a phone clock that is off.
  useEffect(() => {
    if (query.data) noteServerTime(query.data.serverTime);
  }, [query.data]);

  const mineQuery = useQuery<MyPredictionsDto, PredictionsError>({
    queryKey: predictionsKeys.mine(uid ?? "", resolvedNumber ?? 0),
    queryFn: async ({ signal }) => {
      const mine = await predictionsService.getMyPredictions(
        { roundNumber: resolvedNumber, fixtureId: null },
        signal,
      );
      noteServerTime(mine.serverTime);
      return mine;
    },
    enabled: Boolean(uid) && resolvedNumber !== null,
    staleTime: 60_000,
  });

  const mine = useMemo(
    () => new Map((mineQuery.data?.items ?? []).map((item) => [item.fixtureId, item])),
    [mineQuery.data],
  );

  // ---- saving (signed in) --------------------------------------------------
  const [saveState, setSaveState] = useState<SaveQueueState>("idle");
  const [pendingVersion, setPendingVersion] = useState(0);
  const queueRef = useRef<PredictionSaveQueue | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  const applyResults = useCallback(
    (results: readonly SaveResultDto[]) => {
      if (!uid || resolvedNumber === null) return;
      queryClient.setQueryData<MyPredictionsDto>(
        predictionsKeys.mine(uid, resolvedNumber),
        (current) => {
          if (!current) return current;
          const items = new Map(current.items.map((item) => [item.fixtureId, item]));
          for (const result of results) {
            if (result.home === null || result.away === null || !result.submittedAt) continue;
            const previous = items.get(result.fixtureId);
            items.set(result.fixtureId, {
              fixtureId: result.fixtureId,
              home: result.home,
              away: result.away,
              submittedAt: result.submittedAt,
              points: previous?.points ?? null,
              resultKind: previous?.resultKind ?? null,
            });
          }
          const list = [...items.values()];
          return {
            ...current,
            items: list,
            summary: current.summary ? { ...current.summary, predicted: list.length } : null,
          };
        },
      );
      for (const result of results)
        void queryClient.invalidateQueries({
          queryKey: predictionsKeys.fixture(uid, result.fixtureId),
        });
    },
    [queryClient, uid, resolvedNumber],
  );
  const applyResultsRef = useRef(applyResults);
  applyResultsRef.current = applyResults;

  useEffect(() => {
    if (!uid) return;
    const queue = new PredictionSaveQueue({
      send: (items) => predictionsService.save(items),
      now: serverNow,
      drafts: draftsFor(uid),
      onStateChange: (state) => {
        setSaveState(state);
        setPendingVersion((v) => v + 1);
      },
      onSaved: (results, serverTime) => {
        noteServerTime(serverTime);
        applyResultsRef.current(results);
        setPendingVersion((v) => v + 1);
      },
      onLocked: () => {
        toast.error(tRef.current("predictions.save.locked"));
        void queryClient.invalidateQueries({ queryKey: ["predictions", "round"] });
      },
      onError: (error) => {
        if (error.code === "account_banned" || error.code === "predictions_unavailable")
          void queryClient.invalidateQueries({ queryKey: ["predictions", "round"] });
      },
    });
    queueRef.current = queue;
    const flush = () => void queue.flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      void queue.flush();
      queue.dispose();
      queueRef.current = null;
    };
  }, [uid, queryClient]);

  // ---- guests --------------------------------------------------------------
  const guest = useGuestPredictions();

  const pickFor = useCallback(
    (fixtureId: string): Pick | null => {
      void pendingVersion;
      if (uid) {
        const pending = queueRef.current?.pendingValue(fixtureId);
        if (pending) return pending;
        const saved = mine.get(fixtureId);
        return saved ? { home: saved.home, away: saved.away } : null;
      }
      const stored = guest.state.predictions[fixtureId];
      return stored && guest.state.seasonId === round?.season?.id
        ? { home: stored.home, away: stored.away }
        : null;
    },
    [uid, mine, guest.state, round?.season?.id, pendingVersion],
  );

  const setPick = useCallback(
    (fixture: PredictionFixtureDto, pick: Pick) => {
      if (!isFixtureOpen(fixture, serverNow())) {
        toast.error(t("predictions.save.locked"));
        return;
      }
      if (uid) {
        queueRef.current?.set({
          fixtureId: fixture.id,
          home: pick.home,
          away: pick.away,
          kickoffAt: fixture.kickoffAt,
        });
        setPendingVersion((v) => v + 1);
        return;
      }
      const seasonId = round?.season?.id;
      const roundNo = round?.round?.number;
      if (!seasonId || !roundNo) return;
      guest.store.upsert(seasonId, {
        fixtureId: fixture.id,
        home: pick.home,
        away: pick.away,
        homeTeamId: fixture.home.id,
        awayTeamId: fixture.away.id,
        roundNumber: roundNo,
        kickoffAt: fixture.kickoffAt,
        savedAt: new Date().toISOString(),
      });
      const open = round.fixtures
        .filter((candidate) => !candidate.void && isFixtureOpen(candidate, serverNow()))
        .map((candidate) => candidate.id);
      for (const event of guestRoundEvents(guest.store, seasonId, roundNo, open)) track(event);
    },
    [uid, round, guest.store, t],
  );

  const retrySave = useCallback(() => {
    void queueRef.current?.retry();
  }, []);

  return {
    query,
    round,
    signedIn,
    uid,
    mine,
    mineQuery,
    now,
    saveState: uid ? saveState : "guest",
    guestPersistent: guest.persistent,
    pickFor,
    setPick,
    retrySave,
  };
}

/** Maps a failed read to the one sentence the page shows. */
export function readFailure(error: unknown): "coming_soon" | "unavailable" {
  const mapped = mapPredictionsError(error);
  return mapped.code === "predictions_unavailable" ? "coming_soon" : "unavailable";
}
