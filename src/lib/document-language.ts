/**
 * The language and direction the server writes on `<html>`.
 *
 * Every page is French and left-to-right except an article edition's page:
 * an Arabic edition is an Arabic document (`lang="ar" dir="rtl"`) from the
 * first byte, whatever the reader's interface language, because the edition's
 * language is a property of the edition (docs/engineering/LANGUAGE_URLS.md).
 * The route's loader data carries `language` for an article; anything else
 * (other routes, an unavailable article) stays French.
 */
export const ARTICLE_ROUTE_ID = "/news/$articleId";

export interface DocumentLanguage {
  readonly lang: "fr" | "ar";
  readonly dir: "ltr" | "rtl";
}

export function documentLanguageFromMatches(
  matches: readonly { readonly routeId: string; readonly loaderData?: unknown }[],
): DocumentLanguage {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    if (match.routeId !== ARTICLE_ROUTE_ID) continue;
    const language = (match.loaderData as { language?: unknown } | null | undefined)?.language;
    if (language === "ar") return { lang: "ar", dir: "rtl" };
    break;
  }
  return { lang: "fr", dir: "ltr" };
}
