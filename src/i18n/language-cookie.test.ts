import { describe, expect, it } from "bun:test";
import {
  LANGUAGE_COOKIE,
  languageCookieString,
  languageForRequest,
  languageFromAcceptLanguage,
  languageFromCookieHeader,
} from "./language-cookie";

describe("the language cookie (FE-H1)", () => {
  it("is read among other cookies", () => {
    expect(languageFromCookieHeader(`a=1; ${LANGUAGE_COOKIE}=ar; b=2`)).toBe("ar");
    expect(languageFromCookieHeader(`${LANGUAGE_COOKIE}=fr`)).toBe("fr");
  });

  it("ignores a missing or unknown value", () => {
    expect(languageFromCookieHeader(undefined)).toBeNull();
    expect(languageFromCookieHeader("a=1")).toBeNull();
    expect(languageFromCookieHeader(`${LANGUAGE_COOKIE}=en`)).toBeNull();
  });

  it("is written for the whole site, for a year, and Secure over https", () => {
    expect(languageCookieString("ar", true)).toBe(
      `${LANGUAGE_COOKIE}=ar; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    );
    expect(languageCookieString("fr", false)).not.toContain("Secure");
  });
});

describe("the browser's preference", () => {
  it("picks Arabic when it ranks above French, in any region", () => {
    expect(languageFromAcceptLanguage("ar-MA,ar;q=0.9,fr;q=0.8")).toBe("ar");
    expect(languageFromAcceptLanguage("en-US,ar;q=0.7,fr;q=0.5")).toBe("ar");
  });

  it("picks French when it ranks above Arabic, or first among equals", () => {
    expect(languageFromAcceptLanguage("fr-FR,fr;q=0.9,ar;q=0.8")).toBe("fr");
    expect(languageFromAcceptLanguage("fr,ar")).toBe("fr");
  });

  it("names neither when the browser asks for neither", () => {
    expect(languageFromAcceptLanguage("en-US,en;q=0.9")).toBeNull();
    expect(languageFromAcceptLanguage("ar;q=0")).toBeNull();
    expect(languageFromAcceptLanguage(undefined)).toBeNull();
  });
});

describe("the language a page is drawn in", () => {
  it("is the cookie first, then the browser, then French", () => {
    expect(languageForRequest(`${LANGUAGE_COOKIE}=fr`, "ar")).toBe("fr");
    expect(languageForRequest(undefined, "ar-MA")).toBe("ar");
    expect(languageForRequest(undefined, "en")).toBe("fr");
    expect(languageForRequest(undefined, undefined)).toBe("fr");
  });
});
