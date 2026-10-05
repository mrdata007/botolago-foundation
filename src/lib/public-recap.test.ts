import { describe, expect, test } from "bun:test";

import { dictionaries } from "@/i18n/dictionaries";
import { PUBLIC_RECAP_META, publicRecapPath, publicRecapUrl } from "./public-recap";

describe("public recap links", () => {
  test("live under /journee/, with ?lang=ar only for Arabic", () => {
    expect(publicRecapPath("Q6ca7Y2qOKt683etPF0qdQ")).toBe("/journee/Q6ca7Y2qOKt683etPF0qdQ");
    expect(publicRecapUrl("Q6ca7Y2qOKt683etPF0qdQ", "fr", "https://botolago.com")).toBe(
      "https://botolago.com/journee/Q6ca7Y2qOKt683etPF0qdQ",
    );
    expect(publicRecapUrl("Q6ca7Y2qOKt683etPF0qdQ", "ar", "https://botolago.com")).toBe(
      "https://botolago.com/journee/Q6ca7Y2qOKt683etPF0qdQ?lang=ar",
    );
  });

  test("the preview strings are the dictionaries' own, in both languages", () => {
    for (const lang of ["fr", "ar"] as const) {
      const d = dictionaries[lang];
      expect(PUBLIC_RECAP_META[lang]).toEqual({
        title: d["fantasy.recap.page.meta_title"],
        titleGeneric: d["fantasy.recap.page.meta_title_generic"],
        description: d["fantasy.recap.page.meta_description"],
        unitOne: d["fantasy.points.unit_one"],
        unitOther: d["fantasy.points.unit_other"],
      });
    }
  });
});
