// The French dictionary as the running app holds it.
//
// Every page is first rendered in French, so the first part of the dictionary
// (dictionary-fr-core.ts: what the home page and the shell can ask for) ships
// with the app. The second part (dictionary-fr-rest.ts) is fetched by
// `loadFrenchRest()` and must be in before a page other than the home page is
// rendered or hydrated: the router waits for it (`router.tsx` for the first
// load, `__root.tsx` for later navigations), and the warm-up fetches it once
// the home page has settled (`SectionWarmup`). The server and the tests hold
// the whole dictionary from the start, so the HTML the server sends is the
// same as before the split.
import { frCore } from "./dictionary-fr-core";
import { frRest } from "./dictionary-fr-rest";

type Dictionary = Readonly<Record<string, string>>;

// `import.meta.env.SSR` and `process.env.NODE_ENV` are constants in a browser
// build, so there the static import of the second part is dropped from the
// bundle and only the dynamic one below remains.
const EAGER = import.meta.env.SSR || process.env.NODE_ENV === "test";

let rest: Dictionary | null = EAGER ? frRest : null;
let whole: Dictionary = rest ? { ...frCore, ...rest } : frCore;
let pending: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

/** The French dictionary as far as it has arrived (all of it on the server). */
export function frenchDictionary(): Dictionary {
  return whole;
}

export function isFrenchComplete(): boolean {
  return rest !== null;
}

/** Fetches the second part once; a failed fetch can be asked for again. */
export function loadFrenchRest(): Promise<void> {
  if (rest) return Promise.resolve();
  pending ??= import("./dictionary-fr-rest").then(
    (module) => {
      rest = module.frRest;
      whole = { ...frCore, ...rest };
      version += 1;
      for (const listener of listeners) listener();
    },
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}

/**
 * Waits for the second part when `pathname` is a page that may use it. In the
 * browser only; the home page (`/`) is the one page the first part covers.
 */
export function frenchReadyFor(pathname: string): Promise<void> {
  if (typeof window === "undefined" || pathname === "/") return Promise.resolve();
  return loadFrenchRest();
}

export function subscribeFrench(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function frenchVersion(): number {
  return version;
}
