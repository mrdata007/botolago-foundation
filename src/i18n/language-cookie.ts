import type { Language } from "@/types/domain";

/**
 * The reader's language, as a cookie the server can read (FE-H1).
 *
 * The choice has always been kept in `localStorage` (`botolago.language`),
 * which only the browser can read, so the server drew every page in French and
 * an Arabic reader watched it turn into Arabic, right to left, once the app
 * had started and the Arabic words had downloaded: the whole page jumped
 * (layout shift 0.90 on the home page). The cookie carries the same choice to
 * the server, which then sends the page in Arabic from the first byte.
 *
 * `localStorage` stays the reader's record of the choice: the cookie is
 * written from it (on every visit, so a choice made before the cookie existed
 * reaches the server from the next page on) and whenever the language changes.
 */
export const LANGUAGE_COOKIE = "botolago_lang";

/** A year: the choice is the reader's until they change it. */
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function asLanguage(value: string | undefined | null): Language | null {
  return value === "fr" || value === "ar" ? value : null;
}

/** The language a `Cookie` header names, if any. */
export function languageFromCookieHeader(header: string | null | undefined): Language | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LANGUAGE_COOKIE) return asLanguage(rest.join("=").trim());
  }
  return null;
}

/**
 * The language of an `Accept-Language` header: Arabic when the browser ranks
 * Arabic (any region) above French, French otherwise, and null when it names
 * neither. Only a first visit gets here; the chooser still opens on it.
 */
export function languageFromAcceptLanguage(header: string | null | undefined): Language | null {
  if (!header) return null;
  let best: Language | null = null;
  let bestQ = 0;
  for (const entry of header.split(",")) {
    const [tag, ...params] = entry.trim().toLowerCase().split(";");
    const primary = asLanguage(tag.split("-")[0]);
    if (!primary) continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    // The first of equal rank wins: browsers list preferences in order.
    if (Number.isFinite(q) && q > bestQ) {
      best = primary;
      bestQ = q;
    }
  }
  return best;
}

/**
 * The language to draw a page in, from the request: the cookie, else the
 * browser's preference, else French (the site's default, as before).
 */
export function languageForRequest(
  cookieHeader: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Language {
  return (
    languageFromCookieHeader(cookieHeader) ?? languageFromAcceptLanguage(acceptLanguage) ?? "fr"
  );
}

/** The `document.cookie` assignment that records `lang`. */
export function languageCookieString(lang: Language, secure: boolean): string {
  return `${LANGUAGE_COOKIE}=${lang}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${
    secure ? "; Secure" : ""
  }`;
}

/** Records `lang` in the cookie, in the browser; does nothing on the server. */
export function writeLanguageCookie(lang: Language): void {
  if (typeof document === "undefined") return;
  try {
    if (languageFromCookieHeader(document.cookie) === lang) return;
    document.cookie = languageCookieString(lang, window.location.protocol === "https:");
  } catch {
    // Cookies blocked: the page keeps working, drawn in French by the server.
  }
}
