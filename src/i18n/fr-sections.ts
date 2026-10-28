import { frCore } from "./dictionary-fr-core";
import { retryableImport, type RetryableImport } from "./retryable-import";

/**
 * The French dictionary is in parts. `dictionary-fr-core.ts` ships with every
 * page; the rest is in sections (`fr-sections/`), one file each, that a page
 * loads before it renders. Every page used to carry the whole dictionary: the
 * Fantasy, Plus and Pépites copy was about half of it, in the first load of a
 * reader who came for the news (audit 2026-10-28).
 *
 * HOW A SECTION ARRIVES
 *
 *   - Server: the layout route of a section (`loader`) awaits it before the
 *     page renders, so every key is there when React renders the HTML.
 *   - Browser, first load: the router waits for `hydrate` (`router.tsx`), which
 *     loads the sections of the address before React hydrates, so the first
 *     render is the HTML the server sent.
 *   - Browser, navigation (and a preload): the same `loader` runs before the
 *     new page is shown. A page never renders with a section missing.
 *   - The layout also imports its sections and hands them over
 *     (`provideFrSection`), which makes them part of its chunk: the HTML
 *     preloads them with the layout, so a first load does not wait for the
 *     entry to run before it asks for them. The loader and `hydrate` stay as
 *     the guarantee; the import is the speed.
 *
 * WHICH SECTIONS A PAGE NEEDS is `SECTIONS_BY_PATH` below, by address. It is
 * checked against what each route file really uses by `fr-sections.test.ts`,
 * so a key added to a page without its section fails a test instead of
 * showing its name to a reader.
 *
 * Arabic is not in sections: it is one dictionary, fetched when the reader
 * chooses it (`provider.tsx`). The sections are French only, and they are
 * loaded in Arabic too, so that going back to French is instant.
 */
export type FrSectionName = "fantasy" | "plus" | "pepites" | "prizes" | "predictions";

type Dictionary = Readonly<Record<string, string>>;

/**
 * The sections an address needs: every route under `prefix` loads them. An
 * address under none of these needs none (the core dictionary is enough).
 */
export const SECTIONS_BY_PATH: readonly (readonly [prefix: string, FrSectionName[]])[] = [
  ["/fantasy", ["fantasy", "plus", "prizes", "predictions"]],
  ["/pronostics", ["predictions"]],
  ["/pepites", ["pepites"]],
  ["/curva", ["plus"]],
  ["/plus", ["plus"]],
  ["/prizes", ["prizes"]],
  ["/admin", ["prizes"]],
];

// One `retryableImport` per section: a chunk that failed to arrive is asked
// for again (the router's "Réessayer" runs `beforeLoad` again), not replayed
// from the failure. The specifier is written out in each importer, because
// the retry recovers the chunk's address from it (`retryable-import.ts`).
const imports: Record<FrSectionName, RetryableImport<Dictionary>> = {
  fantasy: retryableImport(() => import("./fr-sections/fantasy").then((m) => m.frFantasy), {
    base: import.meta.url,
  }),
  plus: retryableImport(() => import("./fr-sections/plus").then((m) => m.frPlus), {
    base: import.meta.url,
  }),
  pepites: retryableImport(() => import("./fr-sections/pepites").then((m) => m.frPepites), {
    base: import.meta.url,
  }),
  prizes: retryableImport(() => import("./fr-sections/prizes").then((m) => m.frPrizes), {
    base: import.meta.url,
  }),
  predictions: retryableImport(
    () => import("./fr-sections/predictions").then((m) => m.frPredictions),
    { base: import.meta.url },
  ),
};

/** Every section that has arrived, merged. Strings never change once here. */
const loaded: Record<string, string> = Object.create(null) as Record<string, string>;
const arrived = new Set<FrSectionName>();

/** The sections an address needs (see `SECTIONS_BY_PATH`). */
export function frSectionsForPath(pathname: string): FrSectionName[] {
  const wanted = new Set<FrSectionName>();
  for (const [prefix, names] of SECTIONS_BY_PATH) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`))
      names.forEach((n) => wanted.add(n));
  }
  return [...wanted];
}

/**
 * A section handed over by a module that imports it itself: the layout of the
 * pages that use it. The import makes the section a dependency of that
 * layout's chunk, so the server's HTML preloads it with the layout and the
 * browser has it in the same round trip, instead of asking for it after the
 * entry has run (the loader and the router's `hydrate` would otherwise be the
 * only way it arrives, one request later). Idempotent, and a no-op once the
 * section is here by either way.
 */
export function provideFrSection(name: FrSectionName, dictionary: Dictionary): void {
  if (arrived.has(name)) return;
  Object.assign(loaded, dictionary);
  arrived.add(name);
}

/** Loads one section; resolves at once when it is already here. */
export async function loadFrSection(name: FrSectionName): Promise<void> {
  if (arrived.has(name)) return;
  const dictionary = await imports[name].load();
  Object.assign(loaded, dictionary);
  arrived.add(name);
}

/** Loads the sections an address needs, together. */
export function loadFrSectionsForPath(pathname: string): Promise<void> {
  const names = frSectionsForPath(pathname).filter((name) => !arrived.has(name));
  if (names.length === 0) return Promise.resolve();
  return Promise.all(names.map(loadFrSection)).then(() => undefined);
}

/** Whether a section has arrived. */
export function isFrSectionLoaded(name: FrSectionName): boolean {
  return arrived.has(name);
}

/**
 * A French string by key: the core dictionary first, then the sections that
 * have arrived. `undefined` for a key neither holds (the caller shows the key,
 * as it always has).
 */
export function frText(key: string): string | undefined {
  return (frCore as Readonly<Record<string, string>>)[key] ?? loaded[key];
}
