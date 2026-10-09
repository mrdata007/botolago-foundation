/**
 * Which development fixture a page load asks for (plan section 7.7): `?mc=<id>` on any URL of a
 * development build. The server render reads it from the request; the browser keeps it in
 * `sessionStorage` on first load so client navigations (which drop the query string) keep the
 * same fixture. This file holds the selection only, never a fixture, so it is safe to import
 * from code a production build keeps; every caller sits behind `import.meta.env.DEV` anyway.
 */
export const FIXTURE_PARAM = "mc";
export const FIXTURE_STORAGE_KEY = "botolago.mc.fixture";

/** The fixture id in a search string ("?mc=rated&x=1" or "mc=rated"), or null. */
export function fixtureIdFromSearch(search: string | null | undefined): string | null {
  if (!search) return null;
  const value = new URLSearchParams(search).get(FIXTURE_PARAM);
  return value && /^[A-Za-z0-9_-]{1,40}$/.test(value) ? value : null;
}

/**
 * The fixture id of the page in the browser: the query string if it names one (and remembered for
 * the session), else what the session remembered, else null (the caller picks its default).
 * Every storage access is guarded: blocked storage just forgets between navigations.
 */
export function currentFixtureId(): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = fixtureIdFromSearch(window.location.search);
  try {
    if (fromUrl) {
      window.sessionStorage.setItem(FIXTURE_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return fixtureIdFromSearch(
      `?${FIXTURE_PARAM}=${window.sessionStorage.getItem(FIXTURE_STORAGE_KEY) ?? ""}`,
    );
  } catch {
    return fromUrl;
  }
}
