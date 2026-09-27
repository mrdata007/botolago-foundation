import { describe, expect, it } from "bun:test";

import { formatNumber, movementText, positionLabel, scoreText } from "./pepites-format";

describe("Pépites formatting", () => {
  it("writes numbers in Latin digits in both languages, never with a space inside", () => {
    expect(formatNumber(1240, "fr")).toBe("1240");
    expect(formatNumber(1240, "ar")).toBe("1240");
    expect(formatNumber(7.456, "fr", 2)).toBe("7,46");
    expect(formatNumber(7.456, "ar", 2)).toMatch(/^7.46$/);
  });

  it("says N.C. for a player with no score", () => {
    expect(scoreText(87.6, "fr", "N.C.")).toBe("88");
    expect(scoreText(null, "fr", "N.C.")).toBe("N.C.");
    expect(scoreText(Number.NaN, "fr", "N.C.")).toBe("N.C.");
  });

  it("describes last week's move", () => {
    const labels = { up: "↑", down: "↓", same: "=", new: "Nouveau" };
    expect(movementText({ kind: "up", by: 3 }, labels)).toBe("↑ 3");
    expect(movementText({ kind: "new" }, labels)).toBe("Nouveau");
    expect(movementText(null, labels)).toBeNull();
  });

  it("names each position with its own key", () => {
    const t = (key: string) => key;
    expect(positionLabel("GK", t as never)).toBe("pepites.position.gk");
    expect(positionLabel("FWD", t as never)).toBe("pepites.position.fwd");
  });
});
