import {
  MAX_ITEMS_PER_SAVE,
  type PredictionInput,
  type SavePredictionsDto,
  type SaveResultDto,
} from "./contracts";
import { mapPredictionsError, type PredictionsError } from "./errors";

/**
 * Saving a journée's predictions (plan §8): every tap shows at once, and one
 * second after the last tap one `api.save_predictions` call sends every match
 * that changed.
 *
 *   - One request at a time, always carrying the latest values, so an older
 *     request can never overwrite a newer one.
 *   - A match whose kick-off is less than two minutes away is sent at once.
 *   - `flush()` sends now: the page calls it when it is hidden.
 *   - What has not been sent is kept as a draft for the account and sent
 *     again on the next visit.
 *   - Nothing is sent while `canSend` says the session is no longer the
 *     account's: the changes wait in its draft, for that account.
 *   - A network failure is retried with backoff; the bar says "Hors
 *     connexion". Any other failure stops and says "Échec, réessayer".
 *
 * The database decides what is still open: a match it reports as locked is
 * dropped from the queue and handed to `onLocked`, and the page shows the
 * value the account really holds.
 */

export type SaveQueueState = "idle" | "pending" | "saving" | "saved" | "offline" | "error";

export interface QueuedPrediction extends PredictionInput {
  /** When known: a match about to lock is sent without waiting. */
  readonly kickoffAt?: string | null;
}

export interface SaveQueueTimers {
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SaveQueueDrafts {
  load(): readonly PredictionInput[];
  save(items: readonly PredictionInput[]): void;
}

export interface SaveQueueOptions {
  send(items: readonly PredictionInput[]): Promise<SavePredictionsDto>;
  /**
   * Whether `send` would still reach the account these changes belong to. A
   * queue holds one account's changes, but `send` carries whichever session
   * is current when it runs. While this says no, nothing is sent -- not on
   * the timer, not on `flush()` -- and the changes stay queued and in
   * `drafts`. Omitted: always.
   */
  canSend?: () => boolean;
  /** The server's clock as the page knows it (phone clock + measured offset). */
  now?: () => number;
  delayMs?: number;
  lockSoonMs?: number;
  timers?: SaveQueueTimers;
  drafts?: SaveQueueDrafts;
  onStateChange?: (state: SaveQueueState) => void;
  /** Every result the database returned: the page updates its cache from it. */
  onSaved?: (results: readonly SaveResultDto[], serverTime: string) => void;
  /** Matches the database refused as no longer open. */
  onLocked?: (results: readonly SaveResultDto[]) => void;
  onError?: (error: PredictionsError) => void;
}

interface PendingEntry {
  readonly home: number;
  readonly away: number;
  readonly kickoffAt: string | null;
  readonly version: number;
}

const RETRY_DELAYS_MS = [3_000, 10_000, 30_000, 60_000];

const defaultTimers: SaveQueueTimers = {
  setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class PredictionSaveQueue {
  private readonly pending = new Map<string, PendingEntry>();
  private version = 0;
  private timer: unknown = null;
  private inFlight: Promise<void> | null = null;
  private again = false;
  private retries = 0;
  private stateValue: SaveQueueState = "idle";
  private disposed = false;

  private readonly delayMs: number;
  private readonly lockSoonMs: number;
  private readonly timers: SaveQueueTimers;
  private readonly now: () => number;

  constructor(private readonly options: SaveQueueOptions) {
    this.delayMs = options.delayMs ?? 1_000;
    this.lockSoonMs = options.lockSoonMs ?? 120_000;
    this.timers = options.timers ?? defaultTimers;
    this.now = options.now ?? (() => Date.now());
    const drafts = options.drafts?.load() ?? [];
    for (const draft of drafts) this.enqueue({ ...draft, kickoffAt: null });
    if (this.pending.size > 0) this.schedule(0);
  }

  get state(): SaveQueueState {
    return this.stateValue;
  }

  /** Matches changed on the page and not yet confirmed by the database. */
  get pendingIds(): string[] {
    return [...this.pending.keys()];
  }

  /** The value the page should show while a change is on its way. */
  pendingValue(fixtureId: string): { home: number; away: number } | null {
    const entry = this.pending.get(fixtureId);
    return entry ? { home: entry.home, away: entry.away } : null;
  }

  set(item: QueuedPrediction): void {
    if (this.disposed) return;
    this.enqueue(item);
    this.persistDrafts();
    this.setState(this.inFlight ? "saving" : "pending");
    const kickoff = item.kickoffAt ? Date.parse(item.kickoffAt) : Number.NaN;
    const aboutToLock = Number.isFinite(kickoff) && kickoff - this.now() <= this.lockSoonMs;
    this.schedule(aboutToLock ? 0 : this.delayMs);
  }

  /** Send everything now (page hidden, "Réessayer"). */
  flush(): Promise<void> {
    this.clearTimer();
    return this.run();
  }

  retry(): Promise<void> {
    this.retries = 0;
    return this.flush();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private enqueue(item: QueuedPrediction): void {
    this.version += 1;
    this.pending.set(item.fixtureId, {
      home: item.home,
      away: item.away,
      kickoffAt: item.kickoffAt ?? null,
      version: this.version,
    });
  }

  private schedule(ms: number): void {
    this.clearTimer();
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setState(state: SaveQueueState): void {
    if (this.stateValue === state) return;
    this.stateValue = state;
    this.options.onStateChange?.(state);
  }

  private persistDrafts(): void {
    this.options.drafts?.save(
      [...this.pending].map(([fixtureId, entry]) => ({
        fixtureId,
        home: entry.home,
        away: entry.away,
      })),
    );
  }

  private run(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.inFlight) {
      // The request in flight carries older values: send again when it lands.
      this.again = true;
      return this.inFlight;
    }
    if (this.pending.size === 0) {
      if (this.stateValue === "pending") this.setState("saved");
      return Promise.resolve();
    }
    // The session is no longer the account's (`canSend`): a send now would
    // save these changes as someone else's, or as nobody's. They wait, in the
    // drafts, for the account they belong to.
    if (this.options.canSend?.() === false) return Promise.resolve();
    const batch = [...this.pending].slice(0, MAX_ITEMS_PER_SAVE);
    const sent = new Map(batch.map(([fixtureId, entry]) => [fixtureId, entry.version]));
    this.setState("saving");
    this.inFlight = this.options
      .send(batch.map(([fixtureId, entry]) => ({ fixtureId, home: entry.home, away: entry.away })))
      .then(
        (response) => this.onResponse(response, sent),
        (error: unknown) => this.onFailure(error),
      )
      .finally(() => {
        this.inFlight = null;
        if (this.disposed) return;
        if (this.stateValue === "offline" || this.stateValue === "error") return;
        if (this.again || this.pending.size > 0) {
          this.again = false;
          if (this.timer === null) this.schedule(0);
        } else {
          this.setState("saved");
        }
      });
    return this.inFlight;
  }

  private onResponse(response: SavePredictionsDto, sent: ReadonlyMap<string, number>): void {
    this.retries = 0;
    const locked: SaveResultDto[] = [];
    for (const result of response.results) {
      const entry = this.pending.get(result.fixtureId);
      if (result.status === "locked" || result.status === "not_eligible") {
        // Refused for good: the database's value stands.
        this.pending.delete(result.fixtureId);
        locked.push(result);
      } else if (entry && entry.version === sent.get(result.fixtureId)) {
        // Unchanged since it was sent: confirmed. A newer tap stays queued.
        this.pending.delete(result.fixtureId);
      }
    }
    this.persistDrafts();
    this.options.onSaved?.(response.results, response.serverTime);
    if (locked.length > 0) this.options.onLocked?.(locked);
  }

  private onFailure(error: unknown): void {
    const mapped = mapPredictionsError(error);
    this.options.onError?.(mapped);
    if (mapped.retryable) {
      this.setState("offline");
      const delay = RETRY_DELAYS_MS[Math.min(this.retries, RETRY_DELAYS_MS.length - 1)]!;
      this.retries += 1;
      this.schedule(delay);
    } else {
      // Unavailable, banned, signed out, a refused payload: retrying as is
      // cannot help. The changes stay queued for "Réessayer".
      this.setState("error");
    }
  }
}
