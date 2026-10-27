import { useEffect } from "react";

/**
 * Puts the reader's own-language title on the tab once the page is mounted.
 *
 * A route's `head()` runs without the reader's language (the server cannot see
 * `localStorage`), so it can only serve the French title. Pass the title the
 * reader's dictionary gives (`useReaderDocumentTitle(t("meta.home_title"))`;
 * the literal key keeps it visible to the i18n usage audit) and it is set
 * after mount, and again when the language changes, the way
 * `pepites.index.tsx` does. French readers get the same string `head()`
 * already served.
 */
export function useReaderDocumentTitle(title: string) {
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
}
