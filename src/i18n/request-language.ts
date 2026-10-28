import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Language } from "@/types/domain";
import { languageForRequest } from "./language-cookie";

/**
 * The language the page is drawn in at first (FE-H1).
 *
 * On the server, it comes from the request: the language cookie, else the
 * browser's `Accept-Language`, else French (`language-cookie.ts`). In the
 * browser, it is what the server drew: the `lang` of the page's `<html>`,
 * which the router's hydrate step has already waited on (it loads the Arabic
 * words before the browser takes the page over, `src/router.tsx`), so the
 * first render in the browser repeats the server's, word for word.
 */
export const requestLanguage = createIsomorphicFn()
  .server((): Language => {
    try {
      return languageForRequest(getRequestHeader("cookie"), getRequestHeader("accept-language"));
    } catch {
      // Outside a request (a unit test calling a loader): the site's default.
      return "fr";
    }
  })
  .client((): Language => (document.documentElement.lang === "ar" ? "ar" : "fr"));
