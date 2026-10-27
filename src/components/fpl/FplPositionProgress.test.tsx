import { describe, expect, it } from "bun:test";
import "@/services/__test-shim";
import { renderToString } from "react-dom/server";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { FplPositionProgress, positionProgress } from "./FplPositionProgress";

const slot = (position: "GK" | "DEF" | "MID" | "FWD", filled: boolean) => ({
  position,
  player: filled ? {} : null,
});

describe("position progress", () => {
  const slots = [
    slot("GK", true),
    slot("GK", false),
    slot("DEF", true),
    slot("DEF", true),
    slot("DEF", false),
    slot("MID", true),
    slot("FWD", true),
    slot("FWD", true),
  ];

  it("counts filled and required places per position from the slots", () => {
    expect(positionProgress(slots)).toEqual([
      { position: "GK", filled: 1, required: 2 },
      { position: "DEF", filled: 2, required: 3 },
      { position: "MID", filled: 1, required: 1 },
      { position: "FWD", filled: 2, required: 2 },
    ]);
  });

  it("says complet for a full position and reste N for the others", () => {
    const html = renderToString(
      <I18nProvider>
        <FplPositionProgress items={positionProgress(slots)} />
      </I18nProvider>,
    ).replace(/<!-- -->/g, "");
    const fr = dictionaries.fr;
    expect(html).toContain(fr["fantasy.create.progress.done"]);
    expect(html).toContain(fr["fantasy.create.progress.left"].replace("{n}", "1"));
    expect(html.match(/data-done/g)?.length).toBe(2);
  });
});

describe("picker dictionary lines", () => {
  it("has the same placeholders in French and Arabic", () => {
    for (const key of [
      "fantasy.create.next_remaining",
      "fantasy.create.per_place",
      "fantasy.create.progress.left",
      "fantasy.create.locked",
      "fantasy.create.enrolment_next",
    ] as const) {
      const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(holes(dictionaries.ar[key])).toBe(holes(dictionaries.fr[key]));
    }
  });
});
