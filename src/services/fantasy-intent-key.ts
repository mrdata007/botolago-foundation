import { useRef } from "react";

/**
 * The idempotency key of one thing the manager asked for.
 *
 * The owned writes used to mint a key per attempt, so a save the server had
 * committed but whose answer never arrived (a timeout, a dropped connection)
 * was sent again under a new key against a version that had moved on, and
 * refused as a conflict. The key now belongs to the intent -- the team, the
 * version it started from and exactly what is being written -- so a retry of
 * the same intent sends the same key and the server answers it again from
 * its idempotency record. Any change to the intent, or a success, starts a
 * new key.
 */
export class IntentKey {
  private current: { intent: string; key: string } | null = null;

  constructor(private readonly mint: () => string = () => crypto.randomUUID()) {}

  /** The key for `intent`: the same one for as long as the intent is unchanged. */
  for(intent: unknown): string {
    const serialized = JSON.stringify(intent);
    if (this.current?.intent !== serialized) {
      this.current = { intent: serialized, key: this.mint() };
    }
    return this.current.key;
  }

  /** After a success: the next write is a new intent, whatever it holds. */
  clear(): void {
    this.current = null;
  }
}

/** An `IntentKey` that lives as long as the screen. */
export function useIntentKey(): IntentKey {
  const ref = useRef<IntentKey | null>(null);
  ref.current ??= new IntentKey();
  return ref.current;
}
