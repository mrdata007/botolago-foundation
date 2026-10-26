import { describe, expect, test } from "bun:test";
import { documentLanguageFromMatches } from "@/lib/document-language";

const root = { routeId: "__root__", loaderData: undefined };

describe("documentLanguageFromMatches", () => {
  test("an Arabic article edition is an Arabic, right-to-left document", () => {
    expect(
      documentLanguageFromMatches([
        root,
        { routeId: "/news/$articleId", loaderData: { language: "ar" } },
      ]),
    ).toEqual({ lang: "ar", dir: "rtl" });
  });

  test("a French edition, an unavailable article and every other route stay French", () => {
    for (const matches of [
      [root, { routeId: "/news/$articleId", loaderData: { language: "fr" } }],
      [root, { routeId: "/news/$articleId", loaderData: { unavailable: true } }],
      [root, { routeId: "/news/$articleId", loaderData: undefined }],
      [root, { routeId: "/matches", loaderData: { language: "ar" } }],
      [root],
    ]) {
      expect(documentLanguageFromMatches(matches)).toEqual({ lang: "fr", dir: "ltr" });
    }
  });
});
