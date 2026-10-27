import { describe, expect, it } from "bun:test";

import { frCore } from "./dictionary-fr-core";
import { frRest } from "./dictionary-fr-rest";
import { fr } from "./dictionary-fr";
import { splitPlan } from "../../scripts/qa/i18n-split";

describe("the French dictionary in two parts", () => {
  it("holds every key once, in one part", () => {
    const core = Object.keys(frCore);
    const rest = Object.keys(frRest);
    expect(core.filter((key) => key in frRest)).toEqual([]);
    expect(Object.keys(fr).length).toBe(core.length + rest.length);
  });

  it("keeps in the first part every key the home page's code can ask for", () => {
    // Fix with `bun scripts/qa/i18n-split.ts --write`.
    expect(splitPlan().misplaced).toEqual([]);
  });
});
