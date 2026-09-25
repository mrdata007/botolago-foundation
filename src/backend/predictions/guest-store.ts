import { z } from "zod";
import { postgresUuidSchema } from "@/backend/contracts/validation";
import { MAX_CLAIM_ITEMS, type ClaimStatus, type GuestClaimInput } from "./contracts";

/**
 * A visitor's predictions, kept on the phone until they create an account
 * (plan §4, option A). Nothing here reaches the server before sign-in, and
 * nothing here is ranked: at sign-in `api.claim_guest_predictions` imports what
 * is still open and the account's own predictions win.
 *
 * The key is versioned and sits outside `botolago.auth.*`, which sign-out
 * wipes. When the browser blocks storage the store keeps its state in memory,
 * for the visit only, and says so (`persistent`), so the page can ask the
 * visitor to create an account instead of pretending to remember.
 */
export const GUEST_STORE_KEY = "botolago.predictions.guest.v1";
/** What `storage.ts` listeners are told when the store changes. */
export const GUEST_STORE_EVENT_KEY = "predictions.guest.v1";
/** More than a season's worth of journées is never needed on a phone. */
export const GUEST_STORE_MAX_ITEMS = 120;

const uuid = postgresUuidSchema;

const guestPredictionSchema = z.object({
  fixtureId: uuid,
  home: z.number().int().min(0).max(20),
  away: z.number().int().min(0).max(20),
  homeTeamId: uuid,
  awayTeamId: uuid,
  roundNumber: z.number().int().positive(),
  kickoffAt: z.string(),
  /** The phone's clock: shown, never trusted. */
  savedAt: z.string(),
});
export type GuestPrediction = z.infer<typeof guestPredictionSchema>;

const guestStoreSchema = z.object({
  version: z.literal(1),
  seasonId: uuid.nullable(),
  predictions: z.record(z.string(), guestPredictionSchema),
  /** Journées this phone has started / completed: analytics fires once each. */
  startedRounds: z.array(z.number().int().positive()),
  completedRounds: z.array(z.number().int().positive()),
  /** Picks the import refused because the match had started: "non comptabilisé". */
  notCounted: z.array(uuid),
});
export type GuestStoreState = z.infer<typeof guestStoreSchema>;

export function emptyGuestStore(seasonId: string | null = null): GuestStoreState {
  return {
    version: 1,
    seasonId,
    predictions: {},
    startedRounds: [],
    completedRounds: [],
    notCounted: [],
  };
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** window.localStorage when it actually works, else null (private mode, blocked). */
export function browserStorage(): KeyValueStorage | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    const probe = "botolago.predictions.probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function notifyChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("botolago:storage", { detail: { key: GUEST_STORE_EVENT_KEY } }),
    );
  } catch {
    /* no CustomEvent: nothing listens */
  }
}

export class GuestPredictionStore {
  private memory: GuestStoreState = emptyGuestStore();

  constructor(
    private readonly storage: KeyValueStorage | null = browserStorage(),
    private readonly key: string = GUEST_STORE_KEY,
  ) {}

  /** False when the browser refuses storage: picks last for this visit only. */
  get persistent(): boolean {
    return this.storage !== null;
  }

  read(): GuestStoreState {
    if (!this.storage) return this.memory;
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch {
      return this.memory;
    }
    if (!raw) return emptyGuestStore();
    try {
      const parsed = guestStoreSchema.safeParse(JSON.parse(raw));
      // Corrupt or from an unknown version: start over rather than guess.
      return parsed.success ? parsed.data : emptyGuestStore();
    } catch {
      return emptyGuestStore();
    }
  }

  private write(state: GuestStoreState): GuestStoreState {
    if (this.storage) {
      try {
        this.storage.setItem(this.key, JSON.stringify(state));
      } catch {
        this.memory = state;
      }
    } else {
      this.memory = state;
    }
    notifyChange();
    return state;
  }

  /** The store for `seasonId`: another season's picks are dropped, never imported. */
  private forSeason(seasonId: string): GuestStoreState {
    const state = this.read();
    return state.seasonId === seasonId ? state : emptyGuestStore(seasonId);
  }

  get(fixtureId: string): GuestPrediction | null {
    return this.read().predictions[fixtureId] ?? null;
  }

  upsert(seasonId: string, pick: GuestPrediction): GuestStoreState {
    const state = this.forSeason(seasonId);
    const predictions = { ...state.predictions, [pick.fixtureId]: pick };
    const ids = Object.keys(predictions);
    if (ids.length > GUEST_STORE_MAX_ITEMS) {
      // Oldest matches go first: they can no longer be imported anyway.
      ids
        .sort(
          (a, b) => Date.parse(predictions[a]!.kickoffAt) - Date.parse(predictions[b]!.kickoffAt),
        )
        .slice(0, ids.length - GUEST_STORE_MAX_ITEMS)
        .forEach((id) => delete predictions[id]);
    }
    return this.write({
      ...state,
      predictions,
      notCounted: state.notCounted.filter((id) => id !== pick.fixtureId),
    });
  }

  /** What to send to `api.claim_guest_predictions`: this season's, latest matches first. */
  forClaim(seasonId: string | null): GuestClaimInput[] {
    const state = this.read();
    if (!seasonId || state.seasonId !== seasonId) return [];
    return Object.values(state.predictions)
      .filter((pick) => !state.notCounted.includes(pick.fixtureId))
      .sort((a, b) => Date.parse(b.kickoffAt) - Date.parse(a.kickoffAt))
      .slice(0, MAX_CLAIM_ITEMS)
      .map((pick) => ({
        fixtureId: pick.fixtureId,
        home: pick.home,
        away: pick.away,
        homeTeamId: pick.homeTeamId,
        awayTeamId: pick.awayTeamId,
      }));
  }

  /**
   * After an import: what reached the account (imported), or was already
   * there (kept), or can never count (invalid) leaves the phone. A pick
   * refused because its match had started stays, marked "non comptabilisé".
   */
  applyClaim(results: readonly { fixtureId: string; status: ClaimStatus }[]): GuestStoreState {
    const state = this.read();
    const predictions = { ...state.predictions };
    const notCounted = new Set(state.notCounted);
    for (const result of results) {
      if (result.status === "started") notCounted.add(result.fixtureId);
      else delete predictions[result.fixtureId];
    }
    return this.write({
      ...state,
      predictions,
      notCounted: [...notCounted].filter((id) => id in predictions),
    });
  }

  /** True the first time this phone starts journée `round` (analytics dedup). */
  markRoundStarted(seasonId: string, round: number): boolean {
    const state = this.forSeason(seasonId);
    if (state.startedRounds.includes(round)) return false;
    this.write({ ...state, startedRounds: [...state.startedRounds, round].slice(-60) });
    return true;
  }

  /** True the first time this phone completes journée `round`. */
  markRoundCompleted(seasonId: string, round: number): boolean {
    const state = this.forSeason(seasonId);
    if (state.completedRounds.includes(round)) return false;
    this.write({ ...state, completedRounds: [...state.completedRounds, round].slice(-60) });
    return true;
  }

  hasStartedRound(seasonId: string, round: number): boolean {
    const state = this.read();
    return state.seasonId === seasonId && state.startedRounds.includes(round);
  }

  clear(): void {
    this.memory = emptyGuestStore();
    if (this.storage) {
      try {
        this.storage.removeItem(this.key);
      } catch {
        /* blocked: memory already cleared */
      }
    }
    notifyChange();
  }
}
